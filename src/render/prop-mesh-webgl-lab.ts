
import type { World } from '../sim/types';
import type { Camera } from './iso';
import { worldToScreenAtElevation } from './iso';
import { ISO_Z } from './mesh';
import type { Palette } from './palette';
import { RESPONSE, lean, roomResponse } from './room-light-lab';
import { currentWeather } from './room-weather-lab';
import { contextScale, isoProjection } from './room-webgl-lab';
import { sceneTimeMs } from './draw-primitives';
import type { MeshBody } from './mesh-body-lab';
import { loadMeshBody } from './mesh-body-lab';
import { frag, vert } from './mesh-webgl-lab';

export interface ShardSubject {
  id: number;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  reflected: boolean;
  spent: number;
  critical: boolean;
}

export interface ShardMeshBody {
  draw: (ctx: CanvasRenderingContext2D, cam: Camera, world: World, shot: ShardSubject, pal: Palette) => void;
}

export const SHARD_MESH_ROUTE = '/assets-cast/shard/shard.glb';

const LENGTH_UNITS = 1.04;
const LIFT_UNITS = 30 / ISO_Z;
const BOB_UNITS = 2.5 / ISO_Z;

export const propModelMatrix = (
  at: { x: number; y: number },
  yaw: number,
  pitch: number,
  scale: number,
  centre: number,
  elevation: number,
  out: Float32Array = new Float32Array(16),
): Float32Array => {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  out[0] = scale * cy * cp; out[1] = scale * sy * cp; out[2] = scale * -sp; out[3] = 0;
  out[4] = scale * cy * sp; out[5] = scale * sy * sp; out[6] = scale * cp; out[7] = 0;
  out[8] = scale * sy; out[9] = scale * -cy; out[10] = 0; out[11] = 0;
  out[12] = at.x;
  out[13] = at.y;
  out[14] = -centre * scale + elevation;
  out[15] = 1;
  return out;
};

const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export const createShardMeshBody = async (
  options: {
    saturation?: () => number;
    onFailure?: (reason: string) => void;
  } = {},
): Promise<ShardMeshBody | null> => {
  const fail = (reason: string): null => (options.onFailure?.(reason), null);
  const mesh: MeshBody | null = await loadMeshBody(
    { glb: SHARD_MESH_ROUTE }, (reason) => options.onFailure?.(reason),
  );
  if (mesh === null) return null;

  const jointCount = mesh.skeleton.jointNode.length;
  const states = mesh.joint.reduce((top, j) => Math.max(top, j), 0) + 1;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < mesh.pos.length; i += 3) {
    minX = Math.min(minX, mesh.pos[i]);
    maxX = Math.max(maxX, mesh.pos[i]);
    minY = Math.min(minY, mesh.pos[i + 1]);
    maxY = Math.max(maxY, mesh.pos[i + 1]);
  }
  const scale = LENGTH_UNITS / Math.max(1e-6, maxX - minX);
  const centreFoot = (minY + maxY) / 2;

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    alpha: true, antialias: true, depth: true, premultipliedAlpha: true,
  });
  if (gl === null) return fail('no WebGL2 context for the shard');

  let program: WebGLProgram;
  try {
    const created = gl.createProgram();
    if (created === null) return fail('shard program could not be created');
    program = created;
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type);
      if (shader === null) throw new Error('shader could not be created');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? 'shard shader did not compile');
      }
      return shader;
    };
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vert(jointCount)));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag()));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'shard program did not link');
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

  const uProj = gl.getUniformLocation(program, 'uProj');
  const uModel = gl.getUniformLocation(program, 'uModel');
  const uJoint = gl.getUniformLocation(program, 'uJoint');
  const uHasAlbedo = gl.getUniformLocation(program, 'uHasAlbedo');
  const uFlat = gl.getUniformLocation(program, 'uFlat');
  const uKey = gl.getUniformLocation(program, 'uKey');
  const uAmbient = gl.getUniformLocation(program, 'uAmbient');
  const uSaturation = gl.getUniformLocation(program, 'uSaturation');

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);

  const matrices = new Float32Array(jointCount * 16);
  const model = new Float32Array(16);

  const setState = (state: number): void => {
    matrices.fill(0);
    const k = Math.max(0, Math.min(states - 1, state));
    const base = k * 16;
    matrices[base] = 1;
    matrices[base + 5] = 1;
    matrices[base + 10] = 1;
    matrices[base + 15] = 1;
  };

  const resizeTo = (widthPx: number, heightPx: number): void => {
    if (canvas.width === widthPx && canvas.height === heightPx) return;
    canvas.width = widthPx;
    canvas.height = heightPx;
    gl.viewport(0, 0, widthPx, heightPx);
  };

  const shardBox = (cam: Camera, at: { x: number; y: number }) => {
    let bMinX = Infinity;
    let bMinY = Infinity;
    let bMaxX = -Infinity;
    let bMaxY = -Infinity;
    const reach = LENGTH_UNITS * 0.75;
    for (const dx of [-reach, reach]) {
      for (const dy of [-reach, reach]) {
        for (const elevation of [LIFT_UNITS - reach, LIFT_UNITS + reach]) {
          const p = worldToScreenAtElevation(cam, { x: at.x + dx, y: at.y + dy }, elevation);
          bMinX = Math.min(bMinX, p.x);
          bMinY = Math.min(bMinY, p.y);
          bMaxX = Math.max(bMaxX, p.x);
          bMaxY = Math.max(bMaxY, p.y);
        }
      }
    }
    const pad = 2;
    return { x: bMinX - pad, y: bMinY - pad, w: bMaxX - bMinX + 2 * pad, h: bMaxY - bMinY + 2 * pad };
  };

  const draw = (
    ctx: CanvasRenderingContext2D, cam: Camera, world: World, shot: ShardSubject, pal: Palette,
  ): void => {
    const response = roomResponse(world, currentWeather());
    const now = sceneTimeMs(world);

    let surge = 0;
    for (const threat of response.threats) {
      const near = 1 - Math.hypot(threat.at.x - shot.pos.x, threat.at.y - shot.pos.y) /
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

    const elevation = LIFT_UNITS + Math.sin(now / 145 + shot.id) * BOB_UNITS;
    const yaw = now / 1180 + shot.id * 2.3;
    const pitch = Math.sin(now / 1870 + shot.id * 1.1) * 0.85;
    setState(shot.critical ? states - 1 : shot.spent);
    propModelMatrix(shot.pos, yaw, pitch, scale, centreFoot, elevation, model);

    const scaleFactor = contextScale(ctx);
    resizeTo(Math.round(cam.width * scaleFactor), Math.round(cam.height * scaleFactor));
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    const box = shardBox(cam, shot.pos);
    const sx = Math.max(0, Math.floor(box.x * scaleFactor));
    const sh = Math.min(canvas.height, Math.ceil(box.h * scaleFactor));
    const sy = Math.max(0, Math.min(canvas.height - sh,
      Math.floor(canvas.height - (box.y + box.h) * scaleFactor)));
    const sw = Math.min(canvas.width - sx, Math.ceil(box.w * scaleFactor));
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(sx, sy, Math.max(0, sw), Math.max(0, sh));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uProj, false, isoProjection(cam));
    gl.uniformMatrix4fv(uModel, false, model);
    gl.uniformMatrix4fv(uJoint, false, matrices);
    gl.uniform1f(uHasAlbedo, 0);


    gl.uniform3fv(uFlat, new Float32Array(rgbOf(pal.glassRegent)));
    gl.uniform3fv(uKey, new Float32Array(key));
    gl.uniform3fv(uAmbient, new Float32Array(ambient));
    gl.uniform1f(uSaturation, options.saturation?.() ?? 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, mesh.index.length, gl.UNSIGNED_INT, 0);
    gl.disable(gl.SCISSOR_TEST);

    ctx.drawImage(
      canvas,
      box.x * scaleFactor, box.y * scaleFactor, box.w * scaleFactor, box.h * scaleFactor,
      box.x, box.y, box.w, box.h,
    );
  };

  return { draw };
};
