
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { flag, listArg, valueArg } from './lib/args.mjs';
import { formatConceptPlan, planConcepts } from './lib/concept-plan.mjs';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, valueArg('manifest', '.crown-private/concept-art/manifest.json'));
const only = listArg('only', listArg('id', []));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const plan = planConcepts(manifest, { only: only.length > 0 ? only : null });

console.log(formatConceptPlan(plan));
if (plan.problems.length > 0) process.exitCode = 1;

if (flag('write') && plan.problems.length === 0) {
  const withoutPrompt = plan.entries.filter((entry) => entry.prompt === 'unknown');
  if (withoutPrompt.length > 0) {
    console.error(`cannot write generation jobs with an unknown prompt: ${withoutPrompt.map((entry) => entry.id).join(', ')}`);
    console.error('record a revision prompt in the manifest; do not reconstruct the prompt that made the old image');
    process.exit(1);
  }
  const jobs = resolve(root, 'captures/concepts/jobs');
  await mkdir(jobs, { recursive: true });
  for (const entry of plan.entries) {
    const job = {
      version: 1,
      generatedFrom: valueArg('manifest', '.crown-private/concept-art/manifest.json'),
      ...entry,
      reviewGate: 'Do not wire until every panel maps to its intended state and invariants hold.',
      next: `npm run concept:ingest -- --id=${entry.id} --input=<generated.png>`,
    };
    const jsonPath = resolve(jobs, `${entry.id}.json`);
    const mdPath = resolve(jobs, `${entry.id}.md`);
    const md = [
      `# ${entry.title}`,
      '', entry.brief, '', '## Exact prompt', '', entry.prompt, '', '## References', '',
      ...entry.references.map((ref) => `- \`${ref.path}\` — ${ref.role}`),
      '', '## Panel/state map', '',
      ...entry.panels.map((panel) => `${panel.order}. **${panel.region} — ${panel.state}:** ${panel.description}\n   Cues: ${panel.cues.join('; ')}\n   Invariants: ${panel.invariants.join('; ')}`),
      '', '## Review and ingest', '', `Expected output: \`${entry.output}\``, '',
      `\`npm run concept:ingest -- --id=${entry.id} --input=<generated.png>\``, '',
    ].join('\n');
    await atomicWrite(jsonPath, `${JSON.stringify(job, null, 2)}\n`);
    await atomicWrite(mdPath, md);
    console.log(`wrote ${jsonPath.slice(root.length + 1)}`);
    console.log(`wrote ${mdPath.slice(root.length + 1)}`);
  }
}

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const part = `${path}.part`;
  await writeFile(part, contents);
  await rename(part, path);
}
