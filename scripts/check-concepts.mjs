
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { valueArg } from './lib/args.mjs';
import { validateConceptManifest } from './lib/concept-plan.mjs';
import { pngSize } from './lib/png.mjs';

const root = resolve(import.meta.dirname, '..');
const manifestRelative = valueArg('manifest', '.crown-private/concept-art/manifest.json');
const manifest = JSON.parse(await readFile(resolve(root, manifestRelative), 'utf8'));
const problems = validateConceptManifest(manifest).map((p) => `${p.id}.${p.field}: ${p.reason}`);
const registry = await json('.crown-private/concept-art/registry.json', problems);

for (const [id, entry] of Object.entries(manifest.entries)) {
  if (entry.status !== 'approved') continue;
  try {
    const bytes = await readFile(resolve(root, entry.output));
    const raster = pngSize(bytes);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const registered = registry?.entries?.[id];
    if (!registered) problems.push(`${id}: approved but absent from private registry`);
    else {
      if (registered.asset !== entry.output) problems.push(`${id}: registry asset disagrees with manifest`);
      if (registered.sha256 !== hash) problems.push(`${id}: registry hash disagrees with approved PNG`);
      if (registered.width !== raster.width || registered.height !== raster.height) problems.push(`${id}: registry dimensions disagree with approved PNG`);
      const expectedPanels = entry.panels.map((panel) => ({ id: panel.id, order: panel.order, state: panel.state }));
      if (JSON.stringify(registered.panels) !== JSON.stringify(expectedPanels)) {
        problems.push(`${id}: registry panel/state map disagrees with manifest`);
      }
    }
    const record = await json(`.crown-private/concept-art/records/${id}.json`, problems);
    if (record?.sha256 !== hash || record?.status !== 'approved') problems.push(`${id}: approval record is absent or stale`);
    if (JSON.stringify(record?.panels) !== JSON.stringify(entry.panels)) problems.push(`${id}: approval record panel/state map is stale`);
    const handoff = await json(entry.downstream.handoff, problems);
    if (handoff?.conceptId !== id || handoff?.approvedAsset !== entry.output) problems.push(`${id}: downstream handoff is absent or stale`);
    if (JSON.stringify(handoff?.panels) !== JSON.stringify(entry.panels)) problems.push(`${id}: downstream panel/state map is stale`);
  } catch (error) {
    problems.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`concept check: ${Object.keys(manifest.entries).length} entries, approved files and handoffs agree`);
}

async function json(relative, problems) {
  try { return JSON.parse(await readFile(resolve(root, relative), 'utf8')); }
  catch (error) {
    problems.push(`${relative}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
