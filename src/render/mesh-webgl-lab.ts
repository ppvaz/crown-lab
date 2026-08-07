
import type { CombatConfig, World } from '../sim/types';
import type { Camera } from './iso';
import { worldToScreenAtElevation } from './iso';
import { RESPONSE, lean, roomResponse } from './room-light-lab';
import { currentWeather } from './room-weather-lab';
import { contextScale, isoProjection } from './room-webgl-lab';
import type { BodyClipBank, BodyClipDrive, BodyClipRole } from './mesh-clips-lab';
import { bindBodyClips } from './mesh-clips-lab';
import type { MeshBody } from './mesh-body-lab';
import { loadMeshBody } from './mesh-body-lab';
import type { CastMeshSpec } from './cast-meshes-lab';
import { bodyScale, modelTopUnits } from './cast-meshes-lab';
import { measureForwardFacing, missingSockets, socketPose } from './mesh-pose-lab';
import type { PoseScratch, SocketPose } from './mesh-pose-lab';
import { blendPoses, createPose, createScratch, jointMatrices, samplePose } from './mesh-pose-lab';

const MAX_JOINTS = 64;

const vert = (joints: number): string => `#version 300 es
in vec3 aPos;
in vec3 aNrm;
in vec2 aUv;
in vec4 aJoint;
in vec4 aWeight;

uniform mat4 uProj;
uniform mat4 uModel;
uniform mat4 uJoint[${joints}];

out vec3 vNrm;
out vec2 vUv;

void main() {
  mat4 skin =
    aWeight.x * uJoint[int(aJoint.x)] +
    aWeight.y * uJoint[int(aJoint.y)] +
    aWeight.z * uJoint[int(aJoint.z)] +
    aWeight.w * uJoint[int(aJoint.w)];
  vec4 posed = skin * vec4(aPos, 1.0);
  vNrm = normalize(mat3(uModel) * mat3(skin) * aNrm);
  vUv = aUv;
  gl_Position = uProj * (uModel * posed);
}`;

const frag = (): string => `#version 300 es
precision highp float;

in vec3 vNrm;
in vec2 vUv;

uniform sampler2D uAlbedo;
uniform float uHasAlbedo;
uniform vec3 uFlat;

/** What the room's flames are doing to him: colour already leaned, gain already applied. */
uniform vec3 uKey;
uniform vec3 uAmbient;
/** How much colour survives — the presentation stack's subtraction, applied to the one body that
    would otherwise be exempt from it because its colour is baked into a texture. */
uniform float uSaturation;

out vec4 outColor;

void main() {
  vec3 albedo = uHasAlbedo > 0.5 ? texture(uAlbedo, vUv).rgb : pow(uFlat, vec3(2.2));
  float grey = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  albedo = mix(vec3(grey), albedo, uSaturation);

  vec3 n = normalize(vNrm);
  vec3 l = normalize(vec3(0.55, 0.55, 1.0));
  float lambert = max(dot(n, l), 0.0);
  float wrapped = lambert * 0.72 + 0.28 * max(dot(n, l) * 0.5 + 0.5, 0.0);
  vec3 lit = albedo * (uAmbient + uKey * wrapped);

  float rim = pow(1.0 - max(n.z, 0.0), 3.0) * 0.16;
  lit += uKey * rim;

  outColor = vec4(pow(lit, vec3(1.0 / 2.2)), 1.0);
}`;

export const bodyModelMatrix = (
  at: { x: number; y: number },
  facing: number,
  forwardFacing: number,
  scale: number,
  bindFoot: number,
  out: Float32Array = new Float32Array(16),
): Float32Array => {
  const yaw = facing - forwardFacing;
  const c = Math.cos(yaw) * scale;
  const s = Math.sin(yaw) * scale;
  out[0] = c; out[1] = s; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = 0; out[6] = scale; out[7] = 0;
  out[8] = s; out[9] = -c; out[10] = 0; out[11] = 0;
  out[12] = at.x;
  out[13] = at.y;
  out[14] = -bindFoot * scale;
  out[15] = 1;
  return out;
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

export interface MeshSubject {
  pos: { x: number; y: number };
  facing: number;
}

export interface MeshBodyOptions {
  world: () => World;
  combat: () => CombatConfig;
  saturation?: () => number;
  flatColour?: () => readonly [number, number, number];
  drive: (world: World, subject: MeshSubject, bank: BodyClipBank) => BodyClipDrive | null;
  onFailure?: (reason: string) => void;
}

export interface CastMeshBody {
  draw: (ctx: CanvasRenderingContext2D, cam: Camera, subject: MeshSubject) => void;
  socket: (slot: 'weapon' | 'shield') => SocketPose | null;
  clipNames: readonly string[];
  unbound: readonly BodyClipRole[];
  override: (clip: number | null, at?: number) => void;
  showing: () => { clip: string; role: BodyClipRole | 'override'; at: number } | null;
  triangleCount: number;
}

export const createCastMeshBody = async (
  spec: CastMeshSpec,
  options: MeshBodyOptions,
): Promise<CastMeshBody | null> => {
  const fail = (reason: string): null => {
    options.onFailure?.(reason);
    return null;
  };

  const mesh = await loadMeshBody(spec, (reason) => options.onFailure?.(reason));
  if (mesh === null) return null;
  if (mesh.clips.length === 0) return fail('the king mesh carries no animation clips');
  const jointCount = mesh.skeleton.jointNode.length;
  if (jointCount > MAX_JOINTS) {
    return fail(`the king mesh has ${jointCount} joints; this renderer is built for ${MAX_JOINTS}`);
  }

  const albedo = mesh.albedo === null ? null : await decodeAlbedo(mesh.albedo, options.onFailure);
  return buildRenderer(spec, mesh, albedo, options, fail);
};

const decodeAlbedo = async (
  albedo: NonNullable<MeshBody['albedo']>,
  onFailure?: (reason: string) => void,
): Promise<ImageBitmap | null> => {
  try {
    const bytes = new Uint8Array(albedo.bytes);
    return await createImageBitmap(new Blob([bytes], { type: albedo.mime }));
  } catch (error) {
    onFailure?.(`the king's texture did not decode: ${
      error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const buildRenderer = (
  spec: CastMeshSpec,
  mesh: MeshBody,
  albedo: ImageBitmap | null,
  options: MeshBodyOptions,
  fail: (reason: string) => null,
): CastMeshBody | null => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    depth: true,
    premultipliedAlpha: true,
  });
  if (gl === null) return fail('no WebGL2 context for the king');

  const jointCount = mesh.skeleton.jointNode.length;
  let program: WebGLProgram;
  try {
    const created = gl.createProgram();
    if (created === null) return fail('king program could not be created');
    program = created;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vert(jointCount)));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, frag()));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'king program did not link');
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  gl.useProgram(program);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const floats = (name: string, data: Float32Array, size: number): void => {
    const location = gl.getAttribLocation(program, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  };
  floats('aPos', mesh.pos, 3);
  floats('aNrm', mesh.nrm, 3);
  floats('aUv', mesh.uv, 2);
  floats('aWeight', mesh.weight, 4);
  const jointLocation = gl.getAttribLocation(program, 'aJoint');
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, mesh.joint, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(jointLocation);
  gl.vertexAttribPointer(jointLocation, 4, gl.UNSIGNED_BYTE, false, 0, 0);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);

  let texture: WebGLTexture | null = null;
  if (albedo !== null) {
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, albedo.width, albedo.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, albedo);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    albedo.close();
  }

  const uProj = gl.getUniformLocation(program, 'uProj');
  const uModel = gl.getUniformLocation(program, 'uModel');
  const uJoint = gl.getUniformLocation(program, 'uJoint');
  const uAlbedo = gl.getUniformLocation(program, 'uAlbedo');
  const uHasAlbedo = gl.getUniformLocation(program, 'uHasAlbedo');
  const uFlat = gl.getUniformLocation(program, 'uFlat');
  const uKey = gl.getUniformLocation(program, 'uKey');
  const uAmbient = gl.getUniformLocation(program, 'uAmbient');
  const uSaturation = gl.getUniformLocation(program, 'uSaturation');

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);

  const bank: BodyClipBank = bindBodyClips(mesh.clips, spec.clipNames, mesh.clipRoles);
  const pose = createPose(mesh.skeleton);
  const fadeFrom = createPose(mesh.skeleton);
  const scratch: PoseScratch = createScratch(mesh.skeleton);
  const matrices = new Float32Array(jointCount * 16);
  const model = new Float32Array(16);

  let fadeRemaining = 0;
  let fadeTotal = 0;
  let lastRole: BodyClipRole | 'override' | null = null;
  let lastTimeMs: number | null = null;

  let overrideClip: number | null = null;
  let overrideAt = 0;
  let showingNow: { clip: string; role: BodyClipRole | 'override'; at: number } | null = null;

  const scale = bodyScale(spec, mesh.bindHeight);
  const modelTop = modelTopUnits(spec);
  const forward = measureForwardFacing(mesh);
  const forwardFacing = spec.forwardFacing ?? mesh.forwardFacing ?? forward.facing;
  const socketsMissing = missingSockets(mesh, spec.sockets);
  if (socketsMissing.length > 0) {
    options.onFailure?.(`${spec.id}: the rig has no joint for ${socketsMissing.join(', ')}`);
  }
  if (forward.dissent.length > 0) {
    options.onFailure?.(
      `${spec.id}: forward axis measured from ${forward.evidence}, but ${forward.dissent.join(' and ')} disagree`,
    );
  }

  const setModel = (subject: MeshSubject): void => {
    bodyModelMatrix(subject.pos, subject.facing, forwardFacing, scale, mesh.bindFoot, model);
  };

  const bodyBox = (cam: Camera, subject: MeshSubject) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const reach = modelTop;
    for (const dx of [-reach, reach]) {
      for (const dy of [-reach, reach]) {
        for (const elevation of [-0.2, modelTop * 1.35]) {
          const p = worldToScreenAtElevation(
            cam, { x: subject.pos.x + dx, y: subject.pos.y + dy }, elevation,
          );
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

  const resizeTo = (widthPx: number, heightPx: number): void => {
    if (canvas.width === widthPx && canvas.height === heightPx) return;
    canvas.width = widthPx;
    canvas.height = heightPx;
    gl.viewport(0, 0, widthPx, heightPx);
  };

  const draw = (ctx: CanvasRenderingContext2D, cam: Camera, subject: MeshSubject): void => {
    const world = options.world();
    const response = roomResponse(world, currentWeather());

    const drive = overrideClip === null ? options.drive(world, subject, bank) : null;
    const clip = overrideClip === null
      ? drive?.clip ?? null
      : mesh.clips[overrideClip] ?? null;
    if (clip === null) return;
    const seconds = overrideClip === null
      ? drive!.seconds
      : Math.max(0, Math.min(1, overrideAt)) * clip.durationSec;


    const dtMs = lastTimeMs === null ? 0 : Math.max(0, response.timeMs - lastTimeMs);
    lastTimeMs = response.timeMs;

    const role: BodyClipRole | 'override' = overrideClip === null ? drive!.role : 'override';
    if (role !== lastRole) {
      const fadeSec = overrideClip === null ? drive!.fadeSec : 0;
      if (lastRole !== null && fadeSec > 0) {
        fadeFrom.t.set(pose.t);
        fadeFrom.r.set(pose.r);
        fadeFrom.s.set(pose.s);
        fadeTotal = fadeSec * 1000;
        fadeRemaining = fadeTotal;
      } else {
        fadeRemaining = 0;
      }
      lastRole = role;
    }
    fadeRemaining = Math.max(0, fadeRemaining - dtMs);

    samplePose(pose, mesh.skeleton, clip, seconds);
    if (fadeRemaining > 0 && fadeTotal > 0) {
      blendPoses(pose, fadeFrom, fadeRemaining / fadeTotal);
    }
    jointMatrices(matrices, mesh.skeleton, pose, scratch);
    showingNow = { clip: clip.name, role, at: seconds / Math.max(1e-6, clip.durationSec) };

    let surge = 0;
    for (const threat of response.threats) {
      const near = 1 - Math.hypot(threat.at.x - subject.pos.x, threat.at.y - subject.pos.y) /
        RESPONSE.threatReach;
      if (near > 0) surge += threat.weight * near * near;
    }
    const { tint, blend } = lean(
      Math.min(surge, 1), response.chill, response.mourning, response.storm,
    );
    const gain = response.bloom * (1 + RESPONSE.threatSurge * Math.min(surge, 1.5) * 0.5) +
      RESPONSE.stormGain * response.storm;
    const base: readonly [number, number, number] = [1, 0.86, 0.66];
    const key = [0, 1, 2].map((c) => (base[c] * (1 - blend) + tint[c] * blend) * gain * 0.95);
    const ambient = [0, 1, 2].map(() => 0.14 * Math.max(0.5, response.bloom));

    const scaleFactor = contextScale(ctx);
    resizeTo(Math.round(cam.width * scaleFactor), Math.round(cam.height * scaleFactor));
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    setModel(subject);
    gl.uniformMatrix4fv(uProj, false, isoProjection(cam));
    gl.uniformMatrix4fv(uModel, false, model);
    gl.uniformMatrix4fv(uJoint, false, matrices);
    gl.uniform1f(uHasAlbedo, texture === null ? 0 : 1);
    gl.uniform3fv(uFlat, new Float32Array(options.flatColour?.() ?? [0.805, 0.781, 0.756]));
    gl.uniform3fv(uKey, new Float32Array(key));
    gl.uniform3fv(uAmbient, new Float32Array(ambient));
    gl.uniform1f(uSaturation, options.saturation?.() ?? 1);
    if (texture !== null) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uAlbedo, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, mesh.index.length, gl.UNSIGNED_INT, 0);

    const box = bodyBox(cam, subject);
    ctx.drawImage(
      canvas,
      box.x * scaleFactor, box.y * scaleFactor, box.w * scaleFactor, box.h * scaleFactor,
      box.x, box.y, box.w, box.h,
    );
  };

  return {
    draw,
    socket: (slot) => {
      const joint = spec.sockets?.[slot];
      return joint === undefined ? null : socketPose(mesh, scratch, joint, model);
    },
    clipNames: mesh.clips.map((clip) => clip.name),
    unbound: bank.unbound,
    override: (clip, at = 0) => {
      overrideClip = clip;
      overrideAt = at;
    },
    showing: () => showingNow,
    triangleCount: mesh.triangleCount,
  };
};

export type { MeshBody, MeshBodySource } from './mesh-body-lab';
export type { BodyClipRole } from './mesh-clips-lab';
