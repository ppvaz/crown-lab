import { box, cylinder, drawMesh, ellipsoid, merge, pitched, rolled, walkTerms } from '../src/render/mesh';
import { makeCamera } from '../src/render/iso';

const expectValidMesh = (mesh: ReturnType<typeof cylinder>): void => {
  expect(mesh.verts.length).toBeGreaterThan(0);
  expect(mesh.faces.length).toBeGreaterThan(0);
  for (const face of mesh.faces) {
    expect(face.v.length).toBeGreaterThanOrEqual(3);
    for (const index of face.v) {
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(mesh.verts.length);
    }
  }
};

describe('rounded software-3D primitives', () => {
  it('builds valid elliptical cylinders and ellipsoids', () => {
    expectValidMesh(cylinder([0, 0], [0.5, 0.25], 0, 1, 'tint'));
    expectValidMesh(ellipsoid([0, 0, 0.5], [0.5, 0.25, 0.5], 'tint'));
  });
});

describe('authoring-time rotations', () => {
  const straight = box([-0.1, -0.1, 0], [0.1, 0.1, 1], 'tint', 'weapon');

  it('passes faces through untouched, so winding and parts survive', () => {
    for (const turned of [pitched(straight, 0.5, [0, 0, 0.5]), rolled(straight, 0.5, [0, 0, 0.5])]) {
      expect(turned.faces).toBe(straight.faces);
      expect(turned.verts.length).toBe(straight.verts.length);
    }
  });

  it('leaves the pivot exactly where it was', () => {
    const pivot: [number, number, number] = [0, 0.2, 0.4];
    const spike = box([-0.01, 0.19, 0.39], [0.01, 0.21, 0.41], 'tint');
    const pitchedSpike = pitched(spike, 1.1, pivot);
    const rolledSpike = rolled(spike, 1.1, pivot);
    for (const turned of [pitchedSpike, rolledSpike]) {
      const centre = turned.verts
        .reduce((sum, v) => [sum[0] + v[0], sum[1] + v[1], sum[2] + v[2]], [0, 0, 0])
        .map((c) => c / turned.verts.length);
      expect(centre[0]).toBeCloseTo(pivot[0], 6);
      expect(centre[1]).toBeCloseTo(pivot[1], 6);
      expect(centre[2]).toBeCloseTo(pivot[2], 6);
    }
  });

  it('pitch keeps x and roll keeps y, so each turns about its own axis only', () => {
    const p = pitched(straight, 0.7, [0, 0, 0]);
    p.verts.forEach((v, i) => expect(v[0]).toBe(straight.verts[i][0]));
    const r = rolled(straight, 0.7, [0, 0, 0]);
    r.verts.forEach((v, i) => expect(v[1]).toBe(straight.verts[i][1]));
  });

  it('a quarter pitch lays a vertical shaft flat along +y', () => {
    const flat = pitched(straight, -Math.PI / 2, [0, 0, 0]);
    const tip = flat.verts[4];
    expect(tip[1]).toBeCloseTo(1, 6);
    expect(tip[2]).toBeCloseTo(0.1, 6);
  });
});

describe('the shared walk', () => {
  it('stands perfectly still at rest, so an idle body has no residual motion', () => {
    expect(walkTerms(0)).toEqual({ legSwing: 0, bob: 0, roll: 0 });
  });

  it('swings the legs in opposition rather than together', () => {
    const quarter = walkTerms(Math.PI / 2);
    expect(quarter.legSwing).toBeGreaterThan(0);
    expect(walkTerms((3 * Math.PI) / 2).legSwing).toBeLessThan(0);
  });

  it('bobs at twice the leg cadence, because both legs pass under the body per half-cycle', () => {
    expect(walkTerms(0.0001).bob).toBeCloseTo(walkTerms(Math.PI - 0.0001).bob, 6);
    expect(walkTerms(Math.PI / 2).bob).toBeCloseTo(0, 6);
  });

  it('rolls into the step, in the same direction the legs swing', () => {
    const phase = Math.PI / 3;
    expect(Math.sign(walkTerms(phase).roll)).toBe(Math.sign(walkTerms(phase).legSwing));
  });
});

describe('hiding a mesh part', () => {
  const twoParts = merge(
    box([-0.1, -0.1, 0], [0.1, 0.1, 0.4], 'tint', 'armLead'),
    box([-0.1, -0.1, 0.5], [0.1, 0.1, 0.9], 'tint', 'body'),
  );

  const paint = (hiddenParts?: ReadonlySet<'armLead' | 'body'>): number => {
    let fills = 0;
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() {
        fills++;
      },
      stroke() {},
      save() {},
      restore() {},
      translate() {},
      ellipse() {},
    } as unknown as CanvasRenderingContext2D;
    drawMesh(ctx, makeCamera(1280, 720), twoParts, {
      at: { x: 0, y: 0 },
      facing: 0,
      radius: 1,
      height: 1,
      lean: 0,
      crouch: 1,
      weapon: 0,
      shield: 0,
      gait: 0,
      hiddenParts,
      resolveFill: () => '#ffffff',
    });
    return fills;
  };

  it('paints every face when nothing is hidden', () => {
    const all = paint();
    expect(all).toBeGreaterThan(0);
    expect(paint(new Set())).toBe(all);
  });

  it('skips exactly the named part, leaving the rest untouched', () => {
    const all = paint();
    const armHidden = paint(new Set(['armLead']));
    expect(armHidden).toBeLessThan(all);
    expect(paint(new Set(['armLead', 'body']))).toBe(0);
  });
});

describe('folding a mesh at the waist', () => {
  const torsoTop = box([-0.05, -0.05, 1], [0.05, 0.05, 1.2], 'tint', 'body');
  const leg = box([-0.05, -0.05, 0], [0.05, 0.05, 0.5], 'tint', 'legLead');

  const paintTop = (
    mesh: ReturnType<typeof box>,
    lean: number,
    waistPivot?: [number, number, number],
  ): number => {
    let maxY = -Infinity;
    const track = (_x: number, y: number): void => {
      maxY = Math.max(maxY, y);
    };
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
      beginPath() {}, moveTo: track, lineTo: track, closePath() {}, fill() {}, stroke() {},
      save() {}, restore() {}, translate() {}, ellipse() {},
    } as unknown as CanvasRenderingContext2D;
    drawMesh(ctx, makeCamera(1280, 720), mesh, {
      at: { x: 0, y: 0 }, facing: 0, radius: 1, height: 1,
      lean, crouch: 1, weapon: 0, shield: 0, gait: 0,
      waistPivot,
      resolveFill: () => '#ffffff',
    });
    return maxY;
  };

  it('leaves a rigid tilt exactly as it was when no waist pivot is given', () => {
    expect(paintTop(torsoTop, 0.6)).toBeCloseTo(paintTop(torsoTop, 0.6, undefined), 6);
  });

  it('moves a body part once a lean is asked for', () => {
    expect(paintTop(torsoTop, 0.6, [0, 0, 0.6])).not.toBeCloseTo(paintTop(torsoTop, 0, [0, 0, 0.6]), 3);
  });

  it('excludes the legs from the fold entirely, unlike the rigid tilt', () => {
    const foldedLeg = paintTop(leg, 0.6, [0, 0, 0.6]);
    const uprightLeg = paintTop(leg, 0, undefined);
    const tiltedLeg = paintTop(leg, 0.6, undefined);
    expect(foldedLeg).toBeCloseTo(uprightLeg, 6);
    expect(tiltedLeg).not.toBeCloseTo(uprightLeg, 3);
  });
});
