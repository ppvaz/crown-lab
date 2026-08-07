import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { launchChrome, startViteServer, waitForServer } from './lib/harness.mjs';
import { listArg } from './lib/args.mjs';
import { estimateTiming, summarizeFrames } from './lib/frame-sample.mjs';

const PORT = 5197;
const BASE = `http://localhost:${PORT}`;
const VIEWPORTS = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    context: {},
  },
  'mobile-landscape': {
    viewport: { width: 984, height: 443 },
    context: { deviceScaleFactor: 2.4375, isMobile: true, hasTouch: true },
  },
};
const TIERS = [
  'off',
  'effects',
  'optimized_lv1',
  'optimized_lv2',
  'optimized_lv3',
  'full',
];
const SHOTS = [
  'perfect-parry',
  'arena-training',
  'arena-corner',
  'shape-gallery',
  'maze-followed',
];

const numArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? Number(raw.slice(name.length + 3)) : fallback;
};

const shots = listArg('shots', SHOTS);
const viewports = listArg('viewports', ['mobile-landscape']);
const tiers = listArg('tiers', TIERS);
const reference = listArg('reference', ['full'])[0];
const rate = numArg('cpu', 6);
const sampleMs = numArg('sample', 2500);
const reps = Math.max(1, numArg('reps', 3));
const outRoot = listArg('out', ['captures/apotheosis'])[0];



const buildSheet = async ({ panels, referenceIndex, referenceLabel, title }) => {
  const images = await Promise.all(
    panels.map(
      (panel) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('panel failed to decode'));
          image.src = panel.dataUrl;
        }),
    ),
  );

  const read = (image) => {
    const scratch = document.createElement('canvas');
    scratch.width = image.naturalWidth;
    scratch.height = image.naturalHeight;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, scratch.width, scratch.height);
  };

  const referenceData = read(images[referenceIndex]);
  const stats = [];
  const diffCanvases = [];

  for (let index = 0; index < images.length; index += 1) {
    const data = read(images[index]);
    if (
      index === referenceIndex ||
      data.width !== referenceData.width ||
      data.height !== referenceData.height
    ) {
      stats.push(
        index === referenceIndex
          ? { reference: true }
          : { mismatch: `${data.width}x${data.height} vs ${referenceData.width}x${referenceData.height}` },
      );
      diffCanvases.push(null);
      continue;
    }

    const diff = document.createElement('canvas');
    diff.width = data.width;
    diff.height = data.height;
    const diffContext = diff.getContext('2d');
    const out = diffContext.createImageData(data.width, data.height);

    let total = 0;
    let worst = 0;
    let over2 = 0;
    const pixels = data.width * data.height;
    for (let p = 0; p < pixels; p += 1) {
      const offset = p * 4;
      const dr = Math.abs(data.data[offset] - referenceData.data[offset]);
      const dg = Math.abs(data.data[offset + 1] - referenceData.data[offset + 1]);
      const db = Math.abs(data.data[offset + 2] - referenceData.data[offset + 2]);
      const peak = Math.max(dr, dg, db);
      total += (dr + dg + db) / 3;
      if (peak > worst) worst = peak;
      if (peak > 2) over2 += 1;
      const lit = Math.min(255, peak * 12);
      out.data[offset] = lit;
      out.data[offset + 1] = Math.min(255, lit * 0.35);
      out.data[offset + 2] = Math.min(255, lit * 0.55);
      out.data[offset + 3] = 255;
    }
    diffContext.putImageData(out, 0, 0);
    diffCanvases.push(diff);
    stats.push({
      mean: total / pixels,
      worst,
      over2: (over2 / pixels) * 100,
    });
  }

  const panelWidth = 620;
  const aspect = images[0].naturalHeight / images[0].naturalWidth;
  const panelHeight = Math.round(panelWidth * aspect);
  const gap = 18;
  const headerHeight = 54;
  const captionHeight = 46;
  const rowHeight = headerHeight + panelHeight + captionHeight + panelHeight + gap;
  const sheet = document.createElement('canvas');
  sheet.width = images.length * panelWidth + (images.length + 1) * gap;
  sheet.height = rowHeight + gap + 34;
  const ctx = sheet.getContext('2d');

  ctx.fillStyle = '#0b0d14';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = '#e8e4da';
  ctx.font = '600 20px ui-monospace, monospace';
  ctx.fillText(title, gap, 26);

  for (let index = 0; index < images.length; index += 1) {
    const x = gap + index * (panelWidth + gap);
    const top = 34 + gap;

    ctx.fillStyle = panels[index].tier === referenceLabel ? '#c8a94a' : '#e8e4da';
    ctx.font = '600 19px ui-monospace, monospace';
    ctx.fillText(panels[index].tier, x, top + 20);
    ctx.fillStyle = '#9aa0b4';
    ctx.font = '15px ui-monospace, monospace';
    ctx.fillText(panels[index].timing, x, top + 42);

    ctx.drawImage(images[index], x, top + headerHeight, panelWidth, panelHeight);
    ctx.strokeStyle = '#242838';
    ctx.strokeRect(x, top + headerHeight, panelWidth, panelHeight);

    const captionTop = top + headerHeight + panelHeight;
    const stat = stats[index];
    ctx.font = '15px ui-monospace, monospace';
    if (stat.reference === true) {
      ctx.fillStyle = '#c8a94a';
      ctx.fillText('reference', x, captionTop + 20);
      ctx.fillStyle = '#5a6076';
      ctx.fillText('no diff panel', x, captionTop + 38);
    } else if (stat.mismatch !== undefined) {
      ctx.fillStyle = '#e0704a';
      ctx.fillText(`size mismatch ${stat.mismatch}`, x, captionTop + 20);
    } else {
      ctx.fillStyle = stat.over2 > 1 ? '#e0704a' : '#7fbf8a';
      ctx.fillText(`vs ${referenceLabel}: >2/255 on ${stat.over2.toFixed(3)}% px`, x, captionTop + 20);
      ctx.fillStyle = '#9aa0b4';
      ctx.fillText(`mean ${stat.mean.toFixed(3)}  worst ${stat.worst}`, x, captionTop + 38);
    }

    const diffTop = captionTop + captionHeight;
    if (diffCanvases[index] !== null) {
      ctx.drawImage(diffCanvases[index], x, diffTop, panelWidth, panelHeight);
    } else {
      ctx.fillStyle = '#11141d';
      ctx.fillRect(x, diffTop, panelWidth, panelHeight);
    }
    ctx.strokeStyle = '#242838';
    ctx.strokeRect(x, diffTop, panelWidth, panelHeight);
  }

  ctx.fillStyle = '#5a6076';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText(
    'lower row: difference from the reference tier, amplified 12x',
    gap,
    sheet.height - 12,
  );

  return { dataUrl: sheet.toDataURL('image/png'), stats };
};

const { proc: server, state: serverState } = startViteServer({ port: PORT });

try {
  await waitForServer(BASE, serverState);
  const browser = await launchChrome();
  const failures = [];
  const discarded = [];
  const written = [];

  console.log(
    `\nAPOTHEOSIS COMPARISON — ${tiers.join(' / ')} against ${reference}, cpu ${rate}x, ${sampleMs}ms x ${reps} rep(s) per tier`,
  );

  for (const viewportName of viewports) {
    const form = VIEWPORTS[viewportName];
    if (!form) {
      failures.push(`unknown viewport: ${viewportName}`);
      continue;
    }
    const directory = `${outRoot}/${viewportName}`;
    await mkdir(directory, { recursive: true });

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

    for (const shot of shots) {
      const panels = [];
      const measured = new Map();
      let shotFailed = false;

      for (let rep = 0; rep < reps; rep += 1) {

      const order = tiers.map((_, index) => tiers[(index + rep) % tiers.length]);
      for (const tier of order) {
        const label = `${viewportName}/${shot} ${tier}${reps > 1 ? ` rep ${rep + 1}` : ''}`;

        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
          await page.goto(
            `${BASE}/?capture=${encodeURIComponent(shot)}&apotheosis=${encodeURIComponent(tier)}`,
          );
          await page.waitForSelector(
            `html[data-capture-ready="true"][data-capture-shot="${shot}"]`,
            { timeout: 30_000 },
          );
          const applied = await page.evaluate(
            () => document.documentElement.dataset.apotheosis ?? '(unset)',
          );
          if (applied !== tier) {
            throw new Error(`entrypoint applied "${applied}", not "${tier}"`);
          }
          await cdp.send('Emulation.setCPUThrottlingRate', { rate });
          await page.waitForTimeout(1200);
          const frames = await page.evaluate(async (ms) => {
            if (window.__benchFrames) window.__benchFrames.length = 0;
            await new Promise((resolve) => setTimeout(resolve, ms));
            return [...(window.__benchFrames ?? [])];
          }, sampleMs);
          const timing = summarizeFrames(frames);
          if (timing === null) {
            discarded.push(label);
            console.error(`  … ${label}: no frames in ${sampleMs}ms — repetition discarded`);
          } else {
            const fps = (frames.length / sampleMs) * 1000;
            const record = measured.get(tier) ?? { means: [], p95s: [], fpss: [] };
            record.means.push(timing.mean);
            record.p95s.push(timing.p95);
            record.fpss.push(fps);
            measured.set(tier, record);
            if (reps > 1) {
              console.log(
                `    rep ${rep + 1} ${shot.padEnd(16)} ${tier.padEnd(14)} mean=${timing.mean.toFixed(2).padStart(6)}ms  ${fps.toFixed(1).padStart(5)}fps`,
              );
            }
          }

          if (rep === reps - 1) {
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
            await page.waitForTimeout(300);
            const buffer = await page.locator('canvas#view').screenshot();
            const path = `${directory}/${shot}-${tier}.png`;
            await writeFile(path, buffer);
            written.push(path);
            panels.push({
              tier,
              dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
              timing: '',
              measured: false,
              mean: 0,
              p95: 0,
              fps: 0,
              spread: 0,
            });
          }
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt === 0) {
            console.error(`  … ${label} retrying: ${error.message.split('\n')[0]}`);
          }
        }
        }
        if (lastError !== null) {
          shotFailed = true;
          failures.push(label);
          console.error(`✖ ${label}: ${lastError.message.split('\n')[0]}`);
        }
      }
      }


      panels.sort((a, b) => tiers.indexOf(a.tier) - tiers.indexOf(b.tier));

      for (const panel of panels) {
        const estimate = estimateTiming(measured.get(panel.tier));
        if (estimate === null) {
          panel.timing = 'unmeasured';
          failures.push(`${viewportName}/${shot} ${panel.tier}: no timed repetition`);
          console.error(
            `  ${shot.padEnd(16)} ${panel.tier.padEnd(14)} unmeasured — every repetition discarded`,
          );
          continue;
        }
        panel.measured = true;
        panel.mean = estimate.mean;
        panel.p95 = estimate.p95;
        panel.fps = estimate.fps;
        panel.spread = estimate.spread;
        panel.timing = `${panel.mean.toFixed(2)}ms best  ${panel.fps.toFixed(1)}fps  ±${panel.spread.toFixed(2)}ms`;
        console.log(
          `  ${shot.padEnd(16)} ${panel.tier.padEnd(14)} best=${panel.mean.toFixed(2).padStart(6)}ms  p95=${panel.p95.toFixed(2).padStart(6)}ms  ${panel.fps.toFixed(1).padStart(5)}fps  spread=${panel.spread.toFixed(2)}ms`,
        );
      }

      const referenceIndex = panels.findIndex((panel) => panel.tier === reference);
      if (shotFailed || panels.length < 2 || referenceIndex < 0) {
        if (!shotFailed) {
          failures.push(`${viewportName}/${shot}: no ${reference} panel to compare against`);
          console.error(`✖ ${viewportName}/${shot}: reference tier "${reference}" missing`);
        }
        continue;
      }

      const base = panels[referenceIndex];
      for (const panel of panels) {
        if (panel.tier === reference) continue;
        if (!panel.measured || !base.measured) continue;
        const saved = base.mean - panel.mean;
        const share = base.mean === 0 ? 0 : (saved / base.mean) * 100;
        console.log(
          `    ${panel.tier.padEnd(14)} ${saved >= 0 ? '-' : '+'}${Math.abs(saved).toFixed(2)}ms vs ${reference} (${share >= 0 ? '' : '+'}${(-share).toFixed(0)}% cost)`,
        );
      }

      try {
        const sheet = await page.evaluate(buildSheet, {
          panels: panels.map((panel) => ({
            tier: panel.tier,
            dataUrl: panel.dataUrl,
            timing: panel.timing,
          })),
          referenceIndex,
          referenceLabel: reference,
          title: `${viewportName} · ${shot} · cpu ${rate}x · reference ${reference}`,
        });
        const path = `${directory}/${shot}-sheet.png`;
        await writeFile(path, Buffer.from(sheet.dataUrl.split(',')[1], 'base64'));
        written.push(path);
        for (let index = 0; index < panels.length; index += 1) {
          const stat = sheet.stats[index];
          if (stat?.over2 === undefined) continue;
          console.log(
            `    ${panels[index].tier.padEnd(14)} pixels: >2/255 on ${stat.over2.toFixed(3)}%  mean ${stat.mean.toFixed(3)}  worst ${stat.worst}`,
          );
        }
        console.log(`  → ${path}`);
      } catch (error) {
        failures.push(`${viewportName}/${shot} sheet`);
        console.error(`✖ ${viewportName}/${shot} sheet: ${error.message.split('\n')[0]}`);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log(`\n${written.length} file(s) written under ${outRoot}/`);
  if (discarded.length > 0) {
    console.error(
      `\n${discarded.length} repetition(s) discarded for producing no frames: ${discarded.join(', ')}`,
    );
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} comparison(s) failed.`);
    process.exitCode = 1;
  }
} finally {
  server.kill('SIGTERM');
}
