import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { arenaContains } from '../src/sim/arena';
import { victorySubtitle } from '../src/render/victory';
import { copyFor } from '../src/game/copy';
import { createEscortState, escortSpawn } from '../src/game/escort';
import {
  applyRouteIntents,
  createRouteRun,
  enterRoom,
  heraldOffersIn,
  interactRoom,
  observeRoom,
  offersInteract,
  retryRoom,
  roomIntent,
  steerHerald,
} from '../src/app/route-run';
import { ANTECHAMBER_PUZZLE, sealPuzzleSolved, stepSealPuzzle } from '../src/game/puzzle';
import {
  HERALD,
  HERALD_REACH,
  createHeraldState,
  cycleHerald,
  heraldHint,
  heraldLeave,
  heraldPresent,
  heraldPrompt,
  heraldSpeaker,
  heraldTalking,
  openHerald,
  selectedOffer,
} from '../src/game/herald';
import { POWER_STANDS, STAND_RADIUS, STAND_REACH } from '../src/game/armoury';
import { createWorld } from '../src/sim/encounter';
import { NEUTRAL_INTENT, TICK_MS } from '../src/sim/types';
import type { EnemyArchetype, World } from '../src/sim/types';
import {
  FIRST_CROWN,
  advanceRoute,
  createRouteState,
  forgetRouteNodeCleared,
  jumpRoute,
  markRouteNodeCleared,
  retreatRoute,
  routeAtEntrance,
  routeDestination,
  routeNodeCleared,
  routeExitOpen,
  routeNextNode,
  routeNode,
  routeObjective,
  routeProgress,
  routePrompt,
  routeReadout,
  settleRoute,
  type RouteNode,
} from '../src/game/route';
import { PUBLIC_ENCOUNTERS } from '../src/game/public-profile';

const PLAYER_RADIUS = DEFAULT_COMBAT.player.radius;

const LEAVE = heraldLeave(copyFor('en').herald.leave);

const encounterOf = (node: RouteNode) => ENCOUNTERS[node.encounterId];

const worldAtExit = (node: RouteNode, outcome: World['outcome'] = 'running'): World => {
  const world = createWorld(encounterOf(node), DEFAULT_COMBAT, 1);
  world.players[0].pos = { ...node.exitAt! };
  world.outcome = outcome;
  return world;
};

describe('the first crown route', () => {
  it('points every node at an encounter that already exists', () => {
    for (const node of FIRST_CROWN.nodes) {
      expect(encounterOf(node), `${node.id} -> ${node.encounterId}`).toBeDefined();
    }
  });

  it('places every spawn and door inside its own arena', () => {
    for (const node of FIRST_CROWN.nodes) {
      const { arena } = encounterOf(node);
      expect(
        arenaContains(arena, node.spawnAt, PLAYER_RADIUS),
        `${node.id} spawn ${JSON.stringify(node.spawnAt)}`,
      ).toBe(true);
      if (node.exitAt === null) continue;
      expect(
        arenaContains(arena, node.exitAt, PLAYER_RADIUS),
        `${node.id} exit ${JSON.stringify(node.exitAt)}`,
      ).toBe(true);
    }
  });

  it('introduces exactly one new archetype per combat node, then recombines', () => {
    const seen = new Set<EnemyArchetype>();
    const introduced: Array<{ node: string; fresh: EnemyArchetype[] }> = [];

    for (const node of FIRST_CROWN.nodes) {
      const archetypes = encounterOf(node).waves.flatMap((wave) =>
        wave.spawns.map((spawn) => spawn.archetype),
      );
      if (archetypes.length === 0) continue;
      const fresh = [...new Set(archetypes)].filter((a) => !seen.has(a));
      fresh.forEach((a) => seen.add(a));
      introduced.push({ node: node.id, fresh });
    }

    expect(introduced).toEqual([
      { node: 'guardroom', fresh: ['guard'] },
      { node: 'passage', fresh: ['duelist'] },
      { node: 'gallery', fresh: ['archer'] },
      { node: 'hall', fresh: [] },
      { node: 'siege', fresh: [] },
      { node: 'first_blade', fresh: ['first_blade'] },
    ]);
  });

  it('keeps a genuinely empty valley immediately before the boss', () => {
    const [breather, crown] = FIRST_CROWN.nodes.slice(-2);
    expect(breather.beat).toBe('breather');
    expect(encounterOf(breather).waves).toHaveLength(0);
    expect(crown.beat).toBe('crown');
  });

  it('ends on one boss, not two', () => {
    const bosses = FIRST_CROWN.nodes.filter((node) =>
      encounterOf(node).waves.some((wave) =>
        wave.spawns.some((spawn) => DEFAULT_COMBAT.enemies[spawn.archetype].boss !== undefined),
      ),
    );
    expect(bosses).toHaveLength(1);
    expect(bosses[0].id).toBe('first_blade');
    expect(bosses[0].exitAt).toBeNull();
    expect(FIRST_CROWN.nodes.some((node) => node.encounterId === 'captain')).toBe(false);
  });

  it('makes the player earn the breather before it arrives', () => {
    const ids = FIRST_CROWN.nodes.map((node) => node.id);
    expect(ids.indexOf('siege')).toBeLessThan(ids.indexOf('antechamber'));
  });

  it('holds a combat door shut until the room is clear', () => {
    const state = createRouteState();
    state.index = 1;
    const node = routeNode(FIRST_CROWN, state);

    const fighting = worldAtExit(node);
    expect(routeExitOpen(node, fighting)).toBe(false);
    expect(routePrompt(FIRST_CROWN, state, fighting, 'E')).toBe(
      'THE DOG-LEG PASSAGE  LOCKED',
    );
    expect(advanceRoute(FIRST_CROWN, state, fighting)).toBeNull();
    expect(state.index).toBe(1);

    const cleared = worldAtExit(node, 'cleared');
    expect(routePrompt(FIRST_CROWN, state, cleared, 'E')).toBe(
      'E  ENTER THE DOG-LEG PASSAGE',
    );
    expect(advanceRoute(FIRST_CROWN, state, cleared)?.id).toBe('passage');
    expect(state.index).toBe(2);
  });

  it('lets the player walk out of an open node without clearing anything', () => {
    const state = createRouteState();
    const court = routeNode(FIRST_CROWN, state);
    expect(court.gate).toBe('open');

    const world = worldAtExit(court);
    expect(routeExitOpen(court, world)).toBe(true);
    expect(advanceRoute(FIRST_CROWN, state, world)?.id).toBe('guardroom');
  });

  it('will not advance from a door the player is not standing at', () => {
    const state = createRouteState();
    const court = routeNode(FIRST_CROWN, state);
    const world = createWorld(encounterOf(court), DEFAULT_COMBAT, 1);
    world.players[0].pos = { x: 0, y: 0 };

    expect(routePrompt(FIRST_CROWN, state, world, 'E')).toBeNull();
    expect(advanceRoute(FIRST_CROWN, state, world)).toBeNull();
  });

  it('walks court to throne and completes only when the boss falls', () => {
    const state = createRouteState();
    const visited = [routeNode(FIRST_CROWN, state).id];

    for (let step = 0; step < FIRST_CROWN.nodes.length - 1; step += 1) {
      const node = routeNode(FIRST_CROWN, state);
      const next = advanceRoute(FIRST_CROWN, state, worldAtExit(node, 'cleared'));
      expect(next, `stuck at ${node.id}`).not.toBeNull();
      visited.push(next!.id);
    }

    expect(visited).toEqual([
      'court',
      'guardroom',
      'passage',
      'gallery',
      'hall',
      'siege',
      'antechamber',
      'first_blade',
    ]);
    expect(state.furthest).toBe(7);
    expect(routeProgress(FIRST_CROWN, state)).toBe('8 / 8');

    const last = routeNode(FIRST_CROWN, state);
    const fighting = createWorld(encounterOf(last), DEFAULT_COMBAT, 1);
    settleRoute(FIRST_CROWN, state, fighting);
    expect(state.complete).toBe(false);
    expect(routeObjective(FIRST_CROWN, state, fighting)).toBe('THE FIRST BLADE — end it');

    fighting.outcome = 'cleared';
    settleRoute(FIRST_CROWN, state, fighting);
    expect(state.complete).toBe(true);
    expect(routeObjective(FIRST_CROWN, state, fighting)).toBe('The crown is yours');
  });

  it('names the device, not a key, at the door', () => {
    const state = createRouteState();
    const cleared = worldAtExit(routeNode(FIRST_CROWN, state), 'cleared');

    expect(routePrompt(FIRST_CROWN, state, cleared, 'INTERAGIR')).toBe(
      'INTERAGIR  ENTER THE GUARDROOM',
    );
    expect(
      routeReadout(FIRST_CROWN, state, cleared, 'INTERAGIR').join('\n'),
    ).not.toContain('E  ENTER');
  });

  it('reads the whole ladder out for the instrument rail', () => {
    const state = createRouteState();
    state.index = 1;
    state.furthest = 1;
    const lines = routeReadout(
      FIRST_CROWN,
      state,
      worldAtExit(routeNode(FIRST_CROWN, state)),
      'E',
    );

    expect(lines).toEqual([
      'route       THE FIRST CROWN  2 / 8',
      '  node       guardroom (develop) -> kernel_guard',
      '  objective  THE GUARDROOM — clear the room',
      '  teaches    One guard, one readable telegraph',
      '  door       THE DOG-LEG PASSAGE  LOCKED',
      '  furthest   2 / 8',
    ]);
  });

  it('does not complete the route by clearing a mid-route node', () => {
    const state = createRouteState();
    state.index = 1;
    const world = worldAtExit(routeNode(FIRST_CROWN, state), 'cleared');
    settleRoute(FIRST_CROWN, state, world);
    expect(state.complete).toBe(false);
  });
});

describe('walking back', () => {
  it('offers no way back out of the first room', () => {
    const state = createRouteState();
    const world = createWorld(encounterOf(routeNode(FIRST_CROWN, state)), DEFAULT_COMBAT, 1);
    world.players[0].pos = { ...routeNode(FIRST_CROWN, state).spawnAt };
    expect(routeAtEntrance(FIRST_CROWN, state, world)).toBe(false);
    expect(retreatRoute(FIRST_CROWN, state, world)).toBeNull();
  });

  it('goes back through the door it came in by', () => {
    const state = createRouteState();
    state.index = 2;
    state.furthest = 2;
    const node = routeNode(FIRST_CROWN, state);
    const world = createWorld(encounterOf(node), DEFAULT_COMBAT, 1);
    world.players[0].pos = { ...node.spawnAt };

    expect(routeAtEntrance(FIRST_CROWN, state, world)).toBe(true);
    expect(retreatRoute(FIRST_CROWN, state, world)?.id).toBe('guardroom');
    expect(state.index).toBe(1);
  });

  it('never rewrites how far the player got', () => {
    const state = createRouteState();
    state.index = 3;
    state.furthest = 3;
    const node = routeNode(FIRST_CROWN, state);
    const world = createWorld(encounterOf(node), DEFAULT_COMBAT, 1);
    world.players[0].pos = { ...node.spawnAt };

    retreatRoute(FIRST_CROWN, state, world);
    expect(state.furthest).toBe(3);
    expect(state.index).toBe(2);
  });

  it('will not retreat from the middle of the room', () => {
    const state = createRouteState();
    state.index = 2;
    const node = routeNode(FIRST_CROWN, state);
    const world = createWorld(encounterOf(node), DEFAULT_COMBAT, 1);
    world.players[0].pos = { x: 0, y: 0 };
    expect(retreatRoute(FIRST_CROWN, state, world)).toBeNull();
    expect(state.index).toBe(2);
  });

  it('needs no gate, because a gate is a statement about progressing', () => {
    const state = createRouteState();
    state.index = 1;
    const node = routeNode(FIRST_CROWN, state);
    const world = createWorld(encounterOf(node), DEFAULT_COMBAT, 1);
    world.players[0].pos = { ...node.spawnAt };
    expect(world.outcome).toBe('running');
    expect(routeExitOpen(node, world)).toBe(false);
    expect(retreatRoute(FIRST_CROWN, state, world)?.id).toBe('court');
  });

  it('names the room behind, on the threshold behind', () => {
    const state = createRouteState();
    state.index = 2;
    const node = routeNode(FIRST_CROWN, state);
    const world = createWorld(encounterOf(node), DEFAULT_COMBAT, 1);
    world.players[0].pos = { ...node.spawnAt };
    expect(routePrompt(FIRST_CROWN, state, world, 'E')).toBe('E  BACK TO THE GUARDROOM');
  });

  it('says nothing more about a room that is already clear', () => {
    const state = createRouteState();
    state.index = 1;
    const cleared = worldAtExit(routeNode(FIRST_CROWN, state), 'cleared');
    expect(routeObjective(FIRST_CROWN, state, cleared)).toBeNull();
    expect(routeObjective(FIRST_CROWN, state, worldAtExit(routeNode(FIRST_CROWN, state)))).toBe(
      'THE GUARDROOM — clear the room',
    );
  });
});

describe('rooms remember being cleared', () => {
  it('starts with nothing cleared', () => {
    expect(createRouteState().cleared).toEqual([]);
  });

  it('records a room when the player walks out of it', () => {
    const state = createRouteState();
    state.index = 1;
    const node = routeNode(FIRST_CROWN, state);
    advanceRoute(FIRST_CROWN, state, worldAtExit(node, 'cleared'));
    expect(state.cleared).toContain('guardroom');
  });

  it('does not record a room the player merely walked through', () => {
    const state = createRouteState();
    const court = routeNode(FIRST_CROWN, state);
    advanceRoute(FIRST_CROWN, state, worldAtExit(court, 'running'));
    expect(state.cleared).not.toContain('court');
  });

  it('keeps the door open when the player comes back to a cleared room', () => {
    const state = createRouteState();
    state.index = 1;
    const node = routeNode(FIRST_CROWN, state);
    const fresh = worldAtExit(node, 'running');

    expect(routeExitOpen(node, fresh, state)).toBe(false);
    markRouteNodeCleared(state, node);
    expect(routeExitOpen(node, fresh, state)).toBe(true);
    expect(routeNodeCleared(state, node)).toBe(true);
  });

  it('asks for no objective in a room that is already done', () => {
    const state = createRouteState();
    state.index = 1;
    const node = routeNode(FIRST_CROWN, state);
    markRouteNodeCleared(state, node);
    expect(routeObjective(FIRST_CROWN, state, worldAtExit(node, 'running'))).toBeNull();
  });

  it('records by id, so re-ordering the ladder cannot mis-credit a room', () => {
    const state = createRouteState();
    markRouteNodeCleared(state, FIRST_CROWN.nodes[3]);
    expect(state.cleared).toEqual([FIRST_CROWN.nodes[3].id]);
    markRouteNodeCleared(state, FIRST_CROWN.nodes[3]);
    expect(state.cleared).toHaveLength(1);
  });
});

describe('the herald', () => {
  it('stands in the opening court and nowhere else', () => {
    const court = createWorld(ENCOUNTERS.wayfarer_court, DEFAULT_COMBAT, 1);
    const guardroom = createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 1);
    expect(heraldPresent(court)).toBe(true);
    expect(heraldPresent(guardroom)).toBe(false);
  });

  it('stands on the floor, clear of both doors and of the plinths', () => {
    expect(arenaContains(ENCOUNTERS.wayfarer_court.arena, HERALD.at, 0)).toBe(true);
    expect(HERALD.at.y).toBeLessThan(-1.5);
    for (const stand of POWER_STANDS) {
      const gap = Math.hypot(HERALD.at.x - stand.at.x, HERALD.at.y - stand.at.y);
      expect(gap, stand.label).toBeGreaterThan(HERALD_REACH + STAND_REACH);
    }
  });

  it('invites the king to talk only within reach', () => {
    const herald = createHeraldState();
    expect(heraldPrompt(herald, HERALD.at, 'E')).toBe('E  SPEAK TO THE HERALD');
    expect(heraldPrompt(herald, { x: HERALD.at.x + 9, y: HERALD.at.y }, 'E')).toBeNull();
  });

  it('stops inviting once he is already talking', () => {
    const herald = createHeraldState();
    openHerald(herald, 0);
    expect(heraldPrompt(herald, HERALD.at, 'E')).toBeNull();
  });

  it('offers every destination the route and the registry both have, then a way out', () => {
    const offers = heraldOffersIn(ENCOUNTERS, LEAVE.label);
    expect(offers.map((offer) => offer.to)).toEqual([
      'first_blade',
      'captain',
      'chancellor',
      'glass_regent',
      'queen',
      'thorn_marshal',
      null,
    ]);
    for (const offer of offers) {
      if (offer.to === null) continue;
      const node = routeDestination(FIRST_CROWN, offer.to);
      expect(node, offer.to).not.toBeNull();
      expect(ENCOUNTERS[node!.encounterId], offer.to).toBeDefined();
    }
  });

  it('offers nothing it cannot load', () => {
    const thin = { wayfarer_court: ENCOUNTERS.wayfarer_court, first_blade: ENCOUNTERS.first_blade };
    expect(heraldOffersIn(thin, LEAVE.label).map((offer) => offer.to)).toEqual(['first_blade', null]);
  });

  it('has no conversation at all when it can honour no ride', () => {
    expect(heraldOffersIn({ wayfarer_court: ENCOUNTERS.wayfarer_court }, LEAVE.label)).toEqual([]);
  });

  it('honours every ride in the build a player actually gets', () => {

    const offers = heraldOffersIn(PUBLIC_ENCOUNTERS, LEAVE.label);
    expect(offers.map((offer) => offer.to)).toEqual([
      'first_blade',
      'captain',
      'chancellor',
      'glass_regent',
      'queen',
      'thorn_marshal',
      null,
    ]);
  });

  it('lands the king on the last rung', () => {
    const state = createRouteState();
    const target = jumpRoute(FIRST_CROWN, state, 'first_blade');
    expect(target?.id).toBe('first_blade');
    expect(state.index).toBe(FIRST_CROWN.nodes.length - 1);
    expect(state.aside).toBeNull();
  });

  it('does not mark the rooms it skipped as cleared', () => {
    const state = createRouteState();
    jumpRoute(FIRST_CROWN, state, 'first_blade');
    expect(state.cleared).toEqual([]);
  });

  it('quietly does nothing for a rung that no longer exists', () => {
    const state = createRouteState();
    expect(jumpRoute(FIRST_CROWN, state, 'the_throne_that_was_removed')).toBeNull();
    expect(state.index).toBe(0);
  });
});

describe('the herald’s offer list', () => {
  const OFFERS = [...HERALD.offers, LEAVE];
  const PUSH = 0.707;

  it('opens on the first offer', () => {
    const herald = createHeraldState();
    openHerald(herald, 0);
    expect(herald.open).toBe(true);
    expect(selectedOffer(herald, OFFERS)?.to).toBe('first_blade');
  });

  it('ends the list with a way out, because the panel owns the stick', () => {
    expect(OFFERS[OFFERS.length - 1].to).toBeNull();
    expect(OFFERS[OFFERS.length - 1].label).toBe(copyFor('en').herald.leave);
    expect(OFFERS.filter((offer) => offer.to === null)).toHaveLength(1);
  });

  it('steps once per lean, not once per tick', () => {
    const herald = createHeraldState();
    openHerald(herald, 0);
    expect(cycleHerald(herald, PUSH, OFFERS.length)).toBe(true);
    expect(cycleHerald(herald, PUSH, OFFERS.length)).toBe(false);
    expect(cycleHerald(herald, PUSH, OFFERS.length)).toBe(false);
    expect(herald.selected).toBe(1);
  });

  it('steps again once the stick has been back to centre', () => {
    const herald = createHeraldState();
    openHerald(herald, 0);
    cycleHerald(herald, PUSH, OFFERS.length);
    cycleHerald(herald, 0, OFFERS.length);
    cycleHerald(herald, PUSH, OFFERS.length);
    expect(herald.selected).toBe(2);
  });

  it('wraps, so the list has no ends to remember', () => {
    const herald = createHeraldState();
    openHerald(herald, 0);
    cycleHerald(herald, -PUSH, OFFERS.length);
    expect(herald.selected).toBe(OFFERS.length - 1);
  });

  it('ignores a push straight left or right', () => {
    const herald = createHeraldState();
    openHerald(herald, 0);
    expect(cycleHerald(herald, 0, OFFERS.length)).toBe(false);
    expect(herald.selected).toBe(0);
  });

  it('does not step on the tick it opens, however the king arrived', () => {
    const herald = createHeraldState();
    openHerald(herald, -0.707);
    expect(cycleHerald(herald, -0.707, OFFERS.length)).toBe(false);
    expect(herald.selected).toBe(0);
  });

  it('does not cycle a list with nothing to choose between', () => {
    const herald = createHeraldState();
    openHerald(herald, 0);
    expect(cycleHerald(herald, PUSH, 1)).toBe(false);
    expect(herald.selected).toBe(0);
  });

  it('says where in the list the selection sits, and only when there is a list', () => {
    const herald = createHeraldState();
    openHerald(herald, 0);
    expect(heraldSpeaker(herald, OFFERS)).toBe('THE HERALD  1/7');
    expect(heraldSpeaker(herald, OFFERS.slice(0, 1))).toBe('THE HERALD');
  });

  it('names both controls, and drops the one that would do nothing', () => {
    const words = copyFor('en').herald;
    expect(heraldHint(OFFERS, 'the stick', 'ACT', words)).toBe('the stick  choose    ACT  go');
    expect(heraldHint(OFFERS.slice(0, 1), 'the stick', 'ACT', words)).toBe('ACT  go');
    expect(heraldHint(OFFERS, 'WASD or arrow keys', 'E', copyFor('en').herald)).toBe(
      'WASD or arrow keys  choose    E  go',
    );
  });

  it('clamps a selection that outlived its list', () => {
    const herald = createHeraldState();
    herald.selected = 2;
    expect(selectedOffer(herald, OFFERS.slice(0, 1))?.label).toBe('THE FIRST BLADE');
    expect(selectedOffer(herald, [])).toBeNull();
  });
});

describe('talking to the herald', () => {
  const court = () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const run = createRouteRun(ENCOUNTERS, LEAVE.label);
    const world = createWorld(ENCOUNTERS.wayfarer_court, combat, 1);
    enterRoom(run, world, combat);
    world.players[0].pos = { ...HERALD.at, y: HERALD.at.y + 1 };
    return { combat, run, world };
  };

  it('takes two presses: one to speak, one to go', () => {
    const { combat, run, world } = court();
    expect(interactRoom(run, world, combat).change).toBeNull();
    expect(run.herald.open).toBe(true);
    expect(run.route.index).toBe(0);

    const { change } = interactRoom(run, world, combat);
    expect(change?.node.id).toBe('first_blade');
  });

  it('takes the offer the player cycled to', () => {
    const { combat, run, world } = court();
    interactRoom(run, world, combat);
    steerHerald(run, world, 0.707);
    expect(interactRoom(run, world, combat).change?.node.id).toBe('captain');
  });

  it('holds the king still while he is choosing', () => {
    const { combat, run, world } = court();
    const walking = { ...NEUTRAL_INTENT, move: { x: 1, y: -1 } };
    expect(roomIntent(run, world, walking).move).toEqual({ x: 1, y: -1 });
    interactRoom(run, world, combat);
    expect(roomIntent(run, world, walking).move).toEqual({ x: 0, y: 0 });
  });

  it('gives the stick back the moment the panel closes', () => {
    const { combat, run, world } = court();
    interactRoom(run, world, combat);
    const walking = { ...NEUTRAL_INTENT, move: { x: 1, y: -1 } };
    world.players[0].pos = { x: 0, y: 0 };
    expect(heraldTalking(run.herald, world)).toBe(false);
    expect(roomIntent(run, world, walking).move).toEqual({ x: 1, y: -1 });
  });

  it('lets him decline with the last entry, which is the only way out', () => {
    const { combat, run, world } = court();
    interactRoom(run, world, combat);
    for (let i = 0; i < run.offers.length - 1; i += 1) {
      steerHerald(run, world, 0.707);
      steerHerald(run, world, 0);
    }
    expect(selectedOffer(run.herald, run.offers)?.label).toBe(LEAVE.label);
    expect(interactRoom(run, world, combat).change).toBeNull();
    expect(run.herald.open).toBe(false);
    expect(run.route.index).toBe(0);
    expect(run.route.aside).toBeNull();
  });

  it('closes the panel if anything moves him out of earshot', () => {
    const { combat, run, world } = court();
    interactRoom(run, world, combat);
    world.players[0].pos = { x: 0, y: 0 };
    observeRoom(run, world, combat);
    expect(run.herald.open).toBe(false);
  });

  it('costs THE LADDER only when rungs actually went unwalked', () => {
    const carried = court();
    interactRoom(carried.run, carried.world, carried.combat);
    interactRoom(carried.run, carried.world, carried.combat);
    expect(carried.run.feats.skipped).toBe(true);

    const detour = court();
    interactRoom(detour.run, detour.world, detour.combat);
    steerHerald(detour.run, detour.world, 0.707);
    interactRoom(detour.run, detour.world, detour.combat);
    expect(detour.run.feats.skipped).toBe(false);
    expect(detour.run.route.index).toBe(0);
  });

  it('offers the interact button beside him, and nothing in the middle of the room', () => {
    const { combat, run, world } = court();
    expect(offersInteract(run, world, combat)).toBe(true);
    world.players[0].pos = { x: 0, y: 0 };
    expect(offersInteract(run, world, combat)).toBe(false);
  });

  it('offers the interact button over a power drop', () => {
    const { combat, run, world } = court();
    world.players[0].pos = { x: 0, y: 0 };
    expect(offersInteract(run, world, combat)).toBe(false);
    world.pickups.push({
      id: 99,
      kind: 'power',
      pos: { x: 0.2, y: 0 },
      amount: 0,
      offers: 'freeze',
      lifeMs: 5000,
      totalLifeMs: 5000,
    });
    expect(offersInteract(run, world, combat)).toBe(true);
  });
});

describe('rungs off the ladder', () => {
  const inAside = (id: string) => {
    const state = createRouteState();
    const node = jumpRoute(FIRST_CROWN, state, id)!;
    const world = createWorld(encounterOf(node), DEFAULT_COMBAT, 1);
    world.players[0].pos = { ...node.spawnAt };
    return { state, node, world };
  };

  it('points every aside at an encounter that already exists', () => {
    for (const node of FIRST_CROWN.asides) {
      expect(ENCOUNTERS[node.encounterId], node.id).toBeDefined();
    }
  });

  it('puts the way home in a wall, not in the middle of the floor', () => {
    for (const node of FIRST_CROWN.asides) {
      const arena = ENCOUNTERS[node.encounterId].arena;
      expect(arenaContains(arena, node.spawnAt, PLAYER_RADIUS), node.id).toBe(true);
      const wall = arena.halfExtents.y - Math.abs(node.spawnAt.y);
      expect(wall, node.id).toBeLessThan(1);
      for (const wave of ENCOUNTERS[node.encounterId].waves) {
        for (const spawn of wave.spawns) {
          const gap = Math.hypot(spawn.at.x - node.spawnAt.x, spawn.at.y - node.spawnAt.y);
          expect(gap, `${node.id} / ${spawn.archetype}`).toBeGreaterThan(2);
        }
      }
    }
  });

  it('leaves the ladder exactly where it was', () => {
    const { state } = inAside('captain');
    expect(state.index).toBe(0);
    expect(state.furthest).toBe(0);
    expect(state.aside).toBe('captain');
  });

  it('has no forward door at all', () => {
    const { state, node } = inAside('captain');
    expect(node.exitAt).toBeNull();
    expect(routeNextNode(FIRST_CROWN, state)).toBeNull();
  });

  it('does not win the crown, however decisively it is cleared', () => {
    const { state, world } = inAside('captain');
    world.outcome = 'cleared';
    settleRoute(FIRST_CROWN, state, world);
    expect(state.complete).toBe(false);
    expect(state.cleared).toEqual(['captain']);
  });

  it('sends the king back to the room he took the offer from', () => {
    const { state, world } = inAside('chancellor');
    expect(routeAtEntrance(FIRST_CROWN, state, world)).toBe(true);
    const back = retreatRoute(FIRST_CROWN, state, world);
    expect(back?.id).toBe('court');
    expect(state.aside).toBeNull();
    expect(routeNode(FIRST_CROWN, state).id).toBe('court');
  });

  it('lets him leave before the boss is dead, because every gate is a forward gate', () => {
    const { state, world } = inAside('captain');
    world.outcome = 'running';
    expect(retreatRoute(FIRST_CROWN, state, world)?.id).toBe('court');
  });

  it('names the fight while it is alive and says nothing once it is over', () => {
    const { state, world } = inAside('captain');
    expect(routeObjective(FIRST_CROWN, state, world)).toBe('THE CAPTAIN OF THE GUARD — end it');
    world.outcome = 'cleared';
    expect(routeObjective(FIRST_CROWN, state, world)).toBeNull();
  });

  it('tells the operator he is off the ladder', () => {
    const { state, world } = inAside('captain');
    const readout = routeReadout(FIRST_CROWN, state, world, 'E');
    expect(readout[0]).toContain('off the ladder');
    expect(readout[1]).toContain('captain (aside) -> captain');
  });

  it('recovers on the ladder if an aside is renamed out from under the state', () => {
    const state = createRouteState();
    state.aside = 'the_chancellery_that_was_removed';
    expect(routeNode(FIRST_CROWN, state).id).toBe('court');
  });
});

describe('retrying a room that was already cleared', () => {
  it('forgets the clear, so the garrison comes back', () => {
    const state = createRouteState();
    state.index = 1;
    const node = routeNode(FIRST_CROWN, state);
    markRouteNodeCleared(state, node);
    expect(routeNodeCleared(state, node)).toBe(true);

    forgetRouteNodeCleared(state, node);
    expect(routeNodeCleared(state, node)).toBe(false);
  });

  it("leaves every other room's record alone", () => {
    const state = createRouteState();
    markRouteNodeCleared(state, FIRST_CROWN.nodes[1]);
    markRouteNodeCleared(state, FIRST_CROWN.nodes[2]);
    forgetRouteNodeCleared(state, FIRST_CROWN.nodes[1]);
    expect(state.cleared).toEqual([FIRST_CROWN.nodes[2].id]);
  });

  it('is safe on a room that was never cleared', () => {
    const state = createRouteState();
    forgetRouteNodeCleared(state, FIRST_CROWN.nodes[3]);
    expect(state.cleared).toEqual([]);
  });
});

describe('finishing the route', () => {
  it('does not take the doors away', () => {
    const state = createRouteState();
    state.index = FIRST_CROWN.nodes.length - 1;
    state.complete = true;
    const last = routeNode(FIRST_CROWN, state);
    const world = createWorld(encounterOf(last), DEFAULT_COMBAT, 1);
    world.players[0].pos = { ...last.spawnAt };

    expect(routeAtEntrance(FIRST_CROWN, state, world)).toBe(true);
    expect(retreatRoute(FIRST_CROWN, state, world)?.id).toBe('antechamber');
  });

  it('has nowhere forward to go from the last rung', () => {
    const state = createRouteState();
    state.index = FIRST_CROWN.nodes.length - 1;
    expect(routeNextNode(FIRST_CROWN, state)).toBeNull();
  });
});

describe('the victory line', () => {
  it('names the run rather than describing the feature', () => {
    expect(victorySubtitle({ attempts: 1, escortAlive: null, feats: [] })).toBe('First attempt · walked alone');
    expect(victorySubtitle({ attempts: 4, escortAlive: true, feats: [] })).toBe(
      '4 attempts · Mara walked out with you',
    );
    expect(victorySubtitle({ attempts: 2, escortAlive: false, feats: [] })).toBe('2 attempts · Mara did not');
  });

  it('says nothing about an escort nobody took', () => {
    expect(victorySubtitle({ attempts: 3, escortAlive: null, feats: [] })).not.toContain('Mara');
  });
});

describe('where the escort appears', () => {
  it('comes through the door the king came through, not the room’s own start', () => {
    const state = createEscortState();
    state.status = 'active';
    const atDoor = { x: 8, y: 0 };
    const spawn = escortSpawn(state, atDoor, Math.PI)!;
    expect(spawn).not.toBeNull();
    expect(Math.hypot(spawn.x - atDoor.x, spawn.y - atDoor.y)).toBeLessThan(2);
  });

  it('places her behind him, whichever way he is facing', () => {
    const state = createEscortState();
    state.status = 'active';
    for (const facing of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const at = { x: 0, y: 0 };
      const spawn = escortSpawn(state, at, facing)!;
      const dot = Math.cos(facing) * spawn.x + Math.sin(facing) * spawn.y;
      expect(dot, `facing ${facing}`).toBeLessThan(0);
    }
  });

  it('is off to one side, so she is not hidden by him walking away', () => {
    const state = createEscortState();
    state.status = 'active';
    const spawn = escortSpawn(state, { x: 0, y: 0 }, 0)!;
    expect(Math.abs(spawn.y)).toBeGreaterThan(0.2);
  });

  it('places nobody when no escort was taken', () => {
    expect(escortSpawn(createEscortState(), { x: 0, y: 0 }, 0)).toBeNull();
  });
});

describe('restarting the last room', () => {
  it('withdraws the ending so it has to be earned again', () => {
    const run = createRouteRun(ENCOUNTERS, LEAVE.label);
    run.route.index = FIRST_CROWN.nodes.length - 1;
    run.route.complete = true;
    run.victoryMs = 4000;
    markRouteNodeCleared(run.route, FIRST_CROWN.nodes[run.route.index]);

    retryRoom(run);

    expect(run.route.complete).toBe(false);
    expect(run.victoryMs).toBeNull();
    expect(run.route.cleared).toEqual([]);
  });

  it('re-earns the ending when the room is cleared again', () => {
    const run = createRouteRun(ENCOUNTERS, LEAVE.label);
    run.route.index = FIRST_CROWN.nodes.length - 1;
    retryRoom(run);

    const last = FIRST_CROWN.nodes[run.route.index];
    const world = createWorld(ENCOUNTERS[last.encounterId], DEFAULT_COMBAT, 1);
    world.outcome = 'cleared';
    settleRoute(FIRST_CROWN, run.route, world);

    expect(run.route.complete).toBe(true);
  });

  it('keeps the feats, because they are about the sitting and not the room', () => {
    const run = createRouteRun(ENCOUNTERS, LEAVE.label);
    run.route.index = FIRST_CROWN.nodes.length - 1;
    run.feats.hitsTaken = 3;
    run.feats.skipped = true;

    retryRoom(run);

    expect(run.feats.hitsTaken).toBe(3);
    expect(run.feats.skipped).toBe(true);
  });
});

describe('pegar um poder num plinto', () => {

  const court = () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    combat.power = 'lightning';
    const run = createRouteRun(ENCOUNTERS, LEAVE.label);
    const world = createWorld(ENCOUNTERS.wayfarer_court, combat, 1);
    enterRoom(run, world, combat);
    return { combat, run, world };
  };

  const beside = (stand: (typeof POWER_STANDS)[number], radius: number) => ({
    x: stand.at.x,
    y: stand.at.y - (STAND_RADIUS + radius) - 0.05,
  });

  it('troca o poder ao interagir encostado nele', () => {
    const { combat, run, world } = court();
    const stand = POWER_STANDS.find((s) => s.kind === 'blink')!;
    world.players[0].pos = beside(stand, combat.player.radius);

    expect(interactRoom(run, world, combat).change).toBeNull();
    expect(combat.power).toBe('blink');
  });

  it('oferece a interação exatamente onde o rei consegue chegar', () => {
    const { combat, run, world } = court();
    for (const stand of POWER_STANDS) {
      if (stand.kind === combat.power) continue;
      world.players[0].pos = beside(stand, combat.player.radius);
      expect(offersInteract(run, world, combat), stand.label).toBe(true);
    }
  });

  it('não oferece nada no meio da sala', () => {
    const { combat, run, world } = court();
    world.players[0].pos = { x: 0, y: 0 };
    expect(offersInteract(run, world, combat)).toBe(false);
  });
});

describe('o poder atravessa as portas', () => {
  const court = (power = 'lightning' as const) => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const run = createRouteRun(ENCOUNTERS, LEAVE.label, power);
    const world = createWorld(ENCOUNTERS.wayfarer_court, combat, 1);
    enterRoom(run, world, combat);
    return { combat, run, world };
  };

  it('sobrevive a um combat reconstruído do preset', () => {
    const { combat, run, world } = court();
    const stand = POWER_STANDS.find((s) => s.kind === 'freeze')!;
    world.players[0].pos = { x: stand.at.x, y: stand.at.y - (STAND_RADIUS + combat.player.radius) - 0.05 };
    interactRoom(run, world, combat);
    expect(run.power).toBe('freeze');

    const fresh = structuredClone(DEFAULT_COMBAT);
    const next = createWorld(ENCOUNTERS.kernel_guard, fresh, 1);
    enterRoom(run, next, fresh);

    expect(fresh.power).toBe('freeze');
  });

  it('aprende o que um drop trocou, para não desfazer no próximo portal', () => {
    const { combat, run, world } = court();
    combat.power = 'turncoat';
    observeRoom(run, world, combat);
    expect(run.power).toBe('turncoat');
  });
});

describe('the antechamber’s seals (ADR-039)', () => {
  const antechamber = FIRST_CROWN.nodes.find((node) => node.id === 'antechamber')!;

  const enterAntechamber = (run = createRouteRun(PUBLIC_ENCOUNTERS, LEAVE.label)) => {
    jumpRoute(FIRST_CROWN, run.route, 'antechamber');
    const world = createWorld(ENCOUNTERS.upper_hall, DEFAULT_COMBAT, 1);
    enterRoom(run, world, { ...DEFAULT_COMBAT });
    return { run, world };
  };

  const yieldFloor = (run: ReturnType<typeof createRouteRun>) => {
    const spec = run.puzzle!.spec;
    stepSealPuzzle(run.puzzle!, (spec.flashOnMs + spec.flashGapMs) * spec.sequence.length);
  };

  const pressAt = (
    run: ReturnType<typeof createRouteRun>,
    world: World,
    pos: { x: number; y: number },
  ) => {
    world.players[0].pos = { ...pos };
    return interactRoom(run, world, { ...DEFAULT_COMBAT });
  };

  it('stands the seals up on entry, solid, and only in the antechamber', () => {
    const { run, world } = enterAntechamber();
    expect(run.puzzle).not.toBeNull();
    expect(sealPuzzleSolved(run.puzzle!)).toBe(false);
    expect(world.arena.obstacles).toHaveLength(ANTECHAMBER_PUZZLE.seals.length);

    const court = createRouteRun(PUBLIC_ENCOUNTERS, LEAVE.label);
    const courtWorld = createWorld(ENCOUNTERS.wayfarer_court, DEFAULT_COMBAT, 1);
    enterRoom(court, courtWorld, { ...DEFAULT_COMBAT });
    expect(court.puzzle).toBeNull();
  });

  it('holds the door shut until the seals are pulled in order, then opens it', () => {
    const { run, world } = enterAntechamber();
    expect(routeExitOpen(antechamber, world, run.route)).toBe(false);

    expect(pressAt(run, world, antechamber.exitAt!).change).toBeNull();

    yieldFloor(run);
    for (const index of ANTECHAMBER_PUZZLE.sequence) {
      expect(pressAt(run, world, ANTECHAMBER_PUZZLE.seals[index].at).change).toBeNull();
    }
    expect(sealPuzzleSolved(run.puzzle!)).toBe(true);
    expect(routeNodeCleared(run.route, antechamber)).toBe(true);
    expect(routeExitOpen(antechamber, world, run.route)).toBe(true);

    const through = pressAt(run, world, antechamber.exitAt!);
    expect(through.change?.node.id).toBe('first_blade');
  });

  it('ignores pulls while the braziers hold the floor', () => {
    const { run, world } = enterAntechamber();
    expect(run.puzzle!.phase.kind).toBe('showing');
    pressAt(run, world, ANTECHAMBER_PUZZLE.seals[ANTECHAMBER_PUZZLE.sequence[0]].at);
    expect(run.puzzle!.lit.every((lit) => !lit)).toBe(true);
  });

  it('replays and resets on a wrong pull, and the door stays shut', () => {
    const { run, world } = enterAntechamber();
    yieldFloor(run);
    pressAt(run, world, ANTECHAMBER_PUZZLE.seals[ANTECHAMBER_PUZZLE.sequence[0]].at);
    const wrong = ANTECHAMBER_PUZZLE.sequence[ANTECHAMBER_PUZZLE.sequence.length - 1];
    pressAt(run, world, ANTECHAMBER_PUZZLE.seals[wrong].at);
    expect(run.puzzle!.lit.every((lit) => !lit)).toBe(true);
    expect(run.puzzle!.phase.kind).toBe('showing');
    expect(routeExitOpen(antechamber, world, run.route)).toBe(false);
  });

  it('advances the playback from applyRouteIntents, on the tick’s own clock', () => {
    const { run, world } = enterAntechamber();
    const spec = run.puzzle!.spec;
    const showingMs = (spec.flashOnMs + spec.flashGapMs) * spec.sequence.length;
    for (let i = 0; i <= Math.ceil(showingMs / TICK_MS); i++) {
      applyRouteIntents(run, world, { ...DEFAULT_COMBAT }, [NEUTRAL_INTENT], () => 0);
    }
    expect(run.puzzle!.phase.kind).toBe('awaiting');
  });

  it('offers the interact button at a seal once the floor is the player’s', () => {
    const { run, world } = enterAntechamber();
    const seal = ANTECHAMBER_PUZZLE.seals[0].at;
    world.players[0].pos = { ...seal };
    expect(offersInteract(run, world, DEFAULT_COMBAT, world.players[0])).toBe(false);
    yieldFloor(run);
    expect(offersInteract(run, world, DEFAULT_COMBAT, world.players[0])).toBe(true);
  });

  it('walks back into pulled seals after a retreat, and unsolves them on a retry', () => {
    const { run, world } = enterAntechamber();
    yieldFloor(run);
    for (const index of ANTECHAMBER_PUZZLE.sequence) {
      pressAt(run, world, ANTECHAMBER_PUZZLE.seals[index].at);
    }
    pressAt(run, world, antechamber.exitAt!);

    run.arriveFrom = 'exit';
    jumpRoute(FIRST_CROWN, run.route, 'antechamber');
    const back = createWorld(ENCOUNTERS.upper_hall, DEFAULT_COMBAT, 1);
    enterRoom(run, back, { ...DEFAULT_COMBAT });
    expect(sealPuzzleSolved(run.puzzle!)).toBe(true);
    expect(routeExitOpen(antechamber, back, run.route)).toBe(true);

    retryRoom(run);
    const again = createWorld(ENCOUNTERS.upper_hall, DEFAULT_COMBAT, 1);
    enterRoom(run, again, { ...DEFAULT_COMBAT });
    expect(sealPuzzleSolved(run.puzzle!)).toBe(false);
    expect(routeExitOpen(antechamber, again, run.route)).toBe(false);
  });
});
