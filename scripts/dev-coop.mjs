import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');

const has = (name) => process.argv.includes(`--${name}`);
const arg = (name, fallback) => {
  const raw = process.argv.find((value) => value.startsWith(`--${name}=`));
  return raw === undefined ? fallback : raw.slice(name.length + 3);
};

const local = has('local');
const preview = has('preview');
const lab = has('lab');
const game = has('game') || (preview && !lab);
const devPort = Number(arg('port', '5173'));
const stunPort = Number(arg('stun-port', '3478'));
const stunArg = arg('stun', process.env.CROWN_STUN_URLS ?? '');

const lanAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((nic) => nic !== undefined && nic.family === 'IPv4' && !nic.internal)
    .map((nic) => nic.address);

const addresses = lanAddresses();
if (!local && addresses.length === 0) {
  console.error(
    'no LAN address on this machine — a second device has no route to it.\n' +
      'Run `npm run dev:coop -- --local` for two windows on this machine instead.',
  );
  process.exit(1);
}
const address = local ? 'localhost' : addresses[0];
const pageUrl = `http://${address}:${devPort}/`;

const stunIsLocal = stunArg === 'local';
const stun = stunIsLocal ? `stun:${address}:${stunPort}` : stunArg;

const lines = [
  '',
  `  open       ${pageUrl}`,
  `  host       press CRIAR SALA — the code appears beside it, and COPIAR LINK DE ENTRADA sends it`,
  `  join       press ENTRAR EM SALA and type the code, or just open the link you were sent`,
  '',
  `  handshake  ${pageUrl}signal — this dev server's own origin, proxied to a service it runs`,
  `  build      ${game ? 'public game' : 'lab'}${preview ? ', built bundle' : ''}${local ? ', this machine only' : ', reachable on this network'}`,
  '',
];
if (!local && addresses.length > 1) {
  lines.push(
    `  other addresses on this machine: ${addresses.slice(1).join(', ')}`,
    '  if the second device cannot reach the one above, try one of these instead.',
    '',
  );
}
if (stun === '') {
  lines.push(
    '  no STUN configured. Two devices on one LAN with working mDNS connect without it; anything',
    '  else fails *silently* — zero candidate pairs and ICE at `new` for ever (ADR-019, measured).',
    '  A STUN server on this machine reflects the device\'s real LAN address and tells nobody:',
    '    npm run dev:coop -- --stun=local',
    '',
  );
} else {
  lines.push(`  stun       ${stun}${stunIsLocal ? ' — this machine, started below' : ''}`, '');
}
console.log(lines.join('\n'));

const stunChild = stunIsLocal
  ? spawn(process.execPath, [resolve(root, 'scripts/stun-local.mjs'), `--port=${stunPort}`], {
      cwd: root,
      stdio: 'inherit',
    })
  : null;

stunChild?.on('exit', (code) => {
  if (code === 0 || code === null) return;
  console.error(
    `\n  the STUN server exited (${code}) — peers were promised ${stun} and nothing is there.\n` +
      `  port ${stunPort}/udp is most likely already in use: lsof -nP -iUDP:${stunPort}\n` +
      `  pick another with --stun-port=3479, or run without --stun=local.\n`,
  );
});

const child = spawn(
  process.execPath,
  [
    resolve(root, 'node_modules/vite/bin/vite.js'),
    ...(preview ? ['preview'] : []),
    ...(preview && lab ? ['--outDir', 'dist-lab'] : []),
    ...(game ? ['--mode', 'game'] : []),
    '--port',
    String(devPort),
    '--strictPort',
    ...(local ? [] : ['--host', '0.0.0.0']),
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...(stun === '' ? {} : { CROWN_STUN_URLS: stun }) },
  },
);
child.on('exit', (code) => {
  stunChild?.kill();
  process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stunChild?.kill();
    child.kill();
  });
}
