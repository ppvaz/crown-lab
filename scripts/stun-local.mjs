import { createSocket } from 'node:dgram';
import process from 'node:process';

import { bindingResponse } from './lib/stun.mjs';

const arg = (name, fallback) => {
  const raw = process.argv.find((value) => value.startsWith(`--${name}=`));
  return raw === undefined ? fallback : raw.slice(name.length + 3);
};

const port = Number(arg('port', '3478'));
const host = arg('host', '0.0.0.0');
const quiet = process.argv.includes('--quiet');

const socket = createSocket('udp4');

const seen = new Set();

socket.on('message', (message, remote) => {
  const response = bindingResponse(message, remote);
  if (response === null) return;
  socket.send(response, remote.port, remote.address);
  if (quiet || seen.has(remote.address)) return;
  seen.add(remote.address);
  console.log(`[stun] ${remote.address} asked for its address — answered ${remote.address}:${remote.port}`);
});

socket.on('error', (error) => {
  console.error(`[stun] ${error.message}`);
  process.exit(1);
});

socket.bind(port, host, () => {
  const { address, port: bound } = socket.address();
  console.log(`[stun] listening on ${address}:${bound}/udp`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    socket.close();
    process.exit(0);
  });
}
