
export const CONFIDENCE = Object.freeze(['unknown', 'advertised', 'receipt']);

export const UNKNOWN = 'unknown';

/**
 * @typedef {{
 *   vendor: string, unit: string, credits: number | null, usd: number | null,
 *   confidence: 'unknown' | 'advertised' | 'receipt', evidence: string, howToPrice: string | null,
 * }} Rate
 */

/** @type {Readonly<Record<string, Rate>>} */
export const RATES = Object.freeze({
  'meshy.rig': {
    vendor: 'meshy',
    unit: 'one rigging task',
    credits: 5,
    usd: null,
    confidence: 'receipt',
    evidence: '`consumed_credits` on a real run, 2026-08-10 (scripts/lib/cast-plan.mjs RIG_CREDITS)',
    howToPrice: null,
  },
  'meshy.clip': {
    vendor: 'meshy',
    unit: 'one animation clip',
    credits: 3,
    usd: null,
    confidence: 'receipt',
    evidence:
      'a receipt, 2026-08-10, after this pipeline planned against an assumed 1 and was wrong — ' +
      'cast-plan.mjs: a six-role body is 23, not 11',
    howToPrice: null,
  },
  'meshy.mesh': {
    vendor: 'meshy',
    unit: 'one textured image-to-3d task',
    credits: 15,
    usd: null,
    confidence: 'receipt',
    evidence:
      'two receipts, both 15, on 2026-08-11 — the guardroom whole-room probe and the chest ' +
      '(§5E.3). Two receipts are not a table',
    howToPrice: null,
  },
  'elevenlabs.sample': {
    vendor: 'elevenlabs',
    unit: 'one generated sample',
    credits: null,
    usd: null,
    confidence: 'unknown',
    evidence:
      'a 10 000-credit quota was exhausted mid-batch on 2026-08-10, three samples into a ' +
      'fourteen-sample pack, and the per-sample figure was never read off anything',
    howToPrice:
      'the 4xx body states the exact cost and the balance when a quota runs out, and ' +
      'audio-providers.mjs already forwards that body — so one refused request prices it. Until ' +
      'then the honest unit is seconds requested, which `npm run audio:plan` prints',
  },
  'suno.sound': {
    vendor: 'suno',
    unit: 'one Sounds generation',
    credits: null,
    usd: 0.01,
    confidence: 'advertised',
    evidence:
      '~$0.01 a generation on the vendor page, a tenth of what the same sample cost through ' +
      'ElevenLabs (§4.8). A page, not a receipt: the credit cost is unread',
    howToPrice:
      '`suno.credits(key)` in audio-providers.mjs reads the balance for free, and gen-audio ' +
      'already prints it. One balance either side of a single generation is the whole measurement',
  },
  'suno.track': {
    vendor: 'suno',
    unit: 'one music generation',
    credits: null,
    usd: null,
    confidence: 'unknown',
    evidence:
      'the five shipped recordings were made through the website rather than the API, and what ' +
      'was recorded about each of them is a generation id and a prompt — never a cost',
    howToPrice: 'nothing here sends one. Pricing it means adopting the endpoint first',
  },
  'concept.image': {
    vendor: 'concept',
    unit: 'one concept image',
    credits: null,
    usd: null,
    confidence: 'unknown',
    evidence:
      'generation is interactive and deliberately outside Node (scripts/lib/concept-plan.mjs ' +
      'header), so no per-call figure has ever passed through this tree',
    howToPrice: 'read the subscription the images are drawn against; there is no per-call receipt',
  },
});

/**
 * @typedef {{ body?: number, prop?: number, cue?: number, track?: number, concept?: number,
 *             rolls?: number, provider?: string }} Ask
 * @typedef {{ task: string, count: number, why: string }} Item
 */

/**
 * The ask's own vocabulary, expanded into tasks.
 *
 * @param {Ask} ask
 * @param {{ clipRoles: number }} context the manifest's role count, passed rather than restated
 * @returns {Item[]}
 */
export const expandAsk = (ask, context) => {
  const rolls = ask.rolls ?? 1;
  const provider = ask.provider ?? 'elevenlabs';
  const sampleTask = provider === 'suno' ? 'suno.sound' : 'elevenlabs.sample';
  /** @type {Item[]} */
  const items = [];

  if (ask.body) {
    items.push({ task: 'meshy.rig', count: ask.body, why: `${ask.body} body(ies)` });
    items.push({
      task: 'meshy.clip',
      count: ask.body * context.clipRoles,
      why: `${context.clipRoles} clip roles each, read from the cast manifest`,
    });
  }
  if (ask.prop) items.push({ task: 'meshy.mesh', count: ask.prop, why: `${ask.prop} prop(s)` });
  if (ask.cue) {
    items.push({
      task: sampleTask,
      count: ask.cue * rolls,
      why: rolls === 1 ? `${ask.cue} cue(s), one roll each` : `${ask.cue} cue(s) × ${rolls} rolls`,
    });
  }
  if (ask.track) {
    items.push({
      task: 'suno.track',
      count: ask.track * rolls,
      why: rolls === 1 ? `${ask.track} track(s), one roll each` : `${ask.track} track(s) × ${rolls} rolls`,
    });
  }
  if (ask.concept) items.push({ task: 'concept.image', count: ask.concept, why: `${ask.concept} image(s)` });

  return items;
};

/**
 * @typedef {{ vendor: string, credits: number, usd: number, priced: number, unpriced: number,
 *             confidence: 'unknown' | 'advertised' | 'receipt' }} VendorBill
 * @typedef {{ items: (Item & { rate: Rate, credits: number | null, usd: number | null })[],
 *             vendors: VendorBill[], unpriced: string[] }} Budget
 */

/**
 * The bill, per vendor, with every unpriced task kept out of the totals and counted beside them.
 *
 * @param {Ask} ask
 * @param {{ clipRoles: number }} context
 * @returns {Budget}
 */
export const planBudget = (ask, context) => {
  const items = expandAsk(ask, context).map((item) => {
    const rate = RATES[item.task];
    if (rate === undefined) throw new Error(`no rate for task "${item.task}"`);
    return {
      ...item,
      rate,
      credits: rate.credits === null ? null : rate.credits * item.count,
      usd: rate.usd === null ? null : rate.usd * item.count,
    };
  });

  /** @type {Map<string, VendorBill>} */
  const vendors = new Map();
  for (const item of items) {
    const bill = vendors.get(item.rate.vendor) ?? {
      vendor: item.rate.vendor,
      credits: 0,
      usd: 0,
      priced: 0,
      unpriced: 0,
      confidence: 'receipt',
    };
    if (item.credits === null) bill.unpriced += item.count;
    else {
      bill.credits += item.credits;
      bill.priced += item.count;
    }
    if (item.usd !== null) bill.usd += item.usd;
    if (CONFIDENCE.indexOf(item.rate.confidence) < CONFIDENCE.indexOf(bill.confidence)) {
      bill.confidence = item.rate.confidence;
    }
    vendors.set(item.rate.vendor, bill);
  }

  return {
    items,
    vendors: [...vendors.values()],
    unpriced: [...new Set(items.filter((i) => i.credits === null).map((i) => i.task))],
  };
};

/**
 * The budget as the tool prints it.
 *
 * @param {Budget} budget
 * @returns {string}
 */
export const formatBudget = (budget) => {
  if (budget.items.length === 0) return '  nothing asked for. Try: npm run budget -- body=1 prop=11 cue=14';

  const lines = [];
  for (const item of budget.items) {
    const cost = item.credits === null ? `${UNKNOWN} × ${item.count}` : `${item.credits} credits`;
    lines.push(`  ${item.task.padEnd(18)} ${String(item.count).padStart(4)} × ${item.rate.unit.padEnd(32)} ${cost}`);
    lines.push(`  ${' '.repeat(18)}      ${item.why}`);
  }

  lines.push('');
  for (const bill of budget.vendors) {
    const parts = [];
    if (bill.priced > 0) {
      parts.push(`${bill.credits} credits over ${bill.priced} task(s), confidence: ${bill.confidence}`);
    }
    if (bill.usd > 0) parts.push(`~$${bill.usd.toFixed(2)} advertised`);
    if (bill.unpriced > 0) parts.push(`${bill.unpriced} task(s) with no rate — NOT in any total above`);
    lines.push(`  ${bill.vendor.padEnd(12)} ${parts.join('; ')}`);
  }

  if (budget.unpriced.length > 0) {
    lines.push('', '  unpriced, and what it would take to price each:');
    for (const task of budget.unpriced) {
      const rate = RATES[task];
      lines.push(`  ✖ ${task}: ${rate.evidence}`);
      if (rate.howToPrice !== null) lines.push(`    → ${rate.howToPrice}`);
    }
  }

  return lines.join('\n');
};

export const formatRates = () => {
  const lines = ['  what one task costs, and how that is known'];
  for (const [task, rate] of Object.entries(RATES)) {
    const cost =
      rate.credits === null
        ? rate.usd === null
          ? UNKNOWN
          : `~$${rate.usd.toFixed(2)}`
        : `${rate.credits} credits`;
    lines.push(`  ${task.padEnd(18)} ${cost.padEnd(12)} ${rate.confidence.padEnd(11)} ${rate.unit}`);
    lines.push(`  ${' '.repeat(18)} ${rate.evidence}`);
    if (rate.howToPrice !== null) lines.push(`  ${' '.repeat(18)} → ${rate.howToPrice}`);
  }
  return lines.join('\n');
};
