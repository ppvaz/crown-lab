
import { valueArg, flag } from './lib/args.mjs';
import { formatBudget, formatRates, planBudget } from './lib/budget.mjs';

const { ROLE_ACTIONS } = await import('../assets-cast/manifest.mjs');

const num = (name) => {
  const raw = valueArg(name, null);
  if (raw === null) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    console.error(`--${name}=${raw} is not a count`);
    process.exit(1);
  }
  return value;
};

if (flag('rates')) {
  console.log(formatRates());
  process.exit(0);
}

const provider = valueArg('provider', 'elevenlabs');
const ask = {
  body: num('body'),
  prop: num('prop'),
  cue: num('cue'),
  track: num('track'),
  concept: num('concept'),
  rolls: Math.max(1, num('rolls') || 1),
  provider,
};

const budget = planBudget(ask, { clipRoles: Object.keys(ROLE_ACTIONS).length });

console.log(`\n  ask: ${JSON.stringify(ask)}\n`);
console.log(formatBudget(budget));
console.log('\n  Credits only. Whether the result is worth having is `cast:preview` and an eye:');
console.log('  the clip set that measured perfectly was rejected on sight, and no bill would have');
console.log('  said so. Nothing here was sent, so nothing here was spent.\n');

const priced = budget.vendors.some((bill) => bill.priced > 0);
if (budget.items.length > 0 && !priced) process.exitCode = 1;
