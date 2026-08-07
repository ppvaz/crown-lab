import process from 'node:process';

import { loadSim } from './bundle-sim.mjs';
import { listArg } from './lib/args.mjs';


const rooms = listArg('rooms', ['concept_lantern_cloister']);
const seeds = listArg('seeds', ['1']).map(Number);
const targetDsf = Number(listArg('dsf', ['3'])[0]);

const { ceilingFor, probeRoom, rasterCost } = await loadSim('scripts/room-zoom.ts', 'room-zoom');

const pad = (value, width) => String(value).padStart(width);
const num = (value, places, width) => pad(value.toFixed(places), width);

let failures = 0;

for (const room of rooms) {
  const ceiling = ceilingFor(room);

  console.log(`\n=== ${room} ===`);
  console.log(`arena span ${ceiling.arenaSpan} units`);
  for (const { archetype, reach } of ceiling.reaches) {
    console.log(`  reach  ${archetype.padEnd(16)} ${reach.toFixed(2)}`);
  }
  console.log(
    `  tightest fight span ${ceiling.tightestSpan.toFixed(2)} (${ceiling.shortest.archetype})` +
      ` -> CEILING ${ceiling.ratio.toFixed(2)}x`,
  );

  console.log(
    `\n${'viewport'.padEnd(26)}${pad('content', 11)}${pad('dsf', 8)}${pad('seed', 6)}` +
      `${pad('resting', 9)}${pad('peak', 9)}${pad('peak/rest', 11)}${pad('ticks', 7)}  outcome`,
  );
  for (const seed of seeds) {
    for (const row of probeRoom(room, 'lab', seed)) {
      console.log(
        row.viewport.padEnd(26) +
          pad(`${Math.round(row.contentBox.w)}x${Math.round(row.contentBox.h)}`, 11) +
          pad(row.dsf, 8) +
          pad(seed, 6) +
          num(row.resting, 3, 9) +
          num(row.peak, 3, 9) +
          pad(`${row.ratio.toFixed(2)}x`, 11) +
          pad(row.ticks, 7) +
          `  ${row.outcome}`,
      );
      if (row.ratio > ceiling.ratio + 1e-6) {
        console.error(
          `  ✖ ${row.viewport} seed ${seed}: sampled ${row.ratio.toFixed(3)}x above the` +
            ` derived ceiling ${ceiling.ratio.toFixed(3)}x — ceilingFor is wrong`,
        );
        failures += 1;
      }
    }
  }

  const restingByViewport = probeRoom(room, 'lab', seeds[0]);
  const phone = restingByViewport[restingByViewport.length - 1];
  const desktop = restingByViewport[0];
  const spread = desktop.resting / phone.resting;

  console.log(
    `\nresting zoom spread across viewports: ${spread.toFixed(2)}x` +
      ` (${phone.resting.toFixed(3)} to ${desktop.resting.toFixed(3)}) — before the camera moves`,
  );

  const costs = [
    rasterCost(ceiling.arenaSpan, phone.resting * phone.dsf, `phone dSF ${phone.dsf}, resting`),
    rasterCost(
      ceiling.arenaSpan,
      phone.resting * ceiling.ratio * phone.dsf,
      `phone dSF ${phone.dsf}, ceiling`,
    ),
    rasterCost(
      ceiling.arenaSpan,
      phone.resting * ceiling.ratio * targetDsf,
      `phone dSF ${targetDsf}, ceiling`,
    ),
    rasterCost(
      ceiling.arenaSpan,
      desktop.resting * ceiling.ratio * desktop.dsf,
      `desktop dSF ${desktop.dsf}, ceiling`,
    ),
    rasterCost(
      ceiling.arenaSpan,
      desktop.resting * ceiling.ratio * 2,
      'desktop dSF 2, ceiling',
    ),
  ];

  console.log(
    `\n${'scenario'.padEnd(30)}${pad('scale', 8)}${pad('raster', 14)}` +
      `${pad('MB/layer', 10)}${pad('8 layers', 11)}`,
  );
  for (const cost of costs) {
    console.log(
      cost.label.padEnd(30) +
        num(cost.scale, 3, 8) +
        pad(`${cost.w}x${cost.h}`, 14) +
        num(cost.mbPerLayer, 1, 10) +
        pad(`${cost.mbTotal.toFixed(0)} MB`, 11),
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} sample(s) exceeded the derived ceiling.`);
  process.exit(1);
}
