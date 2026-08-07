
export type RegionName =
  | 'thumbs'
  | 'controls'
  | 'vitals'
  | 'threat'
  | 'affordance'
  | 'verdict'
  | 'narration'
  | 'objective'
  | 'instruments';

export type FormFactor = 'desktop' | 'portrait' | 'landscape';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutInput {
  viewport: { w: number; h: number };
  safe: Insets;
  device: 'touch' | 'pointer';
  padLive?: boolean;
  profile: 'game' | 'lab';
  active?: {
    verdict?: boolean;
    narration?: boolean;
    threat?: boolean;
    instruments?: boolean;
  };
}

export interface LayoutFrame {
  form: FormFactor;
  viewport: { w: number; h: number };
  safe: Insets;
  device: 'touch' | 'pointer';
  profile: 'game' | 'lab';
  content: Rect;
  regions: Partial<Record<RegionName, Rect>>;
  reserved: {
    thumbs: Rect | null;
    stick: Rect | null;
    cluster: Rect | null;
    controls: Rect;
    instruments: Rect | null;
  };
  type: { small: number; base: number; large: number; display: number };
  gaze: { x: number; y: number; focusRadius: number };
  touchUnits: { button: number; stick: number } | null;
}


const GUTTER = { touch: 16, pointer: 24 } as const;

const CONTROL_ROW = { portrait: 64, landscape: 64, desktop: 54 } as const;

const TYPE = {
  touch: { small: 13, base: 15, large: 18, display: 30 },
  pointer: { small: 16, base: 18, large: 21, display: 38 },
} as const;

const FOCUS_RADIUS = { touch: 140, pointer: 228 } as const;

const INSTRUMENT_RAIL = 340;

const VITALS_HEIGHT = 68;
const THREAT_HEIGHT = 62;
export const AFFORDANCE_ROWS = 2;

const affordanceHeight = (base: number): number =>
  Math.ceil(base * 1.3) + rowStride(base) * (AFFORDANCE_ROWS - 1);
export const NARRATION_ROWS = 3;

const narrationHeight = (base: number): number =>
  regionRowAt(0, base) + rowStride(base) * (NARRATION_ROWS + 1) + base;

const VERDICT_HEIGHT = 88;
const OBJECTIVE_FULL = { w: 300, h: 100 };
const OBJECTIVE_CHIP = { w: 132, h: 48 };

const rowStride = (size: number): number => Math.round(size * 1.55);

const regionRowAt = (index: number, size: number): number => size + index * rowStride(size);

const rect = (x: number, y: number, w: number, h: number): Rect => ({
  x,
  y,
  w: Math.max(0, w),
  h: Math.max(0, h),
});

const clampRect = (inner: Rect, outer: Rect): Rect => {
  const w = Math.min(inner.w, outer.w);
  const h = Math.min(inner.h, outer.h);
  return rect(
    Math.max(outer.x, Math.min(inner.x, outer.x + outer.w - w)),
    Math.max(outer.y, Math.min(inner.y, outer.y + outer.h - h)),
    w,
    h,
  );
};

const centredIn = (outer: Rect, w: number, h: number, y: number): Rect =>
  clampRect(rect(outer.x + (outer.w - w) / 2, y, w, h), outer);

export const formFactorOf = (input: LayoutInput): FormFactor =>
  input.device === 'pointer'
    ? 'desktop'
    : input.viewport.w > input.viewport.h
      ? 'landscape'
      : 'portrait';

export const touchFootprint = (
  viewport: { w: number; h: number },
  safe: Insets,
  form: FormFactor,
): { stick: Rect; cluster: Rect; button: number; stickSize: number } => {
  const vw = viewport.w / 100;
  const dvh = viewport.h / 100;

  const button =
    form === 'portrait'
      ? Math.max(46, Math.min(68, Math.min(15 * vw, 9 * dvh)))
      : Math.max(46, Math.min(68, Math.min(13 * vw, 15 * dvh)));
  const stickSize = Math.min(30 * vw, 150);

  const left = Math.max(22, safe.left);
  const right = Math.max(18, safe.right);
  const bottom = Math.max(34, safe.bottom);
  const box = button * 3.6;

  return {
    stick: rect(left, viewport.h - bottom - stickSize, stickSize, stickSize),
    cluster: rect(viewport.w - right - box, viewport.h - bottom - box, box, box),
    button,
    stickSize,
  };
};

export const resolveLayout = (input: LayoutInput): LayoutFrame => {
  const form = formFactorOf(input);
  const { viewport, safe, device, profile } = input;
  const active = input.active ?? {};
  const gutter = GUTTER[device];
  const type = TYPE[device];

  const safeBox = rect(
    safe.left + gutter,
    safe.top + gutter,
    viewport.w - safe.left - safe.right - gutter * 2,
    viewport.h - safe.top - safe.bottom - gutter * 2,
  );

  const padLive = input.padLive ?? device === 'touch';
  const touch = device === 'touch' && padLive ? touchFootprint(viewport, safe, form) : null;

  const thumbTop = touch === null ? 0 : Math.min(touch.stick.y, touch.cluster.y);
  const thumbs = touch === null ? null : rect(0, thumbTop, viewport.w, viewport.h - thumbTop);

  const controls = rect(
    safe.left,
    safe.top,
    viewport.w - safe.left - safe.right,
    CONTROL_ROW[form],
  );

  const instrumentsSheet = active.instruments === true && device === 'touch';
  const instruments =
    active.instruments !== true
      ? null
      : instrumentsSheet
        ?
          rect(
            0,
            controls.y + controls.h,
            viewport.w,
            viewport.h - (controls.y + controls.h) - safe.bottom,
          )
        :
          rect(
            viewport.w - safe.right - INSTRUMENT_RAIL,
            controls.y + controls.h,
            INSTRUMENT_RAIL,
            viewport.h - (controls.y + controls.h) - safe.bottom,
          );

  const contentTop = Math.max(safeBox.y, controls.y + controls.h + gutter);
  const contentBottom =
    thumbs === null || form === 'landscape'
      ? safeBox.y + safeBox.h
      : Math.min(safeBox.y + safeBox.h, thumbs.y - gutter);
  const contentRight =
    instruments === null || instrumentsSheet
      ? safeBox.x + safeBox.w
      : Math.min(safeBox.x + safeBox.w, instruments.x - gutter);
  const content = rect(safeBox.x, contentTop, contentRight - safeBox.x, contentBottom - contentTop);

  const topBand =
    touch === null ? content : rect(content.x, content.y, content.w, thumbTop - gutter - content.y);
  const centreCol =
    touch === null
      ? content
      : rect(
          touch.stick.x + touch.stick.w + gutter,
          content.y,
          touch.cluster.x - gutter - (touch.stick.x + touch.stick.w + gutter),
          content.h,
        );

  const gaze = {
    x: content.x + content.w / 2,
    y: content.y + content.h / 2,
    focusRadius: FOCUS_RADIUS[device],
  };

  const frame: LayoutFrame = {
    form,
    viewport,
    safe,
    device,
    profile,
    content,
    regions: {},
    reserved: {
      thumbs,
      stick: touch?.stick ?? null,
      cluster: touch?.cluster ?? null,
      controls,
      instruments,
    },
    type,
    gaze,
    touchUnits: touch === null ? null : { button: touch.button, stick: touch.stickSize },
  };

  if (thumbs !== null) frame.regions.thumbs = thumbs;
  frame.regions.controls = controls;
  if (instruments !== null) frame.regions.instruments = instruments;

  if (instrumentsSheet) return frame;

  const row = form === 'landscape' ? topBand : content;
  const column = form === 'landscape' ? centreCol : content;

  const vitalsHeight = Math.min(VITALS_HEIGHT, row.h);
  frame.regions.vitals =
    form === 'landscape'
      ? rect(row.x, row.y, Math.min(240, row.w / 3), vitalsHeight)
      : rect(
          content.x,
          content.y + content.h - VITALS_HEIGHT,
          form === 'portrait' ? content.w * 0.6 : Math.min(320, content.w * 0.35),
          VITALS_HEIGHT,
        );

  if (active.threat === true) {
    frame.regions.threat = centredIn(
      row,
      Math.min(520, form === 'landscape' ? row.w / 3 : row.w * 0.62),
      Math.min(THREAT_HEIGHT, row.h),
      row.y,
    );
  }

  if (active.verdict !== true) {
    const size =
      form === 'portrait'
        ? OBJECTIVE_CHIP
        : form === 'landscape'
          ? {
              w: Math.min(OBJECTIVE_FULL.w, row.w / 3 - gutter),
              h: Math.min(OBJECTIVE_FULL.h, row.h),
            }
          : OBJECTIVE_FULL;
    const y =
      form === 'portrait' && frame.regions.threat !== undefined
        ? frame.regions.threat.y + frame.regions.threat.h + gutter
        : row.y;
    frame.regions.objective = clampRect(rect(row.x + row.w - size.w, y, size.w, size.h), row);
  }

  if (active.verdict === true) {
    frame.regions.verdict = centredIn(
      column,
      column.w,
      Math.min(VERDICT_HEIGHT, column.h),
      column.y + column.h * 0.26,
    );
  }

  if (active.narration === true) {
    frame.regions.narration =
      form === 'landscape'
        ?
          centredIn(
            column,
            column.w,
            Math.min(narrationHeight(type.base), column.h),
            column.y + (column.h - Math.min(narrationHeight(type.base), column.h)) / 2,
          )
        : centredIn(
            content,
            Math.min(680, content.w),
            Math.min(narrationHeight(type.base), content.h * 0.32),
            (frame.regions.vitals?.y ?? content.y + content.h) -
              gutter -
              Math.min(narrationHeight(type.base), content.h * 0.32),
          );
  } else {
    frame.regions.affordance = clampRect(
      rect(
        gaze.x - gaze.focusRadius,
        gaze.y + gaze.focusRadius * 0.45,
        Math.min(gaze.focusRadius * 2, column.w),
        affordanceHeight(type.base),
      ),
      column,
    );
  }

  return frame;
};

export const regionRow = (
  frame: LayoutFrame,
  region: Rect,
  index: number,
  size: number = frame.type.small,
): number => region.y + size + index * rowStride(size);

export const regionRowFits = (
  frame: LayoutFrame,
  region: Rect,
  index: number,
  size: number = frame.type.small,
): boolean => regionRow(frame, region, index, size) - region.y <= region.h;

export const contains = (outer: Rect, inner: Rect, tolerance = 0.5): boolean =>
  inner.x >= outer.x - tolerance &&
  inner.y >= outer.y - tolerance &&
  inner.x + inner.w <= outer.x + outer.w + tolerance &&
  inner.y + inner.h <= outer.y + outer.h + tolerance;

export const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
