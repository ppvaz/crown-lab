
import type { CombatConfig, EncounterDef, Intent, Player, PowerKind, World } from '../sim/types';
import { TICK_MS } from '../sim/types';
import type { Palette } from '../render/palette';
import { angleOf } from '../sim/vec';
import { spawnCompanion } from '../sim/companion';
import {
  FIRST_CROWN,
  ROUTES,
  advanceRoute,
  createRouteState,
  forgetRouteNodeCleared,
  jumpRoute,
  kingAtEntrance,
  kingAtExit,
  retreatRoute,
  routeAtEntrance,
  routeAtExit,
  routeDestination,
  routeExitOpen,
  markRouteNodeCleared,
  routeNextNode,
  routeNode,
  routeNodeCleared,
  settleRoute,
  type Route,
  type RouteNode,
  type RouteState,
} from '../game/route';
import { POWER_STANDS, isArmoury, standNear } from '../game/armoury';
import { COURT_PILLARS } from '../game/court';
import type { Furniture } from '../game/furniture';
import { furnitureObstacles, furnitureOfKind, roomFurniture } from '../game/furniture';
import {
  ANTECHAMBER_PUZZLE,
  createSealPuzzle,
  inAntechamber,
  pressSeal,
  sealOffersInteract,
  sealPuzzleSolved,
  sealsLit,
  stepSealPuzzle,
  type SealPuzzle,
} from '../game/puzzle';
import type { Copy } from '../game/copy';
import { sealBodies } from '../render/puzzle';
import {
  HERALD,
  closeHerald,
  createHeraldState,
  cycleHerald,
  heraldLeave,
  heraldPresent,
  heraldPrompt,
  heraldTalking,
  nearHerald,
  openHerald,
  selectedOffer,
  type HeraldHintCopy,
  type HeraldOffer,
  type HeraldState,
} from '../game/herald';
import {
  ENVOY,
  answerEnvoy,
  createEnvoyState,
  cycleEnvoy,
  moveEnvoyCursor,
  typeEnvoy,
  envoyChoices,
  envoyActionCloses,
  envoyPresent,
  envoyPrompt,
  envoyStage,
  envoyTalking,
  nearEnvoy,
  openEnvoy,
  closeEnvoy,
  pressEnvoy,
  type EnvoyAction,
  type EnvoyParting,
  type EnvoyState,
} from '../game/envoy';
import {
  MARA,
  acceptEscort,
  createEscortState,
  escortObjective,
  escortPresent,
  escortPrompt,
  escortSpawn,
  maraWaiting,
  nearMara,
  settleEscort,
  syncEscort,
  type EscortState,
} from '../game/escort';
import {
  createFeatState,
  earnedFeats,
  observeFeats,
  type FeatState,
} from '../game/feats';
import type { Camera } from '../render/iso';
import type { LayoutFrame } from '../render/layout';
import { drawRoute, routeFloorPads } from '../render/route';
import type { FloorPad, SceneBody } from '../render/draw';
import { drawStandLabel } from '../render/armoury';
import { drawPickupPrompt } from '../render/draw-projectiles';
import { powerPickupInReach } from '../sim/pickups';
import { drawHeraldDialogue, drawHeraldLine } from '../render/herald';
import { drawEnvoyDialogue, drawEnvoyLine } from '../render/envoy';
import { drawMessenger } from '../render/messenger';
import { drawMara, maraBody } from '../render/escort';
import { drawVictory } from '../render/victory';

export interface RouteRun {
  route: RouteState;
  escort: EscortState;
  feats: FeatState;
  herald: HeraldState;
  envoy: EnvoyState;
  offers: readonly HeraldOffer[];
  victoryMs: number | null;
  arriveFrom: 'entrance' | 'exit';
  puzzle: SealPuzzle | null;
  power: PowerKind;
}

export const heraldOffersIn = (
  encounters: Readonly<Record<string, EncounterDef>>,
  leaveLabel: string,
): readonly HeraldOffer[] => {
  const rides = HERALD.offers.filter((offer) => {
    const node = offer.to === null ? null : routeDestination(FIRST_CROWN, offer.to);
    return node !== null && encounters[node.encounterId] !== undefined;
  });

  return rides.length === 0 ? [] : [...rides, heraldLeave(leaveLabel)];
};

export const createRouteRun = (
  encounters: Readonly<Record<string, EncounterDef>>,
  leaveLabel: string,
  power: PowerKind = 'lightning',
  route: Route = FIRST_CROWN,
): RouteRun => ({
  route: createRouteState(route),
  escort: createEscortState(),
  feats: createFeatState(),
  herald: createHeraldState(),
  envoy: createEnvoyState(),
  offers: heraldOffersIn(encounters, leaveLabel),
  victoryMs: null,
  arriveFrom: 'entrance',
  puzzle: null,
  power,
});

const routeOf = (run: RouteRun): Route => ROUTES[run.route.routeId] ?? FIRST_CROWN;

export const nextNode = (run: RouteRun): RouteNode | null =>
  routeNextNode(routeOf(run), run.route);

export const currentNode = (run: RouteRun): RouteNode => routeNode(routeOf(run), run.route);

export const roomEncounter = (
  run: RouteRun,
  encounters: Readonly<Record<string, EncounterDef>>,
): EncounterDef => {
  const node = currentNode(run);
  const def = encounters[node.encounterId];
  return routeNodeCleared(run.route, node) ? { ...def, waves: [] } : def;
};

export const enterRoom = (run: RouteRun, world: World, combat: CombatConfig): void => {
  combat.power = run.power;
  const node = currentNode(run);
  const spawn =
    run.arriveFrom === 'exit' && node.exitAt !== null ? node.exitAt : node.spawnAt;
  world.players[0].pos = { ...spawn };
  world.players[0].facing = angleOf({ x: -spawn.x, y: -spawn.y });

  run.puzzle = inAntechamber(world)
    ? createSealPuzzle(ANTECHAMBER_PUZZLE, routeNodeCleared(run.route, node))
    : null;

  const furniture = roomFurniture(world, run.escort, run.puzzle);
  if (furniture.length > 0) world.arena.obstacles = furnitureObstacles(furniture);

  const companionAt = escortSpawn(run.escort, world.players[0].pos, world.players[0].facing);
  if (companionAt !== null) {
    spawnCompanion(world, MARA.name, run.escort.hp, run.escort.maxHp, companionAt);
  }
};

export const kingAtUsableDoor = (run: RouteRun, world: World, king: Player): boolean => {
  if (kingAtEntrance(routeOf(run), run.route, king)) return true;
  const node = currentNode(run);
  return (
    routeNextNode(routeOf(run), run.route) !== null &&
    kingAtExit(node, king) &&
    routeExitOpen(node, world, run.route)
  );
};

export const atUsableDoor = (run: RouteRun, world: World): boolean => {
  if (routeAtEntrance(routeOf(run), run.route, world)) return true;
  const node = currentNode(run);
  return (
    routeNextNode(routeOf(run), run.route) !== null &&
    routeAtExit(node, world) &&
    routeExitOpen(node, world, run.route)
  );
};

export const takeableStand = (
  run: RouteRun,
  world: World,
  combat: CombatConfig,
  king: Player = world.players[0],
): ReturnType<typeof standNear> => {
  if (!isArmoury(world)) return null;
  const stand = standNear(king.pos);
  return stand === null || stand.kind === combat.power ? null : stand;
};

export const offersInteract = (
  run: RouteRun,
  world: World,
  combat: CombatConfig,
  king: Player = world.players[0],
): boolean =>
  kingAtUsableDoor(run, world, king) ||
  takeableStand(run, world, combat, king) !== null ||
  powerPickupInReach(world, combat, king) !== null ||
  (run.puzzle !== null && sealOffersInteract(run.puzzle, king.pos)) ||
  (heraldPresent(world) && nearHerald(king.pos) && run.offers.length > 0) ||
  (envoyPresent(world) && nearEnvoy(king.pos)) ||
  (escortPresent(world) && maraWaiting(run.escort) && nearMara(king.pos));

export const heraldHoldsMovement = (run: RouteRun, world: World, seat = 0): boolean =>
  heraldTalking(run.herald, world) && run.herald.speaker === seat;

export const speakerHoldsMovement = (run: RouteRun, world: World, seat = 0): boolean =>
  heraldHoldsMovement(run, world, seat) || envoyHoldsMovement(run, world, seat);

export const roomIntent = (run: RouteRun, world: World, intent: Intent, seat = 0): Intent =>
  speakerHoldsMovement(run, world, seat) ? { ...intent, move: { x: 0, y: 0 } } : intent;

export const gateRouteIntents = (
  run: RouteRun,
  world: World,
  intents: readonly Intent[],
): readonly Intent[] => {
  let held = false;
  for (let seat = 0; seat < intents.length; seat++) {
    if (speakerHoldsMovement(run, world, seat)) held = true;
  }
  if (!held) return intents;
  return intents.map((intent, seat) => roomIntent(run, world, intent, seat));
};

export const steerHerald = (run: RouteRun, world: World, axis: number, seat = 0): void => {
  if (!heraldTalking(run.herald, world) || run.herald.speaker !== seat) return;
  cycleHerald(run.herald, axis, run.offers.length);
};

export const steerEnvoy = (
  run: RouteRun,
  world: World,
  axis: number,
  session: { state: string; available: boolean },
  seat = 0,
  axisX = 0,
): void => {
  if (!envoyTalking(run.envoy, world) || run.envoy.speaker !== seat) return;
  if (run.envoy.answering) {
    moveEnvoyCursor(run.envoy, axisX, axis, TICK_MS);
    return;
  }
  cycleEnvoy(run.envoy, axis, envoyChoices(envoyStage(session)).length);
};

export const envoyHoldsMovement = (run: RouteRun, world: World, seat = 0): boolean =>
  envoyTalking(run.envoy, world) && run.envoy.speaker === seat;

export type RoomChange = { node: RouteNode; from: 'entrance' | 'exit' } | null;

export interface RouteEffect {
  change: RoomChange;
  envoy: EnvoyAction;
}

const NOTHING: RouteEffect = { change: null, envoy: 'none' };

export const interactRoom = (
  run: RouteRun,
  world: World,
  combat: CombatConfig,
  axis = 0,
  seat = 0,
  session: { state: string; available: boolean } = { state: '', available: false },
  axisX = 0,
): RouteEffect => {
  const king = world.players[seat] ?? world.players[0];


  if (envoyPresent(world) && nearEnvoy(king.pos)) {
    const stage = envoyStage(session);
    if (!run.envoy.open) {
      openEnvoy(run.envoy, axis, seat);
      return NOTHING;
    }
    if (run.envoy.speaker !== seat) return NOTHING;
    const action = pressEnvoy(run.envoy, stage, king.pos);
    if (action === 'leave') {
      closeEnvoy(run.envoy);
      return NOTHING;
    }

    if (action === 'type') {
      typeEnvoy(run.envoy);
      return NOTHING;
    }
    if (action === 'answer') {
      answerEnvoy(run.envoy, axisX, axis);
      return { change: null, envoy: 'answer' };
    }
    if (action === 'call' || action === 'join' || action === 'copy') {
      if (envoyActionCloses(action)) closeEnvoy(run.envoy);
      return { change: null, envoy: action };
    }
    return NOTHING;
  }
  if (heraldPresent(world) && nearHerald(king.pos) && run.offers.length > 0) {
    if (!run.herald.open) {
      openHerald(run.herald, axis, seat);
      return NOTHING;
    }
    if (run.herald.speaker !== seat) return NOTHING;
    const offer = selectedOffer(run.herald, run.offers);
    if (offer !== null && offer.to === null) {
      closeHerald(run.herald);
      return NOTHING;
    }
    const target =
      offer === null || offer.to === null ? null : jumpRoute(routeOf(run), run.route, offer.to);
    if (offer !== null && target !== null) {
      closeHerald(run.herald);
      if (offer.skipsLadder) run.feats.skipped = true;
      return { change: { node: target, from: 'entrance' }, envoy: 'none' };
    }
  }

  if (escortPresent(world) && acceptEscort(run.escort, king.pos)) {
    spawnCompanion(
      world,
      MARA.name,
      run.escort.hp,
      run.escort.maxHp,
      escortSpawn(run.escort, king.pos, king.facing) ?? king.pos,
    );
    return NOTHING;
  }

  if (run.puzzle !== null) {
    const pulled = pressSeal(run.puzzle, king.pos);
    if (pulled !== null) {
      if (pulled === 'solved') markRouteNodeCleared(run.route, currentNode(run));
      return NOTHING;
    }
  }

  const stand = takeableStand(run, world, combat, king);
  if (stand !== null) {
    combat.power = stand.kind;
    run.power = stand.kind;
    return NOTHING;
  }

  if (!atUsableDoor(run, world)) return NOTHING;
  const back = retreatRoute(routeOf(run), run.route, world);
  if (back !== null) return { change: { node: back, from: 'exit' }, envoy: 'none' };
  const next = advanceRoute(routeOf(run), run.route, world);
  return next === null ? NOTHING : { change: { node: next, from: 'entrance' }, envoy: 'none' };
};

export const applyRouteIntents = (
  run: RouteRun,
  world: World,
  combat: CombatConfig,
  intents: readonly Intent[],
  axisOf: (intent: Intent) => number,
  session: { state: string; available: boolean } = { state: '', available: false },
  axisXOf: (intent: Intent) => number = () => 0,
): RouteEffect => {
  if (run.puzzle !== null) stepSealPuzzle(run.puzzle, TICK_MS);
  for (let seat = 0; seat < world.players.length; seat++) {
    const intent = intents[seat];
    if (intent === undefined) continue;
    steerHerald(run, world, axisOf(intent), seat);
    steerEnvoy(run, world, axisOf(intent), session, seat, axisXOf(intent));
  }
  for (let seat = 0; seat < world.players.length; seat++) {
    const intent = intents[seat];
    if (intent?.interactPressed !== true) continue;
    const effect = interactRoom(
      run,
      world,
      combat,
      axisOf(intent),
      seat,
      session,
      axisXOf(intent),
    );
    if (effect.change !== null || effect.envoy !== 'none') return effect;
  }
  return NOTHING;
};

export const observeRoom = (run: RouteRun, world: World, combat: CombatConfig): void => {
  run.power = combat.power;

  if (run.herald.open && !heraldTalking(run.herald, world)) closeHerald(run.herald);
  settleRoute(routeOf(run), run.route, world);
  syncEscort(run.escort, world);
  observeFeats(run.feats, world.events);
  if (run.route.complete) {
    settleEscort(run.escort);
    run.victoryMs ??= 0;
  }
};

export const advanceVictory = (run: RouteRun, dtRealMs: number): void => {
  if (run.victoryMs !== null) run.victoryMs += dtRealMs;
};

export const retryRoom = (run: RouteRun): void => {
  forgetRouteNodeCleared(run.route, currentNode(run));
  run.route.complete = false;
  run.victoryMs = null;
};

export const roomSceneOpts = (
  run: RouteRun,
  world: World,
  combat: CombatConfig,
  scene: {
    ctx: CanvasRenderingContext2D;
    cam: Camera;
    pal: Palette;
    frame: LayoutFrame;
    simTimeMs: number;
  },
): {
  stands?: typeof POWER_STANDS;
  equippedPower?: CombatConfig['power'];
  herald?: boolean;
  pillars?: typeof COURT_PILLARS;
  floorPads?: FloorPad[];
  bodies?: SceneBody[];
} => {
  const furniture = roomFurniture(world, run.escort, run.puzzle);
  const standing = <K extends Furniture['kind']>(kind: K): boolean =>
    furnitureOfKind(furniture, kind).length > 0;

  return {
  stands: standing('power_stand')
    ? furnitureOfKind(furniture, 'power_stand').map((item) => item.stand)
    : undefined,
  equippedPower: combat.power,
  herald: standing('herald'),
  pillars: standing('court_pillar')
    ? furnitureOfKind(furniture, 'court_pillar').map((item) => ({
        at: item.at,
        radius: item.radius,
      }))
    : undefined,
  floorPads: routeFloorPads(
    scene.ctx,
    world,
    scene.cam,
    scene.pal,
    routeOf(run),
    run.route,
    scene.frame,
  ),


  bodies: [
    ...(run.puzzle !== null && standing('seal')
      ? sealBodies(scene.ctx, scene.cam, scene.pal, scene.simTimeMs, run.puzzle)
      : []),
    ...(standing('escort')
      ? [maraBody(scene.ctx, scene.cam, scene.pal, scene.simTimeMs)]
      : []),
    ...(standing('envoy')
      ? [
          {
            at: ENVOY.at,
            draw: () =>
              drawMessenger(
                scene.ctx,
                scene.cam,
                scene.pal,
                scene.simTimeMs,
                ENVOY.at,
                ENVOY.radius,
                scene.pal.identityCloth ?? scene.pal.hudText,
              ),
          },
        ]
      : []),
  ],
  };
};

export const drawRoom = (
  ctx: CanvasRenderingContext2D,
  run: RouteRun,
  world: World,
  cam: Camera,
  pal: Palette,
  frame: LayoutFrame,
  combat: CombatConfig,
  interact: string,
  simTimeMs: number,
  attempts: number,
  move: string,
  hint: HeraldHintCopy,
  session: {
    state: string;
    room: string;
    available: boolean;
    parting?: EnvoyParting;
  },
  puzzleCopy: Copy['puzzle'],
  seat = 0,
): boolean => {
  const king = world.players[seat] ?? world.players[0];
  if (escortPresent(world) && maraWaiting(run.escort)) {
    drawMara(ctx, cam, pal, frame, escortPrompt(run.escort, king.pos, interact));
  }
  if (envoyPresent(world) && nearEnvoy(king.pos)) {
    const stage = envoyStage(session);
    drawEnvoyLine(
      ctx,
      cam,
      pal,
      frame,
      stage,
      session.room,
      envoyPrompt(run.envoy, stage, king.pos, interact),
      session.parting,
    );
    if (envoyTalking(run.envoy, world)) {
      drawEnvoyDialogue(
        ctx,
        pal,
        frame,
        run.envoy,
        envoyStage(session),
        session.room,
        { move, interact },
        hint,
        session.parting,
      );
    }
  }
  if (heraldPresent(world) && run.offers.length > 0) {
    drawHeraldLine(
      ctx,
      cam,
      pal,
      frame,
      king.pos,
      heraldPrompt(run.herald, king.pos, interact),
    );
    if (heraldTalking(run.herald, world)) {
      drawHeraldDialogue(ctx, pal, frame, run.herald, run.offers, { move, interact }, hint);
    }
  }
  if (isArmoury(world)) {
    const reading = standNear(king.pos);
    if (reading !== null) {
      drawStandLabel(ctx, cam, pal, frame, reading, reading.kind === combat.power, interact);
    }
  }
  drawPickupPrompt(ctx, world, cam, pal, frame, combat, king, interact);

  const routePrompted = drawRoute(
    ctx,
    world,
    cam,
    pal,
    routeOf(run),
    run.route,
    frame,
    interact,
    escortObjective(run.escort),
    run.puzzle === null || sealPuzzleSolved(run.puzzle)
      ? null
      : run.puzzle.phase.kind === 'showing'
        ? puzzleCopy.watch
        : puzzleCopy.progress(sealsLit(run.puzzle), run.puzzle.spec.seals.length),
    run.puzzle !== null && sealOffersInteract(run.puzzle, king.pos)
      ? puzzleCopy.pull(interact)
      : null,
  );

  if (run.victoryMs !== null) {
    drawVictory(
      ctx,
      cam,
      pal,
      frame,
      {
        attempts,
        escortAlive:
          run.escort.status === 'available' ? null : run.escort.status !== 'failed',
        feats: earnedFeats(run.feats, {
          escortTaken: run.escort.status !== 'available',
          escortAlive: run.escort.status !== 'failed',
          escortUnharmed: !run.escort.everHurt,
        }),
      },
      run.victoryMs,
    );
  }

  return routePrompted;
};

export { FIRST_CROWN };
