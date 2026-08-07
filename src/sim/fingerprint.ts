
import type { World } from './types';

export const CHECKPOINT_INTERVAL = 120;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const mixU32 = (h: number, n: number): number => Math.imul(h ^ (n >>> 0), FNV_PRIME) >>> 0;

const BITS = new DataView(new ArrayBuffer(8));

export const mixDouble = (h: number, value: number): number => {
  BITS.setFloat64(0, value, false);
  return mixU32(mixU32(h, BITS.getUint32(0, false)), BITS.getUint32(4, false));
};

export const mixString = (h: number, value: string): number => {
  let acc = mixU32(h, value.length);
  for (let i = 0; i < value.length; i++) acc = mixU32(acc, value.charCodeAt(i));
  return acc;
};

const fingerprintValue = (h: number, value: unknown, open: Set<object>): number => {
  if (value === null) return mixU32(h, 0x4e554c4c);
  switch (typeof value) {
    case 'number':
      return mixDouble(h, value);
    case 'boolean':
      return mixU32(h, value ? 0x54525545 : 0x46414c53);
    case 'string':
      return mixString(mixU32(h, 0x53545249), value);
    case 'undefined':
      return mixU32(h, 0x554e4446);
    case 'object':
      break;
    default:
      throw new Error(`cannot fingerprint a ${typeof value}`);
  }

  const object = value as object;
  if (open.has(object)) throw new Error('found a cycle in the world');
  open.add(object);
  let acc = h;
  if (Array.isArray(value)) {
    acc = mixU32(acc, 0x41525241);
    acc = mixU32(acc, value.length);
    for (const item of value) acc = fingerprintValue(acc, item, open);
  } else {
    const record = object as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      acc = fingerprintValue(mixString(acc, key), record[key], open);
    }
  }
  open.delete(object);
  return acc;
};

export const fingerprintWorld = (world: World): number =>
  fingerprintValue(FNV_OFFSET, world, new Set<object>());

export { FNV_OFFSET, FNV_PRIME };
