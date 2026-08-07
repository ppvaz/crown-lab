import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { launchChrome, startViteServer, waitForServer } from './lib/harness.mjs';
import { listArg, valueArg } from './lib/args.mjs';

const PORT = 5199;
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;
const ROLES = [
  'player',
  'guard',
  'duelist',
  'archer',
  'first_blade',
  'captain',
  'captain_read',
  'rain_boss',
  'chancellor',
  'elite_guard',
  'pike_novice',
  'pike_boss',
  'thorn_marshal',
  'queen',
];
const STATES = {
  idle: 0,
  move: 180,
  guard: 900,
  parry: 900,
  windup: 900,
  telegraph: 900,
  'telegraph-jab': 900,
  'telegraph-chop': 900,
  'telegraph-sweep': 900,
  'telegraph-thrust': 900,
  active: 900,
  attack: 900,
  'attack-jab': 900,
  'attack-chop': 900,
  'attack-sweep': 900,
  'attack-thrust': 900,
  recovery: 900,
  stagger: 900,
  dead: 0,
};


const IDENTITIES = [
  'ivory_heir',
  'crimson_oath',
  'azure_envoy',
  'verdant_watch',
  'violet_seal',
  'ember_pilgrim',
  'silver_mourner',
  'rose_duelist',
];

const rawIdentities = listArg('identities', []);
const identities = rawIdentities.includes('all') ? IDENTITIES : rawIdentities;
const roles = identities.length > 0 ? ['player'] : listArg('roles', ROLES);
const states = listArg('states', Object.keys(STATES));
const bank = valueArg('bank', 'silhouette');
const unknownRoles = roles.filter((role) => !ROLES.includes(role));
const unknownStates = states.filter((state) => STATES[state] === undefined);
if (unknownRoles.length > 0 || unknownStates.length > 0) {
  throw new Error(
    [
      unknownRoles.length === 0 ? '' : `unknown roles: ${unknownRoles.join(', ')}`,
      unknownStates.length === 0 ? '' : `unknown states: ${unknownStates.join(', ')}`,
    ]
      .filter(Boolean)
      .join('; '),
  );
}

const { proc: server, state: serverState } = startViteServer({ port: PORT, host: HOST });

let browser;
try {
  await waitForServer(BASE, serverState);
  browser = await launchChrome();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`Browser: ${error.message}`));
  const failures = [];

  for (const identity of identities.length > 0 ? identities : [null]) {
    for (const role of roles) {
      const bankSuffix = bank === 'silhouette' ? '' : `-${bank}`;
      const directory =
        identity === null
          ? `captures/validation/model-states/${role}${bankSuffix}`
          : `captures/validation/king-identities/${identity}`;
      await mkdir(directory, { recursive: true });
      for (const state of states) {
        const time = STATES[state];
        const label = `${identity === null ? role : identity}/${state}@${time}${bankSuffix}`;
        const query = new URLSearchParams({
          turntable: role,
          turntableState: state,
          turntableTime: String(time),
        });
        if (identity !== null) query.set('turntableIdentity', identity);
        if (bank !== 'silhouette') query.set('turntableBank', bank);
        try {
          await page.goto(`${BASE}/?${query}`);
          const dressed = identity === null ? '' : `[data-turntable-identity="${identity}"]`;
          await page.waitForSelector(
            `html[data-turntable-ready="true"][data-turntable-role="${role}"][data-turntable-state="${state}"]${dressed}`,
            { timeout: 30_000 },
          );
          const path = `${directory}/${state}.png`;
          await page.screenshot({ path });
          console.log(`✓ ${label} → ${path}`);
        } catch (error) {
          failures.push(label);
          console.error(`✖ ${label}: ${error.message.split('\n')[0]}`);
        }
      }
    }
  }

  await context.close();
  if (failures.length > 0) {
    console.error(`\n${failures.length} model-state capture(s) failed.`);
    process.exitCode = 1;
  }
} finally {
  if (browser !== undefined) await browser.close();
  server.kill();
}
