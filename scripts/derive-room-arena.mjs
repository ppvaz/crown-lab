import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { arenaFromCorners, chamferedPolygon } from './lib/arena-from-panel.mjs';

const root = resolve(import.meta.dirname, '..');
const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};
const room = strArg('room', 'concept_lantern_cloister');
const assert = process.argv.includes('--assert');
const tolerance = Number(strArg('tolerance', '0.01'));

const annPath = resolve(root, `tools/blender/panels/${room}.json`);
if (!existsSync(annPath)) {
  console.error(`No panel annotation at tools/blender/panels/${room}.json`);
  process.exit(1);
}
const ann = JSON.parse(readFileSync(annPath, 'utf8'));

const vocab = JSON.parse(readFileSync(resolve(root, 'src/lab/rooms/vocabulary.json'), 'utf8'));
const roomDef = JSON.parse(
  readFileSync(resolve(root, `src/lab/rooms/${room.replace(/_/g, '-')}.json`), 'utf8'),
);
const arena = vocab.arenas[roomDef.arena];
const current = { hx: arena.halfExtents.x, hy: arena.halfExtents.y };
const span = current.hx + current.hy;

const derived = arenaFromCorners(ann.corners, { isoX: 34, isoY: 17 }, span);

console.log(`room     ${room}`);
console.log(`arena    ${roomDef.arena}`);
console.log(`panel    ${ann.panel}`);
if (ann.confidence) console.log(`note     ${ann.confidence}`);
console.log();
console.log(`current  hx ${current.hx.toFixed(3)}  hy ${current.hy.toFixed(3)}  ratio ${(current.hx / current.hy).toFixed(3)}`);
console.log(`derived  hx ${derived.hx.toFixed(3)}  hy ${derived.hy.toFixed(3)}  ratio ${derived.ratio.toFixed(3)}` +
  (derived.square ? '   (square)' : ''));
console.log();
console.log('residuals — two independent estimates of each quantity must agree:');
console.log(`  span  ${(derived.residual.span * 100).toFixed(2)}%   (hx+hy from left/right vs far/near)`);
console.log(`  skew  ${(derived.residual.skew * 100).toFixed(2)}%   (hx-hy from left/right vs far/near)`);

const panelIsoRatio = derived.panelIso / (17 / 34);
console.log();
console.log('projection-independent readings — each uses one screen axis, so isoX/isoY cancels:');
console.log(
  `  x-pair  hx ${derived.byAxis.x.hx.toFixed(3)}  hy ${derived.byAxis.x.hy.toFixed(3)}  ` +
    `ratio ${derived.byAxis.x.ratio.toFixed(3)}`,
);
console.log(
  `  y-pair  hx ${derived.byAxis.y.hx.toFixed(3)}  hy ${derived.byAxis.y.hy.toFixed(3)}  ` +
    `ratio ${derived.byAxis.y.ratio.toFixed(3)}`,
);
console.log(
  `  panel drawn at isoY:isoX ${derived.panelIso.toFixed(4)}, ` +
    `${((panelIsoRatio - 1) * 100).toFixed(1)}% off the runtime's ${(17 / 34).toFixed(4)}`,
);

const shaky = derived.residual.span > tolerance || derived.residual.skew > tolerance;
if (shaky) {
  console.log(
    `\n⚠ residual above ${(tolerance * 100).toFixed(0)}% — the annotation, not the arena, is the\n` +
      '  first suspect. The usual cause is a corner taken from the slab edge, a cast shadow or a\n' +
      '  prop standing on the corner rather than from the floor plane itself.\n' +
      '  If `npm run rooms:panel` says the panel is not in a parallel projection, that is the\n' +
      '  other cause, it is not fixable by re-annotating, and the two readings above are then the\n' +
      '  only figures this panel supports. Quote their bracket, never the average.',
  );
}

const shapeChanged = Math.abs(derived.hx - current.hx) / span > tolerance;
if (shapeChanged) {
  const cutX = current.hx - Math.abs(arena.vertices?.[0]?.x ?? current.hx);
  const cutY = current.hy - Math.abs(arena.vertices?.[2]?.y ?? current.hy);
  console.log(`\nproposed polygon (corner cut kept proportional at ${cutX} x ${cutY}):`);
  console.log(
    JSON.stringify(
      chamferedPolygon(derived.hx, derived.hy, cutX, cutY).map((p) => ({
        x: Number(p.x.toFixed(3)),
        y: Number(p.y.toFixed(3)),
      })),
    ),
  );
  console.log(
    `\nspan is unchanged at ${span}, so the push-in ceiling, the authored raster and ADR-024's\n` +
      'budgets are all unaffected by adopting this. Applying it is still a collision change.',
  );
}

if (assert && (shaky || shapeChanged)) process.exit(1);
