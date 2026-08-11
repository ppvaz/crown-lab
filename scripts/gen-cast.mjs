
import { mkdir, readFile, rename, unlink, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { cachePath } from './bundle-sim.mjs';
import { flag, listArg, valueArg } from './lib/args.mjs';
import { requireSecret } from './lib/secret.mjs';
import { formatPlan, planCast } from './lib/cast-plan.mjs';

const root = resolve(import.meta.dirname, '..');

const API = 'https://api.meshy.ai/openapi/v1';

const POLL_MS = 4000;
const POLL_LIMIT = 150;

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * One authenticated call. The key is read here and goes nowhere else.
 * @param {string} path
 * @param {RequestInit} [init]
 */
const call = async (path, init = {}) => {
  const key = requireSecret('MESHY_API_KEY', 'crown-meshy');
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${response.statusText} ${detail.slice(0, 400)}`);
  }
  return response.json();
};

/**
 * Poll a task to a terminal state.
 *
 * Polling rather than the SSE stream endpoint on purpose: this is a manual, occasional tool run by
 * a person watching it, and a long-lived event stream is a second failure mode — a dropped
 * connection mid-task looks exactly like a task that stopped reporting. A poll that misses a beat
 * simply asks again.
 * @param {string} kind `rigging` or `animations`
 * @param {string} id
 */
const settle = async (kind, id) => {
  for (let i = 0; i < POLL_LIMIT; i++) {
    const task = await call(`/${kind}/${id}`);
    if (task.status === 'SUCCEEDED') return task;
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      throw new Error(`${kind} task ${id} ${task.status}: ${task.task_error?.message ?? ''}`);
    }
    process.stdout.write(`\r      ${kind} ${id} ${task.status} ${task.progress ?? 0}%   `);
    await sleep(POLL_MS);
  }
  throw new Error(`${kind} task ${id} did not settle in ${(POLL_LIMIT * POLL_MS) / 1000}s`);
};

/**
 * Fetch a URL the service returned, atomically.
 *
 * The temporary is a sibling of the target so the rename cannot cross a filesystem — a rename that
 * silently becomes a copy is no longer atomic, which is the whole property being bought.
 * @param {string} url
 * @param {string} outPath
 */
const download = async (url, outPath) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download HTTP ${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error('the download returned no bytes');
  const tmp = `${outPath}.tmp`;
  await mkdir(dirname(outPath), { recursive: true });
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, outPath);
  } finally {
    await unlink(tmp).catch(() => {});
  }
  return bytes.length;
};

/**
 * The rig task id, cached, because it is the expensive half and every clip needs it.
 *
 * Under `node_modules/.cache/crown-lab/` following `bundle-sim.mjs`'s `cachePath`: never a build
 * input, already ignored by git, safe to delete. Losing it costs 5 credits, which is exactly why it
 * is written before any clip is requested.
 * @param {string} body
 */
const rigCachePath = (body) => cachePath(`cast/${body}.rig.json`);

/**
 * What the service said about what it made, written where a person will read it.
 *
 * Beside the artifact and in the private tree, because it names a generation id. `licence` is
 * `unknown` and this script will not fill it in — see the header.
 * @param {string} body
 * @param {object} record
 */
const writeProvenance = async (body, record) => {
  const path = resolve(root, `.crown-private/cast-source/${body}.provenance.json`);
  await mkdir(dirname(path), { recursive: true });
  const existing = await readFile(path, 'utf8').then(JSON.parse).catch(() => ({}));
  await writeFile(path, `${JSON.stringify({ ...existing, ...record }, null, 2)}\n`);
  return path;
};

const main = async () => {
  const only = listArg('body', null);
  const roles = listArg('roles', null);
  const force = flag('force');
  const listing = flag('plan');

  const { BODIES, ROLE_ACTIONS } = await import(`file://${resolve(root, 'assets-cast/manifest.mjs')}`);
  const { CAST_MESH_IDS } = await import(`file://${cachePath('cast-meshes.mjs')}`)
    .catch(() => ({ CAST_MESH_IDS: null }));
  const registered = CAST_MESH_IDS ?? Object.values(BODIES).map((b) => b.castId);

  const plan = planCast(BODIES, registered, ROLE_ACTIONS, { only, roles });
  console.log(formatPlan(plan));
  if (plan.problems.length > 0) {
    console.error(`\n${plan.problems.length} problem(s) — nothing was requested.`);
    process.exit(1);
  }
  if (listing) {
    console.log('\n  --plan: nothing requested. Drop it to spend the credits above.');
    return;
  }

  /** @type {string[]} */
  const failed = [];
  let made = 0;
  let skipped = 0;

  for (const entry of plan.entries) {
    const body = BODIES[entry.body];
    console.log(`\n${entry.body}:`);
    const plain = resolve(root, `.crown-private/cast-source/plain/${entry.body}.glb`);
    const sourceGlb = (await exists(plain))
      ? plain
      : resolve(root, `.crown-private/cast-source/${entry.body}.glb`);
    if (sourceGlb !== plain) {
      console.log(`  ! no stripped mesh at ${plain.replace(`${root}/`, '')} — sending the rigged file,`);
      console.log('    which this pipeline has already measured as producing a ruined body.');
    }
    if (!(await exists(sourceGlb))) {
      console.error(`  ✖ no source at ${sourceGlb} — this stage rigs a body, it does not make one`);
      failed.push(entry.body);
      continue;
    }

    let rigId = null;
    try {
      const cached = await readFile(rigCachePath(entry.body), 'utf8').then(JSON.parse).catch(() => null);
      if (cached !== null && !force) {
        rigId = cached.rigTaskId;
        console.log(`  = rig ${rigId} (cached, free)`);
      } else {
        const bytes = await readFile(sourceGlb);
        const created = await call('/rigging', {
          method: 'POST',
          body: JSON.stringify({
            model_url: `data:model/gltf-binary;base64,${bytes.toString('base64')}`,
            height_meters: body.heightMeters ?? 1.7,
          }),
        });
        rigId = created.result;
        await mkdir(dirname(rigCachePath(entry.body)), { recursive: true });
        await writeFile(rigCachePath(entry.body), JSON.stringify({ rigTaskId: rigId }, null, 2));
        const task = await settle('rigging', rigId);
        process.stdout.write('\r');
        console.log(`  + rig ${rigId}`);

        for (const [name, url] of [
          ['rigged', task.result?.rigged_character_glb_url ?? task.rigged_character_glb_url],
          ['walk', task.result?.basic_animations?.walking_glb_url ?? task.basic_animations?.walking_glb_url],
          ['run', task.result?.basic_animations?.running_glb_url ?? task.basic_animations?.running_glb_url],
        ]) {
          if (typeof url !== 'string' || url === '') {
            console.log(`  ! rig returned no ${name} url`);
            continue;
          }
          const where = name === 'rigged'
            ? resolve(root, `.crown-private/cast-source/rigged/${entry.body}.glb`)
            : resolve(root, `.crown-private/cast-source/clips/${entry.body}/${name}.glb`);
          console.log(`  + ${name} (with the rig, no extra credit), ${await download(url, where)} bytes`);
        }
        await writeProvenance(entry.body, {
          service: 'meshy.ai',
          rigTaskId: rigId,
          modelVersion: task.model_version ?? 'unknown',
          generatedAt: new Date().toISOString(),
          brief: body.brief,
          licence: 'unknown',
        });
      }
    } catch (e) {
      console.error(`  ✖ rig: ${e instanceof Error ? e.message : String(e)}`);
      failed.push(entry.body);
      continue;
    }

    for (const role of entry.roles) {
      const outPath = resolve(root, `.crown-private/cast-source/clips/${entry.body}/${role.role}.glb`);
      if (!force && (await exists(outPath))) {
        skipped += 1;
        console.log(`  = ${role.role} (exists)`);
        continue;
      }
      try {
        const created = await call('/animations', {
          method: 'POST',
          body: JSON.stringify({ rig_task_id: rigId, action_id: role.actionId }),
        });
        const task = await settle('animations', created.result);
        process.stdout.write('\r');
        const size = await download(task.result.animation_glb_url, outPath);
        made += 1;
        console.log(`  + ${role.role} → ${role.action} (#${role.actionId}), ${size} bytes`);
        await writeProvenance(entry.body, {
          [`clip_${role.role}`]: {
            animationTaskId: created.result,
            actionId: role.actionId,
            action: role.action,
            at: new Date().toISOString(),
          },
        });
      } catch (e) {
        failed.push(`${entry.body}:${role.role}`);
        console.error(`  ✖ ${role.role}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  console.log(`\n${made} written, ${skipped} already there, ${failed.length} failed`);
  if (failed.length > 0) {
    console.error(`re-run to retry: --body=${[...new Set(failed.map((f) => f.split(':')[0]))].join(',')}`);
    process.exit(1);
  }
  console.log('\nlicence is written as `unknown` and this script will not guess it (§9 item 9).');
  console.log('Read Meshy’s terms as published today and write them into assets-cast/manifest.mjs.');
  console.log('Then retarget the clips onto the donor rig and look at them: npm run cast:preview');
};

await main();
