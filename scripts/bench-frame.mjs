import process from 'node:process';
import { launchChrome, startViteServer, waitForServer } from './lib/harness.mjs';
import { flag, listArg, valueArg } from './lib/args.mjs';

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const VIEWPORTS = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    context: {},
  },
  laptop: {
    viewport: { width: 1280, height: 720 },
    context: {},
  },
  'mobile-landscape': {
    viewport: { width: 984, height: 443 },
    context: { deviceScaleFactor: 2.4375, isMobile: true, hasTouch: true },
  },
  'desktop-retina': {
    viewport: { width: 1440, height: 900 },
    context: { deviceScaleFactor: 2 },
  },
};
const SHOTS = [
  'first-blade-room',
  'arena-training',
  'arena-corner',
  'shape-gallery',
  'shape-combat-bowl',
  'maze-followed',
];
const SAMPLE_MS = 5000;
const MIN_60_HZ_SAMPLE_FPS = 59;
const FRAME_BUDGET_MS = 1000 / 60;


const shots = listArg('shots', SHOTS);
const viewports = listArg('viewports', ['desktop', 'mobile-landscape']);
const rates = listArg('cpu', ['1']).map(Number);
const live = flag('live');
const profiling = flag('profile');
const asserting = flag('assert');
const apotheosis = listArg('apotheosis', [])[0] ?? '';
const cast = flag('cast') ? 'mesh' : valueArg('cast', '');
const captureCamera = flag('push') ? 'action' : '';
const ablations = listArg('roomAblate', ['']);


const summarize = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return {
    n: sorted.length,
    mean: samples.reduce((total, value) => total + value, 0) / Math.max(1, sorted.length),
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
};

const selfTime = (profile) => {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const totals = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i += 1) {
    const node = nodes.get(profile.samples[i]);
    const delta = profile.timeDeltas[i] ?? 0;
    if (node === undefined) continue;
    const frame = node.callFrame;
    const file = frame.url ? frame.url.split('/').slice(-1)[0].split('?')[0] : '(native)';
    const key = `${frame.functionName || '(anonymous)'} — ${file}`;
    totals.set(key, (totals.get(key) ?? 0) + delta);
    total += delta;
  }
  return { totals, total };
};

const { proc: server, state: serverState } = startViteServer({ port: PORT });

try {
  await waitForServer(BASE, serverState);
  const browser = await launchChrome();
  const failures = [];
  const castDrawn = new Map();

  console.log(
    `\n${live ? 'LIVE — sim and render' : 'RENDER ONLY — frozen capture state'}` +
      `, ${SAMPLE_MS / 1000}s per state, ${shots.length} shot(s)`,
  );

  for (const viewportName of viewports) {
    const form = VIEWPORTS[viewportName];
    if (!form) {
      failures.push(`unknown viewport: ${viewportName}`);
      continue;
    }
    const context = await browser.newContext({ viewport: form.viewport, ...form.context });
    await context.addInitScript(() => {
      window.__benchFrames = [];
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) =>
        raf((time) => {
          const started = performance.now();
          callback(time);
          window.__benchFrames?.push(performance.now() - started);
        });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error(`Browser: ${error.message}`));
    const cdp = await context.newCDPSession(page);
    if (profiling) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 80 });
    }

    for (const shot of shots) {
      for (const rate of rates) {
      for (const ablation of ablations) {
        const ablated = ablation === '' || ablation === 'none' ? [] : ablation.split('+');
        const label = `${viewportName}/${shot}${rates.length > 1 || rate !== 1 ? ` cpu/${rate}x` : ''}${
          apotheosis === '' ? '' : ` apo/${apotheosis}`
        }${cast === '' ? '' : ` cast/${cast}`}${captureCamera === '' ? '' : ' push'}${
          ablations.length > 1 || ablated.length > 0 ? ` ablate/${ablation === '' ? 'none' : ablation}` : ''
        }`;
        try {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
          await page.goto(
            `${BASE}/?capture=${encodeURIComponent(shot)}${
              apotheosis === '' ? '' : `&apotheosis=${encodeURIComponent(apotheosis)}`
            }${cast === '' ? '' : `&cast=${encodeURIComponent(cast)}`}${
              captureCamera === '' ? '' : `&captureCamera=${encodeURIComponent(captureCamera)}`
            }${ablated.length === 0 ? '' : `&roomAblate=${encodeURIComponent(ablated.join(','))}`}`,
          );
          await page.waitForSelector(
            `html[data-capture-ready="true"][data-capture-shot="${shot}"]`,
            { timeout: 30_000 },
          );
          if (ablated.length > 0) {
            const echo = await page.evaluate(
              () => document.documentElement.dataset.captureRoomAblate ?? null,
            );
            if (echo !== ablated.join(',')) {
              failures.push(`${label}: asked to ablate and the room did not`);
              console.error(
                `✖ ${label}: ablation echo ${echo === null ? 'absent' : `"${echo}"`} — ` +
                  'this reading would have been the ordinary room',
              );
              continue;
            }
          }
          if (cast !== '') {
            const drawn = await page.evaluate(() => ({
              meshes: Number(document.documentElement.dataset.captureCastMeshes ?? 0),
              actors: Number(document.documentElement.dataset.captureCastActors ?? 0),
              triangles: Number(document.documentElement.dataset.captureCastTriangles ?? 0),
            }));
            if (drawn.meshes === 0) {
              failures.push(`${label}: asked for the cast and drew none of it`);
              console.error(
                `✖ ${label}: no body loaded — run \`npm run cast:mesh -- --body=<id>\`; ` +
                  'this reading would have been the primitives',
              );
              continue;
            }
            castDrawn.set(label, drawn);
          }
          if (live) await page.click('#touch-pause');
          await cdp.send('Emulation.setCPUThrottlingRate', { rate });
          await page.waitForTimeout(1200);
          if (profiling) await cdp.send('Profiler.start');

          const sample = await page.evaluate(async (ms) => {
            if (window.__benchFrames) window.__benchFrames.length = 0;
            await new Promise((resolve) => setTimeout(resolve, ms));
            const canvas = document.querySelector('canvas');
            return {
              frames: [...(window.__benchFrames ?? [])],
              surface:
                canvas === null
                  ? 'no-canvas'
                  : `${canvas.width}x${canvas.height} (${canvas.clientWidth}x${canvas.clientHeight} CSS)`,
            };
          }, SAMPLE_MS);

          const stats = summarize(sample.frames);
          const fps = (stats.n / SAMPLE_MS) * 1000;
          const drawn = castDrawn.get(label);
          console.log(
            `${label.padEnd(54)}fps=${fps.toFixed(1).padStart(5)}  ` +
              `mean=${stats.mean.toFixed(2).padStart(6)}ms  p50=${stats.p50.toFixed(2).padStart(6)}ms  ` +
              `p95=${stats.p95.toFixed(2).padStart(6)}ms  max=${stats.max.toFixed(2).padStart(7)}ms  ` +
              `surface=${sample.surface}` +
              (drawn === undefined
                ? ''
                : `  actors=${drawn.actors} meshes=${drawn.meshes} tris=${drawn.triangles}`),
          );

          if (
            asserting &&
            (fps < MIN_60_HZ_SAMPLE_FPS || stats.p95 > FRAME_BUDGET_MS)
          ) {
            failures.push(label);
            console.error(
              `✖ ${label}: 60 FPS floor missed ` +
                `(delivered ${fps.toFixed(1)} fps, callback p95 ${stats.p95.toFixed(2)} ms)`,
            );
          }

          if (profiling) {
            const { profile } = await cdp.send('Profiler.stop');
            const { totals, total } = selfTime(profile);
            const ranked = [...totals.entries()]
              .filter(([key]) => !key.startsWith('(idle)') && !key.startsWith('(program)'))
              .sort((a, b) => b[1] - a[1])
              .slice(0, 15);
            for (const [key, us] of ranked) {
              console.log(
                `      ${((us / total) * 100).toFixed(1).padStart(5)}%  ` +
                  `${(us / 1000).toFixed(0).padStart(5)} ms  ${key}`,
              );
            }
          }
        } catch (error) {
          failures.push(label);
          console.error(`✖ ${label}: ${error.message.split('\n')[0]}`);
        }
      }
      }
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await context.close();
  }

  await browser.close();
  if (failures.length > 0) {
    console.error(`\n${failures.length} state(s) failed.`);
    process.exitCode = 1;
  }
} finally {
  server.kill();
}
