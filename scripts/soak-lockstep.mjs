import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { loadSim } from './bundle-sim.mjs';
import { listArg } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');

const numArg = (name, fallback) => Number(listArg(name, [String(fallback)])[0]);


const { LockstepSession } = await loadSim('src/net/lockstep.ts', 'soak-lockstep');
const { fingerprintWorld, syntheticIntent } = await loadSim('src/lab/engine-probe.ts', 'soak-probe');
const { quantizeIntent } = await loadSim('src/sim/intent.ts', 'soak-intent');
const {
  ENCOUNTERS, COMBAT_PRESETS, SLOWMO_PRESETS, DEFAULT_SLOWMO_ID,
  addPlayer, createWorld, stepWorld,
} =
  await loadSim('src/lab/bench-kit.ts', 'soak-kit');
const { makeRng, nextFloat } = await loadSim('src/sim/rng.ts', 'soak-rng');

const CHECKPOINT_INTERVAL = 120;

const netSeed = numArg('net-seed', 20260728);

const SCENARIOS = {
  clean: { latency: 0, jitter: 0, loss: 0, duplicate: 0 },
  'latency-12': { latency: 12, jitter: 0, loss: 0, duplicate: 0 },
  'jitter-12-6': { latency: 12, jitter: 6, loss: 0, duplicate: 0 },
  'loss-5': { latency: 6, jitter: 3, loss: 0.05, duplicate: 0 },
  'loss-20': { latency: 6, jitter: 3, loss: 0.2, duplicate: 0 },
  'duplicates-10': { latency: 6, jitter: 3, loss: 0, duplicate: 0.1 },
  hostile: { latency: 18, jitter: 12, loss: 0.15, duplicate: 0.1 },
};

const rooms = listArg('rooms', ['kernel_guard', 'kernel_duelist', 'maze_serpentine']);
const seeds = listArg('seeds', ['1']).map(Number);
const ticks = numArg('ticks', 3000);
const inputDelay = numArg('input-delay', 6);
const scenarioNames = listArg('scenarios', Object.keys(SCENARIOS));
const desyncAt = numArg('desync-at', 600);
const peerCounts = listArg('peers', ['2']).map(Number);

const seatRoster = (world, combat, count, start) => {
  for (let i = 1; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    addPlayer(world, combat, {
      x: start.x + Math.cos(angle) * 1.6,
      y: start.y + Math.sin(angle) * 1.6,
    });
  }
};

const makePeer = (id, peers, encounter, combat, seed, streamSeed) => {
  const world = createWorld(encounter, combat, seed);
  seatRoster(world, combat, peers.length, encounter.playerStart);
  return {
    id,
    session: new LockstepSession({
      peers,
      localPeer: id,
      inputDelay,
      checkpointInterval: CHECKPOINT_INTERVAL,
    }),
    world,
    intents: makeRng(streamSeed),
    submittedThrough: -1,
    fingerprints: new Map(),
  };
};


const runSession = (room, seed, scenario, options) => {
  const peerCount = options.peers;
  const encounter = ENCOUNTERS[room];
  const combat = structuredClone(COMBAT_PRESETS.Default);
  const slowMo = SLOWMO_PRESETS[DEFAULT_SLOWMO_ID];
  const ids = Array.from({ length: peerCount }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);
  const peers = ids.map((id, index) => makePeer(id, ids, encounter, combat, seed, seed + index * 7919));
  const byId = new Map(peers.map((peer) => [peer.id, peer]));

  const channel = [];
  const net = makeRng(netSeed >>> 0);
  let clock = 0;
  const stats = { sent: 0, dropped: 0, duplicated: 0, retransmitted: 0, stalls: 0 };

  const send = (from, message, isRetransmit = false) => {
    stats.sent += 1;
    if (isRetransmit) stats.retransmitted += 1;
    for (const peer of peers) {
      if (peer.id === from) continue;
      if (nextFloat(net) < scenario.loss) {
        stats.dropped += 1;
        continue;
      }
      const jitter = scenario.jitter > 0 ? Math.floor(nextFloat(net) * (scenario.jitter + 1)) : 0;
      channel.push({ at: clock + scenario.latency + jitter, to: peer.id, message });
      if (nextFloat(net) < scenario.duplicate) {
        stats.duplicated += 1;
        channel.push({ at: clock + scenario.latency + jitter + 1, to: peer.id, message });
      }
    }
  };

  const outbox = new Map(ids.map((id) => [id, []]));

  const maxSteps = ticks * 40;
  let step = 0;
  for (; step < maxSteps; step++) {
    clock = step;

    for (const peer of peers) {
      if (peer.session.tick >= ticks) continue;
      if (peer.session.scheduledTick > peer.submittedThrough) {
        const message = peer.session.submitLocal(quantizeIntent(syntheticIntent(peer.intents)));
        peer.submittedThrough = peer.session.scheduledTick;
        outbox.get(peer.id).push(message);
        send(peer.id, message);
      }
    }

    for (let i = channel.length - 1; i >= 0; i--) {
      if (channel[i].at > clock) continue;
      byId.get(channel[i].to).session.receive(channel[i].message);
      channel.splice(i, 1);
    }

    let advanced = false;
    for (const peer of peers) {
      if (peer.session.tick >= ticks) continue;
      const taken = peer.session.take();
      if (taken === null) continue;
      advanced = true;
      if (peer.world.players.length !== peers.length) {
        throw new Error(
          `roster is ${peer.world.players.length} for ${peers.length} peers — ` +
            'the extra intents would be silently ignored and every peer would still agree',
        );
      }
      stepWorld(peer.world, taken.map((entry) => entry.intent), combat, slowMo, encounter);

      if (options.desyncAt !== null && peer.id === ids[1] && peer.world.tick === options.desyncAt) {
        peer.world.players[0].pos.x += 1e-6;
      }

      if (peer.world.tick % CHECKPOINT_INTERVAL === 0) {
        const fingerprint = fingerprintWorld(peer.world);
        peer.fingerprints.set(peer.world.tick, fingerprint);
        const message = peer.session.reportCheckpoint(peer.world.tick, fingerprint);
        if (message !== null) send(peer.id, message);
      }
    }

    const desynced = peers.find((peer) => peer.session.state === 'desynced');
    if (desynced) {
      return { outcome: 'desynced', at: desynced.session.desyncReport.tick, stats, peers, step };
    }

    if (peers.every((peer) => peer.session.tick >= ticks)) break;

    if (!advanced) {
      stats.stalls += 1;
      for (const peer of peers) {
        for (const missing of peer.session.missingPeers()) {
          if (missing === peer.id) continue;
          const pending = outbox.get(missing).filter((m) => m.tick === peer.session.tick);
          for (const message of pending) send(missing, message, true);
        }
      }
    }
  }

  if (step >= maxSteps) return { outcome: 'deadlocked', at: null, stats, peers, step };

  for (const inFlight of channel) byId.get(inFlight.to).session.receive(inFlight.message);
  channel.length = 0;

  const desyncedAfterDrain = peers.find((peer) => peer.session.state === 'desynced');
  if (desyncedAfterDrain) {
    return {
      outcome: 'desynced',
      at: desyncedAfterDrain.session.desyncReport.tick,
      stats,
      peers,
      step,
    };
  }

  const [a] = peers;
  for (const other of peers.slice(1)) {
    for (const [tick, fingerprint] of a.fingerprints) {
      const theirs = other.fingerprints.get(tick);
      if (theirs !== undefined && theirs !== fingerprint) {
        return { outcome: 'undetected-divergence', at: tick, stats, peers, step };
      }
    }
    if (fingerprintWorld(a.world) !== fingerprintWorld(other.world)) {
      return { outcome: 'undetected-divergence', at: null, stats, peers, step };
    }
  }
  return { outcome: 'agreed', at: null, stats, peers, step };
};

console.log(
  `\nLOCKSTEP SOAK — ${rooms.length} room(s) x ${seeds.length} seed(s) x ${ticks} ticks, ` +
    `input delay ${inputDelay}, net seed ${netSeed}\n`,
);

let failures = 0;
const pad = (value, width) => String(value).padEnd(width);
const records = [];

for (const name of scenarioNames) {
  const scenario = SCENARIOS[name];
  if (scenario === undefined) {
    console.error(`unknown scenario: ${name} (have: ${Object.keys(SCENARIOS).join(', ')})`);
    process.exitCode = 1;
    continue;
  }
  for (const room of rooms) {
    for (const seed of seeds) {
      for (const peers of peerCounts) {
        const result = runSession(room, seed, scenario, { desyncAt: null, peers });
        const { stats } = result;
        const ok = result.outcome === 'agreed';
        if (!ok) failures += 1;
        records.push({ scenario: name, room, seed, peers, outcome: result.outcome, ...stats });
        console.log(
          `  ${pad(name, 15)}${pad(room, 18)}seed ${pad(seed, 4)}${pad(`${peers}p`, 4)}` +
            `${ok ? 'agreed' : `✖ ${result.outcome}${result.at === null ? '' : ` at ${result.at}`}`}` +
            `   sent=${stats.sent} dropped=${stats.dropped} dup=${stats.duplicated} ` +
            `resent=${stats.retransmitted} stalls=${stats.stalls}`,
        );
      }
    }
  }
}



console.log('');
for (const peers of peerCounts) {
  const control = runSession(rooms[0], seeds[0], SCENARIOS.clean, { desyncAt, peers });
  const detected = control.outcome === 'desynced';
  if (!detected) failures += 1;
  console.log(
    `  ${pad('negative control', 15)}${pad(rooms[0], 18)}${pad(`${peers}p`, 4)}` +
      `perturbed bob by 1e-6 at tick ${desyncAt}: ` +
      `${detected ? `detected at tick ${control.at}` : `✖ NOT DETECTED (${control.outcome})`}`,
  );
}

const jsonPath = listArg('json', [])[0];
if (jsonPath !== undefined) {
  const target = resolve(root, jsonPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(
    target,
    `${JSON.stringify({ ticks, inputDelay, netSeed, records }, null, 2)}\n`,
  );
  console.log(`\n  wrote ${records.length} rows to ${jsonPath}`);
}

console.log('');
if (failures === 0) {
  console.log(
    `All scenarios agreed, and the injected desync was caught at every roster size. ` +
      `Synthetic peers — ADR-016 clause 8, this is not evidence about play.`,
  );
} else {
  console.error(`${failures} failure(s).`);
  process.exitCode = 1;
}
