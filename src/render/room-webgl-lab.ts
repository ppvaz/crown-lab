
import type { Arena, World } from '../sim/types';
import type { Camera } from './iso';
import { ELEVATION_Y, ISO_X, ISO_Y, worldToScreenAtElevation } from './iso';
import { RESPONSE, flickerDepth, lampFlicker, lean, roomResponse } from './room-light-lab';
import type { Ripple } from './room-liquid-lab';
import { LIQUID, RIPPLE_SLOTS, createLiquidSurface, dripsAt } from './room-liquid-lab';
import { WEATHER, currentWeather, filmStrength, rainAt } from './room-weather-lab';
import type { RoomLayerPainter, SortedOccluder } from './room-package-lab';
import type {
  LoadedRoomMesh,
  Light,
  Mass,
  Range,
  RGB,
  RoomMeshSource,
  SurfaceDescription,
} from './room-mesh-lab';
import { loadRoomMesh } from './room-mesh-lab';


const DEPTH_RANGE = 48;

export const isoProjection = (cam: Camera): Float32Array => {
  const ex = ISO_X * cam.zoom;
  const ey = ISO_Y * cam.zoom;
  const ez = ELEVATION_Y * cam.zoom;
  const w = cam.width;
  const h = cam.height;
  const a = w / 2 + cam.offset.x + cam.shake.x - cam.center.x * ex + cam.center.y * ex;
  const b = h / 2 + cam.offset.y + cam.shake.y - cam.center.y * ey - cam.center.x * ey;
  const d = -1 / DEPTH_RANGE;
  return new Float32Array([
    (2 * ex) / w, (-2 * ey) / h, d, 0,
    (-2 * ex) / w, (-2 * ey) / h, d, 0,
    0, (2 * ez) / h, d, 0,
    (2 * a) / w - 1, 1 - (2 * b) / h, 0, 1,
  ]);
};


export const ROOM_ABLATION_AXES = [
  'liquid',
  'ripples',
  'reflection',
  'lights',
  'masonry',
  'textures',
  'msaa',
] as const;
export type RoomAblationAxis = (typeof ROOM_ABLATION_AXES)[number];

export const ROOM_SCALE_STEPS = [1, 0.75, 0.5] as const;
let roomScale: number = ROOM_SCALE_STEPS[0];
export const currentRoomScale = (): number => roomScale;
export const setRoomScale = (value: number): number => {
  roomScale = ROOM_SCALE_STEPS.includes(value as (typeof ROOM_SCALE_STEPS)[number])
    ? value
    : ROOM_SCALE_STEPS[0];
  return roomScale;
};


const vert = (count: number, lightCount: number): string => `#version 300 es
in vec3 aPos;
in vec3 aNrm;
in vec3 aCol;
in float aSrf;
uniform mat4 uProj;
uniform float uTime;
uniform vec3 uLightPos[${lightCount}];
uniform float uFlameSway[${lightCount}];
out vec3 vPos;
out vec3 vNrm;
out vec3 vCol;
out float vSrf;

const int LAMP_BASE = ${count};

void main() {
  vec3 pos = aPos;
  int s = int(aSrf + 0.5);
  if (s >= LAMP_BASE) {
    int lamp = s - LAMP_BASE;
    float lift = clamp((aPos.z - (uLightPos[lamp].z - 0.35)) / 0.9, 0.0, 1.4);
    lift *= lift;
    float phase = float(lamp) * 2.3;
    float sway = uFlameSway[lamp] * lift;
    pos.x += sway * (sin(uTime * 5.1 + phase) * 0.62 + sin(uTime * 11.7 + phase * 1.7) * 0.38);
    pos.y += sway * (cos(uTime * 6.3 + phase * 0.8) * 0.58 + cos(uTime * 13.1 + phase) * 0.42);
    pos.z += sway * 0.55 * sin(uTime * 8.9 + phase * 1.3);
  }
  vPos = pos;
  vNrm = aNrm;
  vCol = aCol;
  vSrf = aSrf;
  gl_Position = uProj * vec4(pos, 1.0);
}`;

const KIND_INDEX: Readonly<Record<string, number>> = {
  plain: 0, ashlar: 1, flagstone: 2, metal: 3, flame: 4,
};

const glslVec3 = (v: RGB): string => `vec3(${v.map((n) => n.toFixed(5)).join(', ')})`;

const frag = (
  lightCount: number,
  surfaces: readonly SurfaceDescription[],
  ambient: RGB,
  ablate: ReadonlySet<RoomAblationAxis> = new Set(),
  features: { liquid?: boolean } = {},
): string => {
  const count = surfaces.length;
  const list = (values: readonly string[]): string => values.join(',\n  ');
  const textureCount = surfaces.reduce(
    (highest, surface) => Math.max(highest, (surface.texture?.slot ?? -1) + 1),
    0,
  );
  const textured = textureCount > 0 && !ablate.has('textures');
  const liquidEnabled = features.liquid === true && !ablate.has('liquid');
  const textureUniforms = textured
    ? Array.from({ length: textureCount }, (_, i) => `uniform sampler2D uTexture${i};`).join('\n')
    : '';
  const textureCases = textured
    ? Array.from(
        { length: textureCount },
        (_, i) => `  if (slot == ${i}) return texture(uTexture${i}, uv).rgb;`,
      ).join('\n')
    : '';
  return `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNrm;
in vec3 vCol;
in float vSrf;

uniform vec3 uLightPos[${lightCount}];
uniform vec3 uLightCol[${lightCount}];
/** Where each lamp's own body is leaning, and how far. Separate from what it casts. */
uniform vec3 uLampTint[${lightCount}];
/** (blend toward the tint, gain). See \`lean\`. */
uniform vec2 uLampMix[${lightCount}];

/** Rings on the water: (world x, world y, age in seconds, strength). Strength 0 is an empty slot. */
uniform vec4 uRipples[${RIPPLE_SLOTS}];
/** Master strength of the film, 0 for a dry floor. */
uniform float uLiquid;
/** How hard it is raining, 0..1. Drives the chop, and nothing else in here. */
uniform float uRain;
/**
 * Simulation seconds, for the chop.
 *
 * Declared here as well as in the vertex shader, because they are two separate programs sharing one
 * uniform name and neither inherits the other's declarations. Omitting it does not fail as a
 * missing clock — the fragment shader does not *compile*, the program does not link, and
 * createWebglRoom reports and returns null, so the room falls silently back to its primitives and
 * looks like a room the whole time. That is asset-registry.ts's named defect shape arriving through
 * a shader, and it reached a phone before it was noticed.
 *
 * (No backticks in here: this is inside a template literal. The same note is on the sky above.)
 */
uniform float uTime;
${textureUniforms}

const int LAMP_BASE = ${count};
const int KIND[${count}] = int[${count}](
  ${list(surfaces.map((s) => String(KIND_INDEX[s.kind] ?? 0)))});
const vec2 BLOCK[${count}] = vec2[${count}](
  ${list(surfaces.map((s) => `vec2(${(s.block?.[0] ?? 1).toFixed(4)}, ${(s.block?.[1] ?? 1).toFixed(4)})`))});
const vec3 JOINT[${count}] = vec3[${count}](
  ${list(surfaces.map((s) => glslVec3(s.joint ?? s.colour)))});
const float MORTAR[${count}] = float[${count}](
  ${list(surfaces.map((s) => (s.mortar ?? 0.02).toFixed(5)))});
${textured ? `const int TEXTURE_SLOT[${count}] = int[${count}](
  ${list(surfaces.map((s) => String(s.texture?.slot ?? -1)))});
const vec2 TEXTURE_WORLD[${count}] = vec2[${count}](
  ${list(surfaces.map((s) => `vec2(${(s.texture?.worldSize[0] ?? 1).toFixed(4)}, ${(s.texture?.worldSize[1] ?? 1).toFixed(4)})`))});
const float TEXTURE_MIX[${count}] = float[${count}](
  ${list(surfaces.map((s) => (s.texture?.strength ?? 0).toFixed(4)))});
const vec3 TEXTURE_TINT[${count}] = vec3[${count}](
  ${list(surfaces.map((s) => glslVec3(s.texture?.tint ?? [1, 1, 1])))});` : ''}

out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

${textured ? `vec2 surfaceUv(vec3 n, vec3 p) {
  vec3 a = abs(n);
  return a.z > max(a.x, a.y) ? p.xy : (a.x > a.y ? vec2(p.y, p.z) : vec2(p.x, p.z));
}

vec3 surfaceTexture(int slot, vec2 uv) {
${textureCases}
  return vec3(1.0);
}` : ''}

/**
 * One course of masonry: a block, a joint around it, and a little value per block.
 *
 * The plane is chosen by the face's own normal, so a wall is coursed horizontally and the play
 * plane is laid in a grid — the same pattern is wrong on both if it is only ever in one plane.
 * Every other course is offset by half a block: a running bond is what stops a wall reading as
 * tiling, and it costs one \`mod\`.
 */
vec3 coursed(vec3 albedo, int s, vec3 n, vec3 p) {
  vec2 block = BLOCK[s];
  vec3 a = abs(n);
  vec2 uv = a.z > max(a.x, a.y) ? p.xy : (a.x > a.y ? vec2(p.y, p.z) : vec2(p.x, p.z));
  float row = floor(uv.y / block.y);
  float u = uv.x / block.x + 0.5 * mod(row, 2.0);
  float v = uv.y / block.y;
  vec2 f = vec2(fract(u), fract(v));
  float w = max(max(fwidth(u), fwidth(v)), 1e-4);
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float line = 1.0 - smoothstep(MORTAR[s] - w, MORTAR[s] + w, edge);
  vec3 face = albedo * (0.86 + 0.28 * hash(vec2(floor(u), row)));
  return mix(face, JOINT[s], line);
}

/**
 * The chop heavy rain puts on the film, as a slope — never as more rings.
 *
 * \`uRipples\` has twelve slots and they belong to the footfalls: a ring under a boot is the thing a
 * player reads, and feeding a rainstorm into a twelve-deep ring buffer would evict every one of
 * them within a frame and leave the water saying nothing about who is walking on it. So dense rain
 * is a *field* instead of an event list — one dimple per cell, its centre and its phase hashed off
 * the cell, and the whole storm costs no uniform and no CPU state at all.
 *
 * One cell is sampled and not nine, which is affordable only because the dimple is *contained*: the
 * centre sits in the middle 30% of the cell and the wavefront reaches 0.3 of a cell, so a ring can
 * never cross into a neighbour and no seam can appear along the grid it would have been cut on.
 */
${liquidEnabled ? `vec2 rainChop(vec2 p, float t) {
  float cellSize = ${WEATHER.chopCell.toFixed(4)};
  vec2 cell = floor(p / cellSize);
  vec2 jitter = vec2(hash(cell), hash(cell + 7.31));
  vec2 centre = (cell + 0.35 + 0.3 * jitter) * cellSize;
  float age = fract(t + hash(cell + 3.7));
  vec2 d = p - centre;
  float r = length(d);
  float front = age * cellSize * 0.3;
  if (r > front || r < 0.0001) return vec2(0.0);
  float amp = (1.0 - age) * exp(-(front - r) * 6.0);
  float phase = (r - front) * ${(Math.PI * 2 / (WEATHER.chopCell * 0.5)).toFixed(5)};
  return normalize(d) * cos(phase) * amp;
}` : ''}

void main() {
  int s = int(vSrf + 0.5);

  if (s >= LAMP_BASE) {
    int lamp = s - LAMP_BASE;
    vec3 body = mix(vCol, uLampTint[lamp], uLampMix[lamp].x) * uLampMix[lamp].y;
    outColor = vec4(pow(body, vec3(1.0 / 2.2)), 1.0);
    return;
  }

  vec3 n = normalize(vNrm);
  vec3 albedo = vCol;
  int kind = KIND[s];
  ${textured ? `int textureSlot = TEXTURE_SLOT[s];
  if (textureSlot >= 0) {
    vec2 uv = surfaceUv(n, vPos) / TEXTURE_WORLD[s];
    vec3 painted = surfaceTexture(textureSlot, uv) * TEXTURE_TINT[s];
    albedo = mix(albedo, painted, TEXTURE_MIX[s]);
  }${ablate.has('masonry') ? '' : ' else if (kind == 1 || kind == 2) {\n    albedo = coursed(albedo, s, n, vPos);\n  }'}` : ablate.has('masonry') ? '' : 'if (kind == 1 || kind == 2) albedo = coursed(albedo, s, n, vPos);'}

  float wet = 0.0;
  ${liquidEnabled ? `if (uLiquid > 0.0 && kind == 2 && n.z > 0.9 && abs(vPos.z) < 0.06) {
    wet = uLiquid;
    vec2 slope = vec2(0.0);
    ${ablate.has('ripples') ? '' : `for (int i = 0; i < ${RIPPLE_SLOTS}; i++) {
      vec4 ring = uRipples[i];
      if (ring.w <= 0.0) continue;
      vec2 d = vPos.xy - ring.xy;
      float r = length(d);
      // The wavefront is at speed * age; nothing exists ahead of it. Without this the whole pond
      // starts oscillating in phase the instant a ring is born, which reads as a pulse, not a wave.
      float front = ${LIQUID.waveSpeed.toFixed(3)} * ring.z;
      if (r > front || r < 0.0001) continue;
      float phase = (r - front) * ${(Math.PI * 2 / LIQUID.waveLength).toFixed(5)};
      // Two decays, and they are different things: age is the ring dying, trail is the ring
      // being weakest at its own centre, where the water has already settled.
      float age = 1.0 - ring.z / ${(LIQUID.waveLifeMs / 1000).toFixed(4)};
      float trail = exp(-(front - r) * 1.4);
      float amp = ring.w * ${LIQUID.waveAmplitude.toFixed(4)} * max(age, 0.0) * trail;
      slope += normalize(d) * cos(phase) * amp;
    }`}
    if (uRain > 0.0) {
      slope += rainChop(vPos.xy, uTime * ${WEATHER.chopRate.toFixed(4)})
             * uRain * ${WEATHER.chop.toFixed(4)};
    }
    n = normalize(vec3(-slope.x, -slope.y, 1.0));
    albedo *= 1.0 - ${LIQUID.darken.toFixed(4)} * wet;
  }` : ''}

  vec3 lit = albedo * vec3(${ambient.map((c) => c.toFixed(6)).join(', ')});
  vec3 v = normalize(vec3(1.0, 1.0, 1.0));
  float gloss = kind == 3 ? 96.0 : 24.0;
  float spec = kind == 3 ? 0.55 : 0.06;
  ${ablate.has('lights') ? '' : `for (int i = 0; i < ${lightCount}; i++) {
    vec3 d = uLightPos[i] - vPos;
    float dist = length(d);
    vec3 l = d / max(dist, 0.001);
    float atten = 1.0 / (1.0 + 0.12 * dist * dist);
    vec3 hv = normalize(l + v);
    lit += uLightCol[i] * atten
         * (albedo * max(dot(n, l), 0.0) + pow(max(dot(n, hv), 0.0), gloss) * spec);
  }`}
  ${!liquidEnabled || ablate.has('reflection') ? '' : `if (wet > 0.0) {
    vec3 mirror = reflect(-v, n);
    for (int i = 0; i < ${lightCount}; i++) {
      vec3 d = uLightPos[i] - vPos;
      float dist = length(d);
      float atten = 1.0 / (1.0 + 0.06 * dist * dist);
      float lobe = pow(max(dot(mirror, normalize(d)), 0.0), 180.0);
      lit += uLightCol[i] * atten * lobe * ${LIQUID.reflect.toFixed(4)} * wet;
    }
  }`}
  outColor = vec4(pow(lit, vec3(1.0 / 2.2)), 1.0);
}`;
};

const compile = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error('shader could not be created');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'shader did not compile');
  }
  return shader;
};

const loadRoomTextures = async (
  source: RoomMeshSource,
  onFailure: (reason: string) => void,
): Promise<ImageBitmap[] | null> => {
  try {
    return await Promise.all((source.textures ?? []).map(async (texture) => {
      const response = await fetch(texture.url);
      if (!response.ok) throw new Error(`texture ${response.status}: ${texture.url}`);
      return createImageBitmap(await response.blob(), {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
      });
    }));
  } catch (error) {
    onFailure(error instanceof Error ? error.message : String(error));
    return null;
  }
};

export const contextScale = (ctx: CanvasRenderingContext2D): number => {
  const scale = ctx.getTransform().a;
  return Number.isFinite(scale) && scale > 0 ? Math.min(scale, 4) : 1;
};

export interface WebglRoomOptions {
  world: () => World;
  onFailure?: (reason: string) => void;
  ablate?: readonly RoomAblationAxis[];
}

export const roomShaderSources = (
  surfaces: readonly SurfaceDescription[],
  lightCount: number,
  ambient: RGB,
  ablate: ReadonlySet<RoomAblationAxis> = new Set(),
  features: { liquid?: boolean } = {},
): { vertex: string; fragment: string } => ({
  vertex: vert(surfaces.length, lightCount),
  fragment: frag(lightCount, surfaces, ambient, ablate, features),
});

const referenceEnergy = (lights: readonly Light[]): number =>
  lights.length === 0 ? 1 : Math.max(1e-6, lights[0].energy);

export const createWebglRoom = async (
  source: RoomMeshSource,
  arena: Arena,
  options: WebglRoomOptions,
): Promise<{ painter: RoomLayerPainter; occluders: SortedOccluder[] } | null> => {
  const fail = (reason: string): null => {
    options.onFailure?.(reason);
    return null;
  };

  const room = await loadRoomMesh(source, arena, (reason) => options.onFailure?.(reason));
  if (room === null) return null;
  const textureSource = options.ablate?.includes('textures')
    ? { ...source, textures: [] }
    : source;
  const textures = await loadRoomTextures(textureSource, (reason) => options.onFailure?.(reason));
  if (textures === null) return null;
  return buildRenderer(room, textures, source.liquid === true, options, fail);
};

const buildRenderer = (
  room: LoadedRoomMesh,
  textureImages: readonly ImageBitmap[],
  hasLiquid: boolean,
  options: WebglRoomOptions,
  fail: (reason: string) => null,
): { painter: RoomLayerPainter; occluders: SortedOccluder[] } | null => {
  const { lights, behind, masses, massesRange, surfaces, lightExposure } = room;
  const ablate: ReadonlySet<RoomAblationAxis> = new Set(options.ablate ?? []);

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: !ablate.has('msaa'),
    depth: true,
    premultipliedAlpha: true,
  });
  if (gl === null) return fail('no WebGL2 context');

  const sources = roomShaderSources(
    surfaces,
    lights.length,
    room.ambient,
    ablate,
    { liquid: hasLiquid },
  );
  let program: WebGLProgram;
  try {
    const created = gl.createProgram();
    if (created === null) return fail('program could not be created');
    program = created;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, sources.vertex));
    gl.attachShader(
      program,
      compile(gl, gl.FRAGMENT_SHADER, sources.fragment),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'program did not link');
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  gl.useProgram(program);

  const maxTextures = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;
  if (textureImages.length > maxTextures) {
    return fail(`room asks for ${textureImages.length} textures, WebGL exposes ${maxTextures}`);
  }
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  for (const [slot, bitmap] of textureImages.entries()) {
    const texture = gl.createTexture();
    if (texture === null) {
      for (const image of textureImages) image.close();
      return fail(`texture ${slot} could not be created`);
    }
    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform1i(gl.getUniformLocation(program, `uTexture${slot}`), slot);
    bitmap.close();
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const attribute = (name: string, data: Float32Array, size: number): void => {
    const location = gl.getAttribLocation(program, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  };
  attribute('aPos', room.pos, 3);
  attribute('aNrm', room.nrm, 3);
  attribute('aCol', room.col, 3);
  attribute('aSrf', room.srf, 1);

  const uProj = gl.getUniformLocation(program, 'uProj');
  const uTime = gl.getUniformLocation(program, 'uTime');
  const uFlameSway = gl.getUniformLocation(program, 'uFlameSway');
  const flameSway = new Float32Array(lights.length);
  const uRipples = gl.getUniformLocation(program, 'uRipples');
  const uLiquid = gl.getUniformLocation(program, 'uLiquid');
  const uRain = gl.getUniformLocation(program, 'uRain');
  const rippleData = new Float32Array(RIPPLE_SLOTS * 4);
  const liquid = createLiquidSurface();
  const uLightPos = gl.getUniformLocation(program, 'uLightPos');
  const uLightCol = gl.getUniformLocation(program, 'uLightCol');
  const uLampTint = gl.getUniformLocation(program, 'uLampTint');
  const uLampMix = gl.getUniformLocation(program, 'uLampMix');

  const lightPos = new Float32Array(lights.length * 3);
  const lightCol = new Float32Array(lights.length * 3);
  const lampTint = new Float32Array(lights.length * 3);
  const lampMix = new Float32Array(lights.length * 2);
  lights.forEach((light, i) => {
    lightPos[i * 3] = light.at.x;
    lightPos[i * 3 + 1] = light.at.y;
    lightPos[i * 3 + 2] = light.elevation;
  });
  const reference = referenceEnergy(lights);
  lights.forEach((light, i) => {
    flameSway[i] = light.energy > reference ? 0.115 : 0.032;
  });

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CW);
  gl.clearColor(0, 0, 0, 0);

  const resizeTo = (widthPx: number, heightPx: number): void => {
    if (canvas.width === widthPx && canvas.height === heightPx) return;
    canvas.width = widthPx;
    canvas.height = heightPx;
    gl.viewport(0, 0, widthPx, heightPx);
  };

  const renderPass = (cam: Camera, scale: number, range: Range): void => {
    const backing = scale * currentRoomScale();
    resizeTo(Math.round(cam.width * backing), Math.round(cam.height * backing));
    const world = options.world();
    const weather = currentWeather();
    const response = roomResponse(world, weather);

    const rings = hasLiquid ? liquid.update(world) : [];
    rippleData.fill(0);
    rings.forEach((ring: Ripple, i: number) => {
      rippleData[i * 4] = ring.at.x;
      rippleData[i * 4 + 1] = ring.at.y;
      rippleData[i * 4 + 2] = (response.timeMs - ring.startMs) / 1000;
      rippleData[i * 4 + 3] = ring.strength;
    });
    lights.forEach((light, i) => {
      const wobble = lampFlicker(i, response.timeMs, flickerDepth(light.energy, reference));
      let surge = 0;
      for (const threat of response.threats) {
        const near = 1 - Math.hypot(threat.at.x - light.at.x, threat.at.y - light.at.y) /
          RESPONSE.threatReach;
        if (near > 0) surge += threat.weight * near * near;
      }
      surge = Math.min(surge, 1.5);
      const answer = wobble * response.bloom * (1 + RESPONSE.threatSurge * surge) +
        RESPONSE.stormGain * response.storm;
      const { tint, blend } = lean(
        Math.min(surge, 1), response.chill, response.mourning, response.storm,
      );
      const gain = (light.energy / reference) * 1.15 * lightExposure * answer;
      for (let c = 0; c < 3; c++) {
        lightCol[i * 3 + c] = (light.colour[c] * (1 - blend) + tint[c] * blend) * gain;
        lampTint[i * 3 + c] = tint[c];
      }
      lampMix[i * 2] = blend;
      lampMix[i * 2 + 1] = answer;
    });
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uProj, false, isoProjection(cam));
    gl.uniform1f(uTime, response.timeMs / 1000);
    gl.uniform1fv(uFlameSway, flameSway);
    gl.uniform4fv(uRipples, rippleData);
    gl.uniform1f(uLiquid, hasLiquid ? filmStrength(LIQUID.strength, weather) : 0);
    gl.uniform1f(uRain, weather.rain);
    gl.uniform3fv(uLightPos, lightPos);
    gl.uniform3fv(uLightCol, lightCol);
    gl.uniform3fv(uLampTint, lampTint);
    gl.uniform2fv(uLampMix, lampMix);
    gl.drawArrays(gl.TRIANGLES, range.first, range.count);
  };

  const massBox = (cam: Camera, mass: Mass): { x: number; y: number; w: number; h: number } => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const x of [mass.bounds.min.x, mass.bounds.max.x]) {
      for (const y of [mass.bounds.min.y, mass.bounds.max.y]) {
        for (const elevation of [0, mass.bounds.top]) {
          const p = worldToScreenAtElevation(cam, { x, y }, elevation);
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      }
    }
    const pad = 2;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
  };

  let massesReady = false;

  const paintDrips = (ctx: CanvasRenderingContext2D, cam: Camera, timeMs: number): void => {
    if (!hasLiquid || LIQUID.strength <= 0) return;
    const drips = dripsAt(timeMs);
    if (drips.length === 0) return;
    const alpha = ctx.globalAlpha;
    ctx.fillStyle = 'rgb(206 224 236)';
    for (const drip of drips) {
      const at = worldToScreenAtElevation(cam, drip.at, drip.elevation);
      const w = Math.max(1, 1.1 * cam.zoom);
      const h = Math.max(2, 4.2 * cam.zoom);
      ctx.globalAlpha = alpha * 0.55 * LIQUID.strength;
      ctx.fillRect(at.x - w / 2, at.y - h, w, h);
    }
    ctx.globalAlpha = alpha;
  };

  const paintRain = (ctx: CanvasRenderingContext2D, cam: Camera, timeMs: number): void => {
    const weather = currentWeather();
    if (weather.rain <= 0) return;
    const streaks = rainAt(timeMs, weather);
    if (streaks.length === 0) return;
    const path = new Path2D();
    for (const streak of streaks) {
      const head = worldToScreenAtElevation(cam, streak.at, streak.elevation);
      const tail = worldToScreenAtElevation(cam, streak.from, streak.fromElevation);
      path.moveTo(tail.x, tail.y);
      path.lineTo(head.x, head.y);
    }
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * WEATHER.alpha * weather.rain;
    ctx.strokeStyle = WEATHER.colour;
    ctx.lineWidth = Math.max(1, WEATHER.width * cam.zoom);
    ctx.stroke(path);
    ctx.globalAlpha = alpha;
  };

  const painter: RoomLayerPainter = {
    drawBehind: (ctx, cam) => {
      const scale = contextScale(ctx);
      renderPass(cam, scale, behind);
      ctx.drawImage(canvas, 0, 0, cam.width, cam.height);
      renderPass(cam, scale, massesRange);
      massesReady = true;
      const timeMs = roomResponse(options.world()).timeMs;
      paintDrips(ctx, cam, timeMs);
      paintRain(ctx, cam, timeMs);
    },
    drawInFront: () => {},
    drawsPerFrame: 1 + masses.length,
  };

  const occluders: SortedOccluder[] = masses.map((mass) => ({
    at: mass.at,
    draw: (ctx, cam) => {
      if (!massesReady) return;
      const scale = contextScale(ctx) * currentRoomScale();
      const box = massBox(cam, mass);
      ctx.drawImage(
        canvas,
        box.x * scale, box.y * scale, box.w * scale, box.h * scale,
        box.x, box.y, box.w, box.h,
      );
    },
  }));

  return { painter, occluders };
};
