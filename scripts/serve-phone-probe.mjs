import { createServer } from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const PAGE = resolve(root, 'tools/phone-probe/index.html');

const numArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? Number(raw.slice(name.length + 3)) : fallback;
};

const port = numArg('port', 4180);
const out = resolve(root, `runs/phone-probe/${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);

const lanAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((nic) => nic && nic.family === 'IPv4' && !nic.internal)
    .map((nic) => nic.address);

await mkdir(dirname(out), { recursive: true });

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/result') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      await appendFile(out, `${body}\n`);
      try {
        const parsed = JSON.parse(body);
        console.log(`[${parsed.kind}] ${JSON.stringify(parsed).slice(0, 300)}`);
      } catch {
        console.log(`[unparseable] ${body.slice(0, 200)}`);
      }
      res.writeHead(204).end();
    });
    return;
  }
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    readFile(PAGE)
      .then((html) => {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(html);
      })
      .catch((error) => {
        res.writeHead(500).end(String(error.message));
      });
    return;
  }
  res.writeHead(404).end();
});

server.listen(port, '0.0.0.0', () => {
  console.log('Crown Lab phone probe.\n');
  for (const address of lanAddresses()) console.log(`  http://${address}:${port}/`);
  console.log(`\n  results -> ${out.replace(`${root}/`, '')}`);
  console.log('\n  Bound to 0.0.0.0 — own network only, and stop it when the phone is done.');
  console.log('  Hold the phone in landscape. Run G before F if the device state is unknown.');
});
