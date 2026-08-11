import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { requireSecret } from './lib/secret.mjs';

const root = resolve(import.meta.dirname, '..');
const API = 'https://api.meshy.ai/openapi/v1';

const flag = (name) => process.argv.includes(`--${name}`);
const strArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};

const outDir = resolve(root, 'tools/blender/build/meshy-room');
const name = strArg('name', 'kernel_guard');
const inputs = strArg(
  'images',
  'tools/blender/build/meshy-inputs/panel.png,tools/blender/build/meshy-inputs/blockout.png',
).split(',').map((p) => resolve(root, p));
const endpoint = inputs.length > 1 ? '/multi-image-to-3d' : '/image-to-3d';
const targetPolycount = Number(strArg('polycount', inputs.length > 1 ? '30000' : '12000'));
if (!Number.isInteger(targetPolycount) || targetPolycount < 100 || targetPolycount > 300000) {
  console.error(`--polycount must be an integer from 100 to 300000, got ${targetPolycount}`);
  process.exit(1);
}
const params = {
  ai_model: 'meshy-5',
  topology: 'triangle',
  target_polycount: targetPolycount,
  should_texture: true,
  enable_pbr: false,
  symmetry_mode: inputs.length > 1 ? 'off' : 'auto',
};

const dataUri = (path) => {
  const bytes = readFileSync(path);
  return `data:image/png;base64,${bytes.toString('base64')}`;
};

const call = async (path, init = {}) => {
  const key = requireSecret('MESHY_API_KEY', 'crown-meshy');
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`${init.method ?? 'GET'} ${path} -> ${response.status}\n${body}`);
    process.exit(1);
  }
  return JSON.parse(body);
};

const batchDir = strArg('batch', '');
if (batchDir) {
  const { readdirSync } = await import('node:fs');
  const dir = resolve(root, batchDir);
  const props = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  const perTask = 15;
  console.log(`batch: ${props.length} prop task(s) from ${batchDir}`);
  for (const f of props) console.log(`  ${f.replace('.png', '')}`);
  console.log(`  expected ~${props.length * perTask} credits at ${perTask}/task (two receipts so far); consumed_credits is the fact.`);
  if (!flag('submit')) {
    console.log('\n--submit to spend it.');
    process.exit(0);
  }
  mkdirSync(outDir, { recursive: true });
  const statePath = resolve(outDir, `batch-state-${dir.split('/').pop()}.json`);
  const state = (() => { try { return JSON.parse(readFileSync(statePath, 'utf8')); } catch { return {}; } })();
  const pending = new Map(Object.entries(state));
  for (const f of props) {
    const prop = f.replace('.png', '');
    if (state[prop]) { console.log(`already submitted ${prop}: ${state[prop]}`); continue; }
    for (;;) {
      const key = requireSecret('MESHY_API_KEY', 'crown-meshy');
      const response = await fetch(`${API}/image-to-3d`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, target_polycount: 12000, symmetry_mode: 'auto',
                               image_url: dataUri(resolve(dir, f)) }),
      });
      const body = await response.text();
      if (response.status === 429) {
        console.log(`queue full before ${prop}; waiting 45 s for a slot`);
        await new Promise((done) => setTimeout(done, 45000));
        continue;
      }
      if (!response.ok) { console.error(`POST /image-to-3d -> ${response.status}\n${body}`); process.exit(1); }
      const task = JSON.parse(body);
      state[prop] = task.result;
      pending.set(prop, task.result);
      writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
      console.log(`submitted ${prop}: ${task.result}`);
      break;
    }
  }
  let spent = 0;
  while (pending.size > 0) {
    await new Promise((done) => setTimeout(done, 20000));
    for (const [prop, id] of [...pending]) {
      const task = await call(`/image-to-3d/${id}`);
      if (task.status === 'SUCCEEDED') {
        const glb = Buffer.from(await (await fetch(task.model_urls.glb)).arrayBuffer());
        writeFileSync(resolve(outDir, `${prop}-meshy.glb`), glb);
        const credits = task.consumed_credits ?? 'not reported';
        spent += typeof credits === 'number' ? credits : 0;
        writeFileSync(resolve(outDir, `${prop}-receipt.json`), `${JSON.stringify({
          probe: `guardroom prop: ${prop}`,
          service: 'Meshy image-to-3d',
          taskId: id,
          parameters: { ...params, target_polycount: 12000, symmetry_mode: 'auto' },
          submittedInputs: [`${batchDir}/${prop}.png`],
          finishedAt: new Date().toISOString(),
          consumedCredits: credits,
        }, null, 2)}\n`);
        console.log(`done ${prop}  (${(glb.length / 1e6).toFixed(1)} MB, ${credits} credits)`);
        pending.delete(prop);
      } else if (task.status === 'FAILED' || task.status === 'CANCELED') {
        console.error(`FAILED ${prop} (${id}): ${JSON.stringify(task.task_error ?? task.status)}`);
        pending.delete(prop);
      }
    }
    if (pending.size > 0) console.log(`waiting on ${pending.size}: ${[...pending.keys()].join(', ')}`);
  }
  console.log(`\nbatch complete. credits consumed (reported): ${spent}`);
  process.exit(0);
}

const taskId = strArg('task', '');
if (taskId) {
  for (;;) {
    const task = await call(`${endpoint}/${taskId}`);
    if (task.status === 'SUCCEEDED') {
      mkdirSync(outDir, { recursive: true });
      const glbUrl = task.model_urls?.glb;
      if (!glbUrl) {
        console.error('SUCCEEDED but no glb url in model_urls:');
        console.error(JSON.stringify(task, null, 2));
        process.exit(1);
      }
      const glb = Buffer.from(await (await fetch(glbUrl)).arrayBuffer());
      const glbPath = resolve(outDir, `${name}-meshy.glb`);
      writeFileSync(glbPath, glb);
      const receipt = {
        probe: `can Meshy build it: ${name}`,
        service: `Meshy ${endpoint.slice(1)}`,
        taskId,
        parameters: params,
        submittedInputs: inputs.map((p) => p.replace(`${root}/`, '')),
        finishedAt: new Date().toISOString(),
        consumedCredits: task.task_error ? null : task.consumed_credits ?? 'not reported',
        raw: { status: task.status, progress: task.progress },
      };
      writeFileSync(resolve(outDir, `${name}-receipt.json`), `${JSON.stringify(receipt, null, 2)}\n`);
      console.log(`glb      ${glbPath.replace(`${root}/`, '')}  (${(glb.length / 1e6).toFixed(1)} MB)`);
      console.log(`credits  ${receipt.consumedCredits}`);
      console.log(`receipt  tools/blender/build/meshy-room/${name}-receipt.json`);
      break;
    }
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      console.error(`task ${taskId}: ${task.status}`);
      console.error(JSON.stringify(task.task_error ?? task, null, 2));
      process.exit(1);
    }
    console.log(`${new Date().toISOString().slice(11, 19)}  ${task.status}  ${task.progress ?? 0}%`);
    await new Promise((done) => setTimeout(done, 15000));
  }
} else {
  console.log(`would send to POST ${endpoint}:`);
  for (const input of inputs) console.log(`  image  ${input.replace(`${root}/`, '')}`);
  console.log(`  params ${JSON.stringify({ ...params, image_urls: undefined })}`);
  console.log('  expected cost: 15 credits for textured Meshy-5; consumed_credits is the receipt.');
  if (!flag('submit')) {
    console.log('\n--submit to spend it.');
  } else {
    const images = inputs.length > 1
      ? { image_urls: inputs.map(dataUri) }
      : { image_url: dataUri(inputs[0]) };
    const task = await call(endpoint, {
      method: 'POST',
      body: JSON.stringify({ ...params, ...images }),
    });
    console.log(`\nsubmitted: ${task.result}`);
    console.log(`poll with: node scripts/gen-room-meshy.mjs --task=${task.result} --name=${name}` +
      (inputs.length > 1 ? '' : ` --images=${strArg('images', '')}`));
  }
}
