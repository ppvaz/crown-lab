
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh as ThreeMesh, MeshBasicMaterial } from 'three';

import { ELEVATION_Y } from '../iso';
import type { Mesh, MeshDrawOpts, Vec3 } from '../mesh';
import { ISO_Z, LIGHT, posedVertex, shadeHex } from '../mesh';

export const HEIGHT_TO_ELEVATION = ISO_Z / ELEVATION_Y;

const colour = new Color();

export const buildActorGeometry = (
  mesh: Mesh,
  opts: MeshDrawOpts,
  target?: BufferGeometry,
  lift = 0,
): BufferGeometry => {
  const toWorld = posedVertex(mesh, opts);

  const positions: number[] = [];
  const colours: number[] = [];

  for (const face of mesh.faces) {
    const posed = face.v.map((index) => toWorld(mesh.verts[index], face.part));
    const [p0, p1, p2] = posed;
    const u: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const v: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const n: Vec3 = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const length = Math.hypot(n[0], n[1], n[2]) || 1;
    const lambert = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / length;
    const lit = 0.55 + 0.45 * Math.max(0, lambert);
    colour.set(shadeHex(opts.resolveFill(face.fill), lit));

    for (let i = 1; i + 1 < posed.length; i++) {
      for (const p of [posed[0], posed[i], posed[i + 1]]) {
        positions.push(p[0], p[1], p[2] * HEIGHT_TO_ELEVATION + lift);
        colours.push(colour.r, colour.g, colour.b);
      }
    }
  }

  const geometry = target ?? new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colours), 3));
  return geometry;
};

export const actorMaterial = (): MeshBasicMaterial =>
  new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });

export class ActorBody {
  readonly object: ThreeMesh;

  constructor(material: MeshBasicMaterial) {
    this.object = new ThreeMesh(new BufferGeometry(), material);
    this.object.frustumCulled = false;
    this.object.matrixAutoUpdate = false;
  }

  update(mesh: Mesh, opts: MeshDrawOpts, lift = 0): void {
    buildActorGeometry(mesh, opts, this.object.geometry, lift);
  }

  dispose(): void {
    this.object.geometry.dispose();
  }
}
