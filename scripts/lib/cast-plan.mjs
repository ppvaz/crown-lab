
const UNKNOWN = 'unknown';

export const RIG_CREDITS = 5;
export const CLIP_CREDITS = 3;

export const PROVENANCE_FIELDS = Object.freeze([
  'service', 'modelVersion', 'generationId', 'prompt', 'generatedAt', 'licence',
]);

const LICENCE_CONCLUSIONS = Object.freeze([
  'permitted', 'allowed', 'fine', 'ok', 'probably', 'assumed', 'should be', 'we believe',
  'runtime-only', 'bake', 'no names',
]);

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

/**
 * @typedef {{ body: string, reason: string }} Problem
 * @typedef {{ body: string, castId: string, rig: boolean, roles: { role: string, actionId: number, action: string }[], credits: number }} PlanEntry
 * @typedef {{ entries: PlanEntry[], problems: Problem[], credits: number }} Plan
 */

/**
 * Every reason this manifest should not be taken to a paid endpoint.
 *
 * @param {Record<string, any>} bodies the manifest's `BODIES`
 * @param {readonly string[]} registered every id `cast-meshes-lab.ts` knows
 * @param {Record<string, { actionId: number, action: string }>} roleActions
 * @returns {Problem[]}
 */
export const validateCast = (bodies, registered, roleActions) => {
  /** @type {Problem[]} */
  const problems = [];
  const seen = new Set();

  for (const [name, body] of Object.entries(bodies)) {
    const say = (reason) => problems.push({ body: name, reason });

    for (const field of PROVENANCE_FIELDS) {
      if (body[field] === undefined || body[field] === '') {
        say(`${field} is missing — write ${UNKNOWN} rather than leaving it out (§2)`);
      }
    }

    if (body.castId === undefined) {
      say('castId is missing, so nothing joins this entry to the registry');
    } else if (!registered.includes(body.castId)) {
      say(`castId "${body.castId}" is not registered in cast-meshes-lab.ts`);
    } else if (seen.has(body.castId)) {
      say(`castId "${body.castId}" is claimed by two entries`);
    } else {
      seen.add(body.castId);
    }

    if (body.briefIsRecord === true && body.prompt === UNKNOWN) {
      say('briefIsRecord says the brief is the prompt, but prompt is unknown');
    }
    if (body.briefIsRecord === false && body.prompt !== UNKNOWN && body.prompt === body.brief) {
      say('prompt repeats a brief marked as not a record — that is a guess wearing a fact’s field');
    }

    if (body.licence !== UNKNOWN && body.licence !== undefined) {
      const lower = String(body.licence).toLowerCase();
      const conclusion = LICENCE_CONCLUSIONS.find((word) => lower.includes(word));
      if (conclusion !== undefined) {
        say(`licence reads as a conclusion, not a citation ("${conclusion}") — §9 item 9 is open`);
      }
    }

    if (body.generatedAt !== UNKNOWN && body.generatedAt !== undefined
      && !TIMESTAMP.test(String(body.generatedAt))) {
      say(`generatedAt "${body.generatedAt}" is neither a timestamp nor ${UNKNOWN}`);
    }
    if (body.generatedAt !== UNKNOWN && body.evidence === undefined) {
      say('generatedAt is stated but evidence does not say how it is known');
    }
  }

  for (const [role, spec] of Object.entries(roleActions)) {
    if (!Number.isInteger(spec.actionId) || spec.actionId < 0) {
      problems.push({ body: '(roles)', reason: `${role} has no usable actionId` });
    }
  }

  for (const [name, body] of Object.entries(bodies)) {
    for (const [role, spec] of Object.entries(body.roleActions ?? {})) {
      if (!Number.isInteger(spec.actionId) || spec.actionId < 0) {
        problems.push({ body: name, reason: `${role} has no usable actionId` });
      }
    }
  }

  return problems;
};

/**
 * What `npm run cast:gen` would request, and what it would cost.
 *
 * **Measured off the API, not read off the marketing page.** A rigging task reports
 * `consumed_credits: 5` and an animation reports **3**, not the 1 this module assumed on its first
 * pass — so a six-role body is 23 credits rather than 11, and the whole cast is 115 rather than 55.
 * Getting that wrong by 2× is exactly the failure a free planner exists to prevent, and it was
 * caught the only way it could be: by spending six credits on one clip and reading the receipt.
 *
 * The figures are constants here rather than a lookup because the task response carries
 * `consumed_credits` *after* the fact; `gen-cast.mjs` prints the real total when a run ends, which
 * is what would catch a price change.
 *
 * @param {Record<string, any>} bodies
 * @param {readonly string[]} registered
 * @param {Record<string, { actionId: number, action: string }>} roleActions
 * @param {{ only?: readonly string[] | null, roles?: readonly string[] | null }} [want]
 * @returns {Plan}
 */
export const planCast = (bodies, registered, roleActions, want = {}) => {
  const only = want.only ?? null;
  const wantedRoles = want.roles ?? null;
  const problems = validateCast(bodies, registered, roleActions);

  /** @type {PlanEntry[]} */
  const entries = [];
  for (const [name, body] of Object.entries(bodies)) {
    if (only !== null && !only.includes(name)) continue;
    const roles = Object.entries({ ...roleActions, ...(body.roleActions ?? {}) })
      .filter(([role]) => wantedRoles === null || wantedRoles.includes(role))
      .map(([role, spec]) => ({ role, ...spec }));
    entries.push({ body: name, castId: body.castId, rig: true, roles, credits: RIG_CREDITS + roles.length * CLIP_CREDITS });
  }

  if (only !== null) {
    for (const name of only) {
      if (bodies[name] === undefined) problems.push({ body: name, reason: 'no such body in the manifest' });
    }
  }

  return { entries, problems, credits: entries.reduce((sum, e) => sum + e.credits, 0) };
};

/** @param {Plan} plan */
export const formatPlan = (plan) => {
  const lines = [];
  for (const entry of plan.entries) {
    lines.push(`  ${entry.body} → ${entry.castId}: rig + ${entry.roles.length} clip(s), ${entry.credits} credits`);
    for (const role of entry.roles) lines.push(`      ${role.role.padEnd(9)} ${role.action} (#${role.actionId})`);
  }
  lines.push(`\n  ${plan.entries.length} body(ies), ${plan.credits} credits total`);
  for (const problem of plan.problems) lines.push(`  ✖ ${problem.body}: ${problem.reason}`);
  return lines.join('\n');
};
