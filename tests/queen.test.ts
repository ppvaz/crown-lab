
import { DEFAULT_MODELS } from '../src/render/cast/index-lab';
import { PUBLIC_MODELS } from '../src/render/cast/index-public';
import { POLISHED_QUEEN } from '../src/render/cast/queen';
import { LAB_FULL_PALETTE, labArchetypeColor } from '../src/render/palette-lab';
import { PALETTE } from '../src/render/palette';
import type { ModelDef, ModelShape, ModelView } from '../src/render/models';

const king = DEFAULT_MODELS.models.player;

const inView = (model: ModelDef, view: ModelView): ModelShape[] =>
  model.shapes.filter((shape) => shape.side === undefined || shape.side === view);

const ys = (shape: ModelShape): number[] =>
  shape.points?.map(([, y]) => y) ?? [(shape.cy ?? 0) - (shape.ry ?? 0), (shape.cy ?? 0) + (shape.ry ?? 0)];

const topOf = (model: ModelDef): number =>
  Math.max(...model.shapes.filter((shape) => shape.part !== 'weapon').flatMap(ys));

const peaks = (shape: ModelShape): number => {
  const outline = ys(shape);
  return outline.filter((y, i) => {
    const before = outline[(i - 1 + outline.length) % outline.length];
    const after = outline[(i + 1) % outline.length];
    return y > before && y > after;
  }).length;
};

const gold = (shape: ModelShape): boolean =>
  shape.fill === 'playerAccent' || (shape.fill === null && shape.stroke === 'playerAccent');

const VIEWS: readonly ModelView[] = ['front', 'back', 'profile'];

describe('the Queen ships, and both builds draw the same one', () => {
  it('is one body, named by the laboratory bank and by the public cast alike', () => {
    expect(DEFAULT_MODELS.models.queen.id).toBe(POLISHED_QUEEN.id);
    expect(PUBLIC_MODELS.models.queen.id).toBe(POLISHED_QUEEN.id);
  });

  it('takes her colour from the shipped palette, and the lab reads the same value', () => {
    const tint = labArchetypeColor('queen');
    expect(tint).toBe(PALETTE.queen);
    expect(tint).toBe(LAB_FULL_PALETTE.queen);
    expect(tint).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('the Queen beside the king', () => {
  it('wears a halo of single points, never a coronet', () => {
    const headpieces = POLISHED_QUEEN.shapes.filter(
      (shape) => shape.part === 'head' && shape.kind === 'poly' && gold(shape),
    );
    expect(headpieces.length).toBeGreaterThan(0);
    for (const shape of headpieces) {
      expect(peaks(shape), `a ${peaks(shape)}-point headpiece`).toBeLessThanOrEqual(1);
    }

    const crown = king.shapes.find(
      (shape) => shape.part === 'head' && shape.fill === 'playerAccent' && shape.kind === 'poly',
    );
    expect(peaks(crown!)).toBe(3);
  });

  it('stands her halo around the head, where his crown sits on top of it', () => {
    const helm = POLISHED_QUEEN.shapes.find(
      (shape) => shape.side === 'front' && shape.part === 'head' && shape.fill === 'hudText',
    );
    const halo = POLISHED_QUEEN.shapes.filter(
      (shape) => shape.side === 'front' && shape.part === 'head' && gold(shape),
    );
    const helmBottom = Math.min(...ys(helm!));
    expect(Math.min(...halo.flatMap(ys))).toBeLessThanOrEqual(helmBottom);

    const kingHead = king.shapes.find(
      (shape) => shape.side === 'front' && shape.part === 'head' && shape.fill === 'playerFace',
    );
    const crown = king.shapes.find(
      (shape) => shape.side === 'front' && shape.part === 'head' && shape.fill === 'playerAccent',
    );
    expect(Math.min(...ys(crown!))).toBeGreaterThan(Math.max(...ys(kingHead!)) - 0.06);
  });

  it('draws the halo before the head, so the ring is behind it in every view', () => {
    for (const view of VIEWS) {
      const shapes = inView(POLISHED_QUEEN, view).filter((shape) => shape.part === 'head');
      const lastGold = shapes.reduce((last, shape, i) => (gold(shape) ? i : last), -1);
      const firstOther = shapes.findIndex((shape) => !gold(shape));
      expect(lastGold, `${view} lost its halo`).toBeGreaterThanOrEqual(0);
      expect(firstOther, `${view} lost its head`).toBeGreaterThanOrEqual(0);
      expect(lastGold, `${view} paints the halo over the face`).toBeLessThan(firstOther);
    }
  });

  it("wears none of the king's tokens, and none of his height", () => {
    for (const shape of POLISHED_QUEEN.shapes) {
      for (const token of [shape.fill, shape.stroke]) {
        expect(['player', 'playerFace', 'identityCloth']).not.toContain(token);
        expect(token).not.toBe('wall');
      }
    }
    expect(POLISHED_QUEEN.heightPx).toBeLessThan(king.heightPx);
    expect(topOf(POLISHED_QUEEN) * POLISHED_QUEEN.heightPx).toBeLessThan(topOf(king) * king.heightPx);
  });
});

describe('the Queen as a silhouette', () => {
  it('is authored in three views rather than one front reused', () => {
    const shared = POLISHED_QUEEN.shapes.filter(
      (shape) =>
        shape.side === undefined &&
        shape.part !== 'weapon' &&
        shape.part !== 'legLead' &&
        shape.part !== 'legTrail',
    );
    expect(shared).toHaveLength(0);
    for (const view of VIEWS) {
      expect(inView(POLISHED_QUEEN, view).length, view).toBeGreaterThan(10);
    }
  });

  it('foreshortens and thickens its profile like the rest of the authored cast', () => {
    expect(POLISHED_QUEEN.viewWidthScale?.profile).toBeGreaterThan(0);
    expect(POLISHED_QUEEN.viewWidthScale?.profile).toBeLessThan(1);
    expect(POLISHED_QUEEN.profileDepth).toBeGreaterThan(0);
    for (const view of VIEWS) expect(POLISHED_QUEEN.viewPartOrder?.[view], view).toBeDefined();
  });

  it('moves the sword behind her from the back and in front of her otherwise', () => {
    const order = POLISHED_QUEEN.viewPartOrder!;
    expect(order.front!.indexOf('weapon')).toBeGreaterThan(order.front!.indexOf('body'));
    expect(order.profile!.indexOf('weapon')).toBeGreaterThan(order.profile!.indexOf('body'));
    expect(order.back!.indexOf('weapon')).toBeLessThan(order.back!.indexOf('body'));
  });

  it('has two legs that swing in opposition, and a hand the sword turns about', () => {
    const legs = POLISHED_QUEEN.shapes.filter(
      (shape) => shape.part === 'legLead' || shape.part === 'legTrail',
    );
    expect(legs.filter((shape) => shape.part === 'legLead').length).toBeGreaterThanOrEqual(1);
    expect(legs.filter((shape) => shape.part === 'legTrail').length).toBeGreaterThanOrEqual(1);

    const pivot = POLISHED_QUEEN.flatArticulation?.weapon?.pivot;
    expect(pivot, 'the sword turns about the cast default, not her hand').toBeDefined();
    const hand = POLISHED_QUEEN.shapes.find(
      (shape) => shape.part === 'weapon' && shape.kind === 'ellipse',
    );
    expect(Math.hypot((hand!.cx ?? 0) - pivot![0], (hand!.cy ?? 0) - pivot![1])).toBeLessThan(0.08);
  });

  it('keeps the regalia sword out of the ground', () => {
    const blade = POLISHED_QUEEN.shapes.filter((shape) => shape.part === 'weapon');
    expect(Math.min(...blade.flatMap(ys))).toBeGreaterThan(0);
  });
});
