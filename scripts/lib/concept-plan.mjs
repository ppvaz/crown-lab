
export const CONCEPT_KINDS = Object.freeze(['character', 'prop', 'room']);
export const CONCEPT_STATUSES = Object.freeze(['draft', 'review', 'approved', 'retired']);
export const PROVENANCE_FIELDS = Object.freeze([
  'service', 'modelVersion', 'generationId', 'generatedAt', 'licence', 'evidence',
]);

const OUTPUT_FOLDER = Object.freeze({ character: 'cast', prop: 'props', room: 'rooms' });
const PIPELINE = Object.freeze({ character: 'cast', prop: 'prop', room: 'room' });
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

/** @typedef {{ id: string, field: string, reason: string }} ConceptProblem */

const text = (value) => typeof value === 'string' && value.trim().length > 0;
const list = (value) => Array.isArray(value) && value.length > 0;

/**
 * @param {any} manifest
 * @returns {ConceptProblem[]}
 */
export const validateConceptManifest = (manifest) => {
  /** @type {ConceptProblem[]} */
  const problems = [];
  const say = (id, field, reason) => problems.push({ id, field, reason });

  if (manifest?.version !== 1) say('(manifest)', 'version', 'must be 1');
  if (!text(manifest?.styleGuide)) say('(manifest)', 'styleGuide', 'must name the durable style reference');
  if (manifest?.entries === null || typeof manifest?.entries !== 'object' || Array.isArray(manifest?.entries)) {
    say('(manifest)', 'entries', 'must be an object keyed by stable concept id');
    return problems;
  }

  for (const [id, entry] of Object.entries(manifest.entries)) {
    const e = /** @type {any} */ (entry);
    const at = (field, reason) => say(id, field, reason);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) at('id', 'must be kebab-case');
    if (!CONCEPT_KINDS.includes(e.kind)) at('kind', `must be one of ${CONCEPT_KINDS.join(', ')}`);
    if (!CONCEPT_STATUSES.includes(e.status)) at('status', `must be one of ${CONCEPT_STATUSES.join(', ')}`);
    for (const field of ['title', 'brief', 'prompt', 'output']) {
      if (!text(e[field])) at(field, 'is required; write unknown when provenance was not recorded');
    }

    const folder = OUTPUT_FOLDER[e.kind];
    if (folder && (!String(e.output ?? '').startsWith(`.crown-private/concept-art/${folder}/`)
      || !String(e.output).toLowerCase().endsWith('.png'))) {
      at('output', `must be an explicit PNG under .crown-private/concept-art/${folder}/`);
    }
    if (e.status !== 'approved' && e.status !== 'retired' && e.prompt === 'unknown') {
      at('prompt', 'cannot plan a new generation from unknown; record the exact prompt first');
    }

    if (!list(e.references)) at('references', 'must name at least one stable reference and its role');
    for (const [index, ref] of (e.references ?? []).entries()) {
      if (!text(ref?.path) || !text(ref?.role)) at(`references[${index}]`, 'needs path and role');
      if (String(ref?.path ?? '').startsWith('/var/') || String(ref?.path ?? '').startsWith('captures/')) {
        at(`references[${index}].path`, 'must be stable; clipboard temp files and captures are not sources');
      }
    }
    if (!list(e.sources) || e.sources.some((source) => !text(source))) {
      at('sources', 'must name the behavior, scale, geometry, or presentation sources the brief was read from');
    }

    if (!list(e.panels)) at('panels', 'must map every intended panel or pose to an authored state');
    const panelIds = new Set();
    const orders = new Set();
    for (const [index, panel] of (e.panels ?? []).entries()) {
      const field = `panels[${index}]`;
      for (const key of ['id', 'region', 'state', 'description']) {
        if (!text(panel?.[key])) at(`${field}.${key}`, 'is required');
      }
      if (!Number.isInteger(panel?.order) || panel.order < 1) at(`${field}.order`, 'must be a positive integer');
      if (panelIds.has(panel?.id)) at(`${field}.id`, `duplicates panel id ${panel?.id}`);
      if (orders.has(panel?.order)) at(`${field}.order`, `duplicates reading order ${panel?.order}`);
      panelIds.add(panel?.id);
      orders.add(panel?.order);
      if (!list(panel?.cues) || panel.cues.some((cue) => !text(cue))) at(`${field}.cues`, 'must name visible cues');
      if (!list(panel?.invariants) || panel.invariants.some((rule) => !text(rule))) {
        at(`${field}.invariants`, 'must state what may not drift between poses');
      }
    }

    if (!text(e.downstream?.target) || !text(e.downstream?.handoff)) {
      at('downstream', 'needs an explicit target and private handoff path');
    }
    if (e.kind && e.downstream?.pipeline !== PIPELINE[e.kind]) {
      at('downstream.pipeline', `${e.kind} concepts hand off to ${PIPELINE[e.kind]}`);
    }
    if (!String(e.downstream?.handoff ?? '').startsWith('.crown-private/concept-art/handoffs/')) {
      at('downstream.handoff', 'must stay in the private concept handoff tree');
    }

    for (const field of PROVENANCE_FIELDS) {
      if (!text(e.provenance?.[field])) at(`provenance.${field}`, 'is mandatory; write unknown rather than guessing');
    }
    if (e.provenance?.generatedAt !== undefined && e.provenance.generatedAt !== 'unknown'
      && !TIMESTAMP.test(e.provenance.generatedAt)) {
      at('provenance.generatedAt', 'must be an ISO-ish date/timestamp or unknown');
    }
    if (e.provenance?.generatedAt !== 'unknown' && !text(e.provenance?.evidence)) {
      at('provenance.evidence', 'must say how the stated generation date is known');
    }

    if (e.kind === 'character') {
      if (!list(e.character?.behaviorSources) || e.character.behaviorSources.some((source) => !text(source))) {
        at('character.behaviorSources', 'must identify the files that own this character’s behavior');
      }
    } else if (e.kind === 'prop') {
      for (const field of ['scaleOwner', 'attachment', 'runtimeRole']) {
        if (!text(e.prop?.[field])) at(`prop.${field}`, 'is required for a buildable prop');
      }
      if (!list(e.prop?.requiredViews)) at('prop.requiredViews', 'must declare the views needed to model it');
    } else if (e.kind === 'room') {
      for (const field of ['encounter', 'standing', 'geometrySource', 'cameraContract']) {
        if (!text(e.room?.[field])) at(`room.${field}`, 'is required for a measurable room reference');
      }
      if (!['geometry', 'look-only'].includes(e.room?.standing)) {
        at('room.standing', 'must be geometry or look-only');
      }
      if (!list(e.room?.layerIntent)) at('room.layerIntent', 'must map the image to room package layers');
    }
  }
  return problems;
};

/**
 * @param {any} manifest
 * @param {{ only?: readonly string[] | null }} [want]
 */
export const planConcepts = (manifest, want = {}) => {
  const only = want.only ?? null;
  const problems = validateConceptManifest(manifest);
  const entries = [];
  for (const [id, entry] of Object.entries(manifest.entries ?? {})) {
    if (only !== null && !only.includes(id)) continue;
    const e = /** @type {any} */ (entry);
    if (e.status === 'retired') continue;
    entries.push({
      id,
      kind: e.kind,
      title: e.title,
      brief: e.brief,
      prompt: e.prompt,
      styleGuide: manifest.styleGuide,
      references: e.references,
      panels: [...(e.panels ?? [])].sort((a, b) => a.order - b.order),
      output: e.output,
      downstream: e.downstream,
    });
  }
  if (only !== null) {
    for (const id of only) {
      if (!Object.hasOwn(manifest.entries ?? {}, id)) problems.push({ id, field: 'id', reason: 'no such concept' });
    }
  }
  return { entries, problems };
};

/** @param {ReturnType<typeof planConcepts>} plan */
export const formatConceptPlan = (plan) => {
  const lines = [];
  for (const entry of plan.entries) {
    lines.push(`${entry.id} [${entry.kind}] -> ${entry.output}`);
    for (const panel of entry.panels) lines.push(`  ${panel.order}. ${panel.region}: ${panel.state} — ${panel.description}`);
    lines.push(`  handoff: ${entry.downstream.pipeline} / ${entry.downstream.target}`);
  }
  if (plan.problems.length > 0) {
    lines.push('REFUSED:');
    for (const problem of plan.problems) lines.push(`  ${problem.id}.${problem.field}: ${problem.reason}`);
  }
  return lines.join('\n');
};

