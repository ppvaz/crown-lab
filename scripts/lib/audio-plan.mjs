
/**
 * @typedef {import('./audio-plan.d.mts').CueSpec} CueSpec
 * @typedef {import('./audio-plan.d.mts').PlanEntry} PlanEntry
 * @typedef {import('./audio-plan.d.mts').Plan} Plan
 * @typedef {import('./audio-plan.d.mts').Problem} Problem
 */

export const NEGATION_MARKERS = [
  'no',
  'not',
  "n't",
  'non',
  'none',
  'never',
  'without',
  'avoid',
  'absent',
  'lacking',
  'free of',
  'rather than',
  'instead of',
];

export const TAINTED_WORDS = [
  'gavel',
  'cinematic',
  'epic',
  'trailer',
  'mastered',
  'reverb',
  'sound effect',
  'sfx',
  'anime',
  'cartoon',
  'whoosh',
  'ping',
];

export const DURATION_BOUNDS = { min: 0.5, max: 22 };

const DURATION_HEADROOM_MS = 300;

const INFLUENCE_ESSENTIAL = 0.65;
const INFLUENCE_TEXTURE = 0.35;
const INFLUENCE_IMPACT = 0.5;

const TEXTURE_MS = 400;

const escapeRe = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `\b` does not bound `n't` or a two-word phrase usefully, so the boundary is asserted only where
 * the term starts and ends with a word character.
 * @param {string} term
 */
const termPattern = (term) => {
  const body = escapeRe(term);
  const left = /^\w/.test(term) ? '\\b' : '';
  const right = /\w$/.test(term) ? '\\b' : '';
  return new RegExp(`${left}${body}${right}`, 'i');
};

const NEGATION_PATTERNS = NEGATION_MARKERS.map((m) => [m, termPattern(m)]);
const TAINTED_PATTERNS = TAINTED_WORDS.map((w) => [w, termPattern(w)]);

/**
 * Everything wrong with one prompt, as reasons rather than a boolean.
 *
 * All of these are hard: §4.2's lesson cost a sample, and an empty or absent prompt is a paid call
 * for silence.
 * @param {string} text
 * @returns {Problem[]}
 */
export const validatePrompt = (text) => {
  /** @type {Problem[]} */
  const problems = [];
  if (typeof text !== 'string' || text.trim() === '') {
    return [{ kind: 'empty', detail: 'no prompt' }];
  }
  for (const [marker, pattern] of NEGATION_PATTERNS) {
    if (pattern.test(text)) {
      problems.push({
        kind: 'negation',
        detail: `"${marker}" — describe the material instead; negation summons the defect (§4.2)`,
      });
    }
  }
  for (const [word, pattern] of TAINTED_PATTERNS) {
    if (pattern.test(text)) {
      problems.push({
        kind: 'tainted',
        detail: `"${word}" carries its own artefact whatever the rest of the prompt says`,
      });
    }
  }
  return problems;
};

/**
 * The spec shape this module plans against, derived from the runtime's own tables.
 *
 * `material` is carried through rather than recomputed because it is the filename the pack must
 * write — `soundbank.ts` spells those out instead of deriving them from the cue name, since the
 * public build rewrites four of the names and `/audio/${id}/${cue}.ogg` shipped a game fetching
 * `/audio/forged/q5.ogg`.
 *
 * @param {Record<string, { material: string | null, transient: readonly { atMs?: number, durationMs: number }[], tonal: readonly { atMs?: number, durationMs: number }[] }>} cues
 * @param {ReadonlySet<string>} essentialCues
 * @returns {Record<string, CueSpec>}
 */
export const cueSpecsFrom = (cues, essentialCues) =>
  Object.fromEntries(
    Object.entries(cues)
      .filter(([, def]) => def.material !== null)
      .map(([cue, def]) => [
        cue,
        {
          file: def.material,
          layerMs: [...def.tonal, ...def.transient].reduce(
            (end, l) => Math.max(end, (l.atMs ?? 0) + l.durationMs),
            0,
          ),
          essential: essentialCues.has(cue),
        },
      ]),
  );

/**
 * How long a sample to ask for, and how literally.
 *
 * **Duration** is the cue's longest synthesized layer plus a tail, clamped to what the endpoint
 * accepts. Deriving it rather than authoring it is the same argument `lantern_cloister.py` lost by
 * typing its wall runs: the tonal sweeps are the thing the sample plays under, so a retuned cue
 * should move its sample's length without anyone remembering to. Most cues clamp to the 0.5 s floor.
 *
 * **This originally said trimming back to the real length was "stage 2's ffmpeg step, which is free
 * and exact", and stage 2 does no such thing.** The endpoint returns exactly the duration asked for,
 * so every clamped cue is padded: `hollow/step.ogg` is 0.48 s where `forged/step.ogg` is 0.11 s, and
 * the pack costs 3 296 KB decoded against `forged`'s 2 260. The claim is removed rather than
 * implemented because a threshold trim cuts a decay tail, and which part of an impact is tail is the
 * ear's call — §3's rule. The bytes are cached, so trimming any sample later costs no API call.
 *
 * **Influence** is a three-way read of the cue's role. An essential cue carries information nothing
 * else in the mix carries, so adherence wins; a long cue is a texture, where a literal reading is
 * the worse sample; the rest are impacts.
 *
 * @param {CueSpec} spec
 * @returns {{ durationSeconds: number, promptInfluence: number, basis: string }}
 */
export const presetFor = (spec) => {
  const seconds = (spec.layerMs + DURATION_HEADROOM_MS) / 1000;
  const durationSeconds = Math.min(
    DURATION_BOUNDS.max,
    Math.max(DURATION_BOUNDS.min, Math.round(seconds * 10) / 10),
  );
  const promptInfluence = spec.essential
    ? INFLUENCE_ESSENTIAL
    : spec.layerMs > TEXTURE_MS
      ? INFLUENCE_TEXTURE
      : INFLUENCE_IMPACT;
  const basis = spec.essential ? 'essential' : spec.layerMs > TEXTURE_MS ? 'texture' : 'impact';
  return { durationSeconds, promptInfluence, basis };
};

/** @param {import('../../src/assets/audio/manifest.d.mts').PromptEntry} entry */
const authored = (entry) => (typeof entry === 'string' ? { prompt: entry } : entry);

/**
 * The whole batch a pack would run, and every reason not to run it.
 *
 * Nothing here throws: a caller wants the full list, because fixing one prompt per paid run is the
 * cost this module exists to remove. `plan.problems` empty is the only green.
 *
 * `outPath` is repository-relative and computed once, so stage 2's writer and stage 5's completeness
 * check cannot disagree about where a sample lives.
 *
 * @param {Readonly<Record<string, import('../../src/assets/audio/manifest.d.mts').AudioPackManifest>>} packs
 * @param {string} packId
 * @param {Record<string, CueSpec>} specs
 * @returns {Plan}
 */
export const planPack = (packs, packId, specs) => {
  const pack = packs[packId];
  if (pack === undefined) {
    return {
      packId,
      description: '',
      entries: [],
      problems: [{ kind: 'unknown-pack', cue: null, detail: `no pack "${packId}" in the manifest` }],
      totalSeconds: 0,
    };
  }

  /** @type {Problem[]} */
  const problems = [];
  /** @type {PlanEntry[]} */
  const entries = [];

  for (const [cue, spec] of Object.entries(specs)) {
    const entry = pack.prompts[cue];
    if (entry === undefined) {
      problems.push({
        kind: 'missing-cue',
        cue,
        detail: `${spec.file} has no prompt — an incomplete pack falls back to synthesis silently`,
      });
      continue;
    }
    const { prompt, durationSeconds, durationReason, promptInfluence, influenceReason } =
      authored(entry);
    for (const problem of validatePrompt(prompt)) {
      problems.push({ ...problem, cue });
    }

    const derived = presetFor(spec);
    if (durationSeconds !== undefined && durationReason === undefined) {
      problems.push({
        kind: 'unexplained-override',
        cue,
        detail: 'durationSeconds overrides the derivation and needs durationReason',
      });
    }
    if (promptInfluence !== undefined && influenceReason === undefined) {
      problems.push({
        kind: 'unexplained-override',
        cue,
        detail: 'promptInfluence overrides the derivation and needs influenceReason',
      });
    }
    const requested = durationSeconds ?? derived.durationSeconds;
    if (requested < DURATION_BOUNDS.min || requested > DURATION_BOUNDS.max) {
      problems.push({
        kind: 'out-of-bounds',
        cue,
        detail: `${requested}s is outside the endpoint's ${DURATION_BOUNDS.min}–${DURATION_BOUNDS.max}s`,
      });
    }

    entries.push({
      cue,
      file: spec.file,
      outPath: `src/assets/audio/${pack.id}/${spec.file}`,
      prompt,
      durationSeconds: requested,
      promptInfluence: promptInfluence ?? derived.promptInfluence,
      derived,
      overrides: {
        duration: durationSeconds === undefined ? null : durationReason,
        influence: promptInfluence === undefined ? null : influenceReason,
      },
    });
  }

  for (const cue of Object.keys(pack.prompts)) {
    if (specs[cue] === undefined) {
      problems.push({
        kind: 'unknown-cue',
        cue,
        detail: 'no cue by that name takes a material layer — see the manifest header on telegraph and roar',
      });
    }
  }

  return {
    packId: pack.id,
    description: pack.description,
    entries,
    problems,
    totalSeconds: entries.reduce((sum, e) => sum + e.durationSeconds, 0),
  };
};

/**
 * The plan as `--list` prints it, which is the whole of what a free run shows.
 *
 * Seconds requested is the honest size of the bill — the credit rate is the vendor's and changes
 * without this repository hearing about it, so the total is stated in the unit that is actually
 * being asked for.
 *
 * @param {Plan} plan
 * @returns {string}
 */
export const formatPlan = (plan) => {
  const lines = [`pack ${plan.packId} — ${plan.description}`];
  for (const e of plan.entries) {
    const d =
      e.overrides.duration === null
        ? `${e.durationSeconds}s`
        : `${e.durationSeconds}s (derived ${e.derived.durationSeconds}s — ${e.overrides.duration})`;
    const i =
      e.overrides.influence === null
        ? `${e.promptInfluence} ${e.derived.basis}`
        : `${e.promptInfluence} (derived ${e.derived.promptInfluence} — ${e.overrides.influence})`;
    lines.push(`  ${e.cue.padEnd(13)} ${d.padEnd(10)} influence ${i}`);
    lines.push(`  ${' '.repeat(13)} ${e.prompt}`);
  }
  lines.push(
    `  ${plan.entries.length} samples, ${plan.totalSeconds.toFixed(1)}s requested, into src/assets/audio/${plan.packId}/`,
  );
  for (const p of plan.problems) {
    lines.push(`  ✖ ${p.cue ?? 'pack'}: ${p.kind} — ${p.detail}`);
  }
  return lines.join('\n');
};
