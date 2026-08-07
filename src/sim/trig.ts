
const TWO_OVER_PI = 6.36619772367581382433e-1;
const PIO2_HI = 1.57079632673412561417e0;
const PIO2_MID = 6.07710050650619224932e-11;
const PIO2_LO = 2.02226624879595063154e-21;

const PI = Math.PI;
const HALF_PI = Math.PI / 2;

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

const kernelSin = (x: number, tail: number): number => {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (tail === 0) return x + v * (S1 + z * r);
  return x - (z * (0.5 * tail - v * r) - tail - v * S1);
};

const kernelCos = (x: number, tail: number): number => {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + (1 - w - hz + (z * r - x * tail));
};

const evaluate = (x: number, offset: number): number => {
  const k = Math.round(x * TWO_OVER_PI);
  const t = x - k * PIO2_HI;
  const w = k * PIO2_MID;
  const r = t - w;
  const tail = t - r - w - k * PIO2_LO;
  const quadrant = (((k + offset) % 4) + 4) % 4;
  const magnitude = quadrant === 0 || quadrant === 2 ? kernelSin(r, tail) : kernelCos(r, tail);
  return quadrant < 2 ? magnitude : -magnitude;
};

export const sin = (x: number): number => evaluate(x, 0);

export const cos = (x: number): number => evaluate(x, 1);


const ATAN_HI = [
  4.63647609000806093515e-1,
  7.85398163397448278999e-1,
  9.82793723247329054082e-1,
  1.57079632679489655800e0,
];
const ATAN_LO = [
  2.26987774529616870924e-17,
  3.06161699786838301793e-17,
  1.39033110312309984516e-17,
  6.12323399573676603587e-17,
];
const T0 = 3.33333333333329318027e-1;
const T1 = -1.99999999998764832476e-1;
const T2 = 1.42857142725034663711e-1;
const T3 = -1.11111104054623557880e-1;
const T4 = 9.09088713343650656196e-2;
const T5 = -7.69187620504482999495e-2;
const T6 = 6.66107313738753120669e-2;
const T7 = -5.83357013379057348645e-2;
const T8 = 4.97687799461593236017e-2;
const T9 = -3.65315727442169155270e-2;
const T10 = 1.62858201153657823623e-2;

const ATAN_HUGE = 7.3786976294838206464e19;
const ATAN_TINY = 1.862645149230957e-9;

const atanAbs = (x: number): number => {
  if (!(x < ATAN_HUGE)) return ATAN_HI[3] + ATAN_LO[3];

  let id: number;
  let t: number;
  if (x < 0.4375) {
    if (x < ATAN_TINY) return x;
    id = -1;
    t = x;
  } else if (x < 1.1875) {
    if (x < 0.6875) {
      id = 0;
      t = (2 * x - 1) / (2 + x);
    } else {
      id = 1;
      t = (x - 1) / (x + 1);
    }
  } else if (x < 2.4375) {
    id = 2;
    t = (x - 1.5) / (1 + 1.5 * x);
  } else {
    id = 3;
    t = -1 / x;
  }

  const z = t * t;
  const w = z * z;
  const odd = z * (T0 + w * (T2 + w * (T4 + w * (T6 + w * (T8 + w * T10)))));
  const even = w * (T1 + w * (T3 + w * (T5 + w * (T7 + w * T9))));
  if (id < 0) return t - t * (odd + even);
  return ATAN_HI[id] - (t * (odd + even) - ATAN_LO[id] - t);
};

export const atan = (x: number): number => (x < 0 ? -atanAbs(-x) : atanAbs(x));

export const atan2 = (y: number, x: number): number => {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
};

export const asin = (x: number): number => {
  if (!(x >= -1 && x <= 1)) return NaN;
  return atan2(x, Math.sqrt((1 - x) * (1 + x)));
};
