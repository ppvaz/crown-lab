
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh as ThreeMesh,
  MeshBasicMaterial,
} from 'three';

import type { Vec2 } from '../../sim/types';
import type { Arena } from '../../sim/types';
import { arenaElevationAt, arenaVertices } from '../../sim/arena';
import { ROOM_WALL_HEIGHT } from '../facade';

export interface RoomColours {
  floor: string;
  wall: string;
  gate: string;
}

const fan = (polygon: readonly Vec2[], elevationAt: (p: Vec2) => number, into: number[]): void => {
  for (let i = 1; i + 1 < polygon.length; i++) {
    for (const p of [polygon[0], polygon[i], polygon[i + 1]]) {
      into.push(p.x, p.y, elevationAt(p));
    }
  }
};

const quad = (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], into: number[]): void => {
  into.push(...a, ...b, ...c, ...a, ...c, ...d);
};

const geometryFrom = (positions: number[]): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
};

export class RoomScene {
  readonly group = new Group();

  private readonly materials: MeshBasicMaterial[] = [];

  private readonly geometries: BufferGeometry[] = [];

  constructor(arena: Arena, colours: RoomColours) {
    this.group.matrixAutoUpdate = false;

    const outline = arenaVertices(arena);
    const elevationAt = (p: Vec2): number => arenaElevationAt(arena, p);

    const floor: number[] = [];
    for (const region of arena.regions ?? [outline]) fan(region, elevationAt, floor);
    this.add(floor, colours.floor);

    const walls: number[] = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const za = elevationAt(a);
      const zb = elevationAt(b);
      quad(
        [a.x, a.y, za],
        [b.x, b.y, zb],
        [b.x, b.y, zb + ROOM_WALL_HEIGHT],
        [a.x, a.y, za + ROOM_WALL_HEIGHT],
        walls,
      );
    }
    this.add(walls, colours.wall);

    const gates: number[] = [];
    for (const gate of arena.gates ?? []) {
      quad(
        [gate.from.x, gate.from.y, elevationAt(gate.from)],
        [gate.to.x, gate.to.y, elevationAt(gate.to)],
        [gate.to.x, gate.to.y, elevationAt(gate.to) + ROOM_WALL_HEIGHT],
        [gate.from.x, gate.from.y, elevationAt(gate.from) + ROOM_WALL_HEIGHT],
        gates,
      );
    }
    if (gates.length > 0) this.add(gates, colours.gate);

    const ramp = arena.elevationRamp;
    if (ramp !== undefined && ramp.steps > 0) {
      const risers: number[] = [];
      const axis = ramp.axis;
      const span = axis === 'x' ? arena.halfExtents.y : arena.halfExtents.x;
      for (let step = 1; step <= ramp.steps; step++) {
        const t = step / ramp.steps;
        const at = ramp.from + (ramp.to - ramp.from) * t;
        const z = t * ramp.height;
        const lower = ((step - 1) / ramp.steps) * ramp.height;
        const ends: [Vec2, Vec2] =
          axis === 'x'
            ? [{ x: at, y: -span }, { x: at, y: span }]
            : [{ x: -span, y: at }, { x: span, y: at }];
        quad(
          [ends[0].x, ends[0].y, lower],
          [ends[1].x, ends[1].y, lower],
          [ends[1].x, ends[1].y, z],
          [ends[0].x, ends[0].y, z],
          risers,
        );
      }
      this.add(risers, colours.wall);
    }
  }

  private add(positions: number[], hex: string): void {
    if (positions.length === 0) return;
    const geometry = geometryFrom(positions);
    const material = new MeshBasicMaterial({ color: new Color(hex), side: DoubleSide });
    const mesh = new ThreeMesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    this.geometries.push(geometry);
    this.materials.push(material);
    this.group.add(mesh);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.group.clear();
  }
}
