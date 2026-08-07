
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { clientAddress, configFromEnv, describeConfig, isAllowedOrigin, type ServiceConfig } from './config.ts';
import { SignalingHub, type Outbound } from './hub.ts';

const SIGNAL_PATH = '/signal';
const SWEEP_INTERVAL_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

const log = (event: string, fields: Record<string, string | number | boolean> = {}): void => {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`);
};

export interface SignalingService {
  hub: SignalingHub;
  http: Server;
  listen(): Promise<number>;
  stop(): Promise<void>;
}

export const createSignalingService = (config: ServiceConfig): SignalingService => {
  const hub = new SignalingHub({
    limits: config.limits,
    stunUrls: config.stunUrls,
    turn: config.turn,
  });

  const http = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      const body = JSON.stringify({ ok: true, ...hub.stats });
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(body);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found\n');
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: config.limits.maxMessageBytes });
  const sockets = new Map<string, WebSocket>();
  const alive = new Set<string>();

  const deliver = (outbound: readonly Outbound[]): void => {
    for (const item of outbound) {
      const socket = sockets.get(item.to);
      if (socket === undefined) continue;
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(item.message));
      if (item.close === true) socket.close();
    }
  };

  http.on('upgrade', (request, socket, head) => {
    const url = request.url ?? '';
    const path = url.split('?')[0];
    if (path !== SIGNAL_PATH) {
      socket.destroy();
      return;
    }
    if (!isAllowedOrigin(request.headers.origin, config.allowedOrigins)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const id = randomUUID();
    const forwarded = request.headers['x-forwarded-for'];
    const address = clientAddress(
      Array.isArray(forwarded) ? forwarded[0] : forwarded,
      request.socket.remoteAddress,
      config.trustProxy,
    );

    ws.on('error', () => ws.terminate());

    sockets.set(id, ws);
    alive.add(id);
    const refused = hub.open(id, address, Date.now());
    if (refused.length > 0) {
      deliver(refused);
      sockets.delete(id);
      alive.delete(id);
      return;
    }

    ws.on('message', (data: unknown, isBinary: boolean) => {
      const raw = isBinary ? '' : String(data);
      deliver(hub.receive(id, raw, Date.now()));
    });
    ws.on('pong', () => alive.add(id));
    ws.on('close', () => {
      sockets.delete(id);
      alive.delete(id);
      deliver(hub.close(id, Date.now()));
    });
  });

  const sweeper = setInterval(() => deliver(hub.sweep(Date.now())), SWEEP_INTERVAL_MS);
  const heartbeat = setInterval(() => {
    for (const [id, socket] of sockets) {
      if (!alive.has(id)) {
        socket.terminate();
        continue;
      }
      alive.delete(id);
      socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  return {
    hub,
    http,
    listen: () =>
      new Promise<number>((resolve) => {
        http.listen(config.port, config.host, () => {
          const listening = http.address();
          resolve(typeof listening === 'object' && listening !== null ? listening.port : config.port);
        });
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        clearInterval(sweeper);
        clearInterval(heartbeat);
        deliver(hub.shutdown());
        for (const socket of sockets.values()) socket.terminate();
        wss.close();
        http.close(() => resolve());
      }),
  };
};

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const config = configFromEnv();
  const service = createSignalingService(config);
  const port = await service.listen();
  log('listening', { port, config: describeConfig(config) });

  const shutdown = (signal: string): void => {
    log('shutdown', { signal, ...service.hub.stats, ...service.hub.counters });
    void service.stop().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
