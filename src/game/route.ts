
import type { Player, Vec2, World } from '../sim/types';
import { near, partyAt } from './party';

export type RouteBeat =
  | 'introduce'
  | 'develop'
  | 'twist'
  | 'conclude'
  | 'breather'
  | 'exam'
  | 'endure'
  | 'crown'
  | 'aside';

export type RouteGate = 'cleared' | 'open';

export interface RouteNode {
  id: string;
  encounterId: string;
  label: string;
  beat: RouteBeat;
  spawnAt: Vec2;
  exitAt: Vec2 | null;
  gate: RouteGate;
  teaches: string;
}

export interface Route {
  id: string;
  label: string;
  nodes: readonly RouteNode[];
  asides: readonly RouteNode[];
}

export interface RouteState {
  routeId: string;
  index: number;
  aside: string | null;
  furthest: number;
  cleared: string[];
  complete: boolean;
}

export const FIRST_CROWN: Route = {
  id: 'first_crown',
  label: 'THE FIRST CROWN',
  nodes: [
    {
      id: 'court',
      encounterId: 'wayfarer_court',
      label: 'THE COURT',
      beat: 'introduce',
      spawnAt: { x: -2, y: 0 },
      exitAt: { x: 8, y: 0 },
      gate: 'open',
      teaches: 'Move, aim, swing — nothing is watching yet',
    },
    {
      id: 'guardroom',
      encounterId: 'kernel_guard',
      label: 'THE GUARDROOM',
      beat: 'develop',
      spawnAt: { x: -8, y: 0 },
      exitAt: { x: 8, y: 0 },
      gate: 'cleared',
      teaches: 'One guard, one readable telegraph',
    },
    {
      id: 'passage',
      encounterId: 'kernel_duelist',
      label: 'THE DOG-LEG PASSAGE',
      beat: 'develop',
      spawnAt: { x: -5.5, y: -2.4 },
      exitAt: { x: 5.5, y: 2.4 },
      gate: 'cleared',
      teaches: 'A duelist jitters its timing — read, do not memorize',
    },
    {
      id: 'gallery',
      encounterId: 'spacing_archer',
      label: 'THE GALLERY',
      beat: 'twist',
      spawnAt: { x: 1.37, y: 3.76 },
      exitAt: { x: -1.71, y: -4.7 },
      gate: 'cleared',
      teaches: 'A threat you cannot reach — melee spacing stops being free',
    },
    {
      id: 'hall',
      encounterId: 'overlap_court',
      label: 'THE UPPER HALL',
      beat: 'conclude',
      spawnAt: { x: -6, y: -4 },
      exitAt: { x: 5, y: 5 },
      gate: 'cleared',
      teaches: 'All three at once, arriving before the room is empty',
    },
    {
      id: 'siege',
      encounterId: 'siege_10',
      label: 'THE LONG SIEGE',
      beat: 'endure',
      spawnAt: { x: 0, y: 6.1 },
      exitAt: { x: 0, y: -6.1 },
      gate: 'cleared',
      teaches: 'Ten waves. Nothing new — only whether it holds when you are tired',
    },
    {
      id: 'antechamber',
      encounterId: 'upper_hall',
      label: 'THE ANTECHAMBER',
      beat: 'breather',
      spawnAt: { x: 0, y: 4.8 },
      exitAt: { x: 0, y: -5.5 },
      gate: 'cleared',
      teaches: 'No fight. The braziers say the order; the seals ask it back',
    },
    {
      id: 'first_blade',
      encounterId: 'first_blade',
      label: 'THE FIRST BLADE',
      beat: 'crown',
      spawnAt: { x: 0, y: 5 },
      exitAt: null,
      gate: 'cleared',
      teaches: 'The last man between the king and his crown',
    },
  ],



  asides: [
    {
      id: 'captain',
      encounterId: 'captain',
      label: 'THE CAPTAIN OF THE GUARD',
      beat: 'aside',
      spawnAt: { x: 0, y: 6.1 },
      exitAt: null,
      gate: 'cleared',
      teaches: 'Nothing the ladder needs. Parry or hold — pick one and pay for it',
    },
    {
      id: 'chancellor',
      encounterId: 'chancellor',
      label: 'THE CHANCELLOR',
      beat: 'aside',
      spawnAt: { x: 0, y: 6.1 },
      exitAt: null,
      gate: 'cleared',
      teaches: 'Nothing the ladder needs. The room throws as hard as the man does',
    },


    {
      id: 'glass_regent',
      encounterId: 'glass_regent',
      label: 'THE GLASS REGENT',
      beat: 'aside',
      spawnAt: { x: 0, y: 6.1 },
      exitAt: null,
      gate: 'cleared',
      teaches: 'Nothing the ladder needs. No sword reaches him — return the shard until it breaks',
    },
    {
      id: 'queen',
      encounterId: 'queen',
      label: 'THE QUEEN',
      beat: 'aside',
      spawnAt: { x: 0, y: 6.1 },
      exitAt: null,
      gate: 'cleared',
      teaches: 'Nothing the ladder needs. Every phrase is borrowed; the tempo is hers',
    },

    {
      id: 'thorn_marshal',
      encounterId: 'thorn_marshal',
      label: 'THE THORN MARSHAL',
      beat: 'aside',
      spawnAt: { x: 0, y: 6.1 },
      exitAt: null,
      gate: 'cleared',
      teaches: 'Nothing the ladder needs. The pike owns the middle distance — stand where it costs him',
    },
  ],
};

export const TRAINING_YARD: Route = {
  id: 'training_yard',
  label: 'THE TRAINING YARD',
  nodes: [
    {
      id: 'fundamentals',
      encounterId: 'tutorial_fundamentals',
      label: 'THE YARD',
      beat: 'introduce',
      spawnAt: { x: -4, y: 0 },
      exitAt: { x: 8, y: 0 },
      gate: 'open',
      teaches: 'Move, aim, and both swings — one distant teacher who waits',
    },
    {
      id: 'defense',
      encounterId: 'tutorial_defense',
      label: 'THE GUARD POST',
      beat: 'develop',
      spawnAt: { x: -4, y: 0 },
      exitAt: { x: 8, y: 0 },
      gate: 'open',
      teaches: 'Guard, the perfect parry, and the step that leaves danger',
    },
    {
      id: 'focus',
      encounterId: 'tutorial_focus',
      label: 'THE STILL ROOM',
      beat: 'develop',
      spawnAt: { x: -4, y: 0 },
      exitAt: { x: 8, y: 0 },
      gate: 'open',
      teaches: 'Three clean parries earn the Royal Instant — and how to spend it',
    },
    {
      id: 'power',
      encounterId: 'tutorial_power',
      label: 'THE CHANNEL',
      beat: 'twist',
      spawnAt: { x: -4, y: 0 },
      exitAt: null,
      gate: 'open',
      teaches: 'The lightning the king carries, and holding it on a target',
    },
  ],
  asides: [],
};

export const ROUTES: Record<string, Route> = {
  [FIRST_CROWN.id]: FIRST_CROWN,
  [TRAINING_YARD.id]: TRAINING_YARD,
};

export const createRouteState = (route: Route = FIRST_CROWN): RouteState => ({
  routeId: route.id,
  index: 0,
  aside: null,
  furthest: 0,
  cleared: [],
  complete: false,
});

export const routeDestination = (route: Route, nodeId: string): RouteNode | null =>
  route.asides.find((node) => node.id === nodeId) ??
  route.nodes.find((node) => node.id === nodeId) ??
  null;

export const routeNode = (route: Route, state: RouteState): RouteNode =>
  (state.aside === null
    ? undefined
    : route.asides.find((node) => node.id === state.aside)) ?? route.nodes[state.index];

export const routeNextNode = (route: Route, state: RouteState): RouteNode | null =>
  state.aside !== null ? null : (route.nodes[state.index + 1] ?? null);

export const routeNodeCleared = (state: RouteState, node: RouteNode): boolean =>
  state.cleared.includes(node.id);

export const routeExitOpen = (
  node: RouteNode,
  world: World,
  state?: RouteState,
): boolean =>
  node.gate === 'open' ||
  world.outcome === 'cleared' ||
  (state !== undefined && routeNodeCleared(state, node));

export const markRouteNodeCleared = (state: RouteState, node: RouteNode): void => {
  if (!state.cleared.includes(node.id)) state.cleared.push(node.id);
};

export const forgetRouteNodeCleared = (state: RouteState, node: RouteNode): void => {
  state.cleared = state.cleared.filter((id) => id !== node.id);
};

export const kingAtExit = (node: RouteNode, king: Player): boolean =>
  node.exitAt !== null && near(king.pos, node.exitAt);

export const routeAtExit = (node: RouteNode, world: World): boolean =>
  node.exitAt !== null && partyAt(world, node.exitAt);

export const routeAtEntrance = (
  route: Route,
  state: RouteState,
  world: World,
): boolean =>
  (state.aside !== null || state.index > 0) &&
  partyAt(world, routeNode(route, state).spawnAt);

export const kingAtEntrance = (route: Route, state: RouteState, king: Player): boolean =>
  (state.aside !== null || state.index > 0) && near(king.pos, routeNode(route, state).spawnAt);

export const routePreviousNode = (route: Route, state: RouteState): RouteNode | null =>
  state.aside !== null
    ? (route.nodes[state.index] ?? null)
    : state.index > 0
      ? route.nodes[state.index - 1]
      : null;

export const retreatRoute = (
  route: Route,
  state: RouteState,
  world: World,
): RouteNode | null => {
  if (!routeAtEntrance(route, state, world)) return null;
  const previous = routePreviousNode(route, state);
  if (previous === null) return null;
  if (state.aside !== null) {
    state.aside = null;
    return previous;
  }
  state.index -= 1;
  return previous;
};

export const routePrompt = (
  route: Route,
  state: RouteState,
  world: World,
  interact: string,
): string | null => {
  const node = routeNode(route, state);
  if (routeAtEntrance(route, state, world)) {
    const previous = routePreviousNode(route, state);
    if (previous !== null) return `${interact}  BACK TO ${previous.label}`;
  }
  if (!routeAtExit(node, world)) return null;
  const next = routeNextNode(route, state);
  if (next === null) return null;
  return routeExitOpen(node, world, state)
    ? `${interact}  ENTER ${next.label}`
    : `${next.label}  LOCKED`;
};

export const advanceRoute = (
  route: Route,
  state: RouteState,
  world: World,
): RouteNode | null => {
  const node = routeNode(route, state);
  if (!routeAtExit(node, world) || !routeExitOpen(node, world, state)) return null;
  const next = routeNextNode(route, state);
  if (next === null) return null;
  if (world.outcome === 'cleared') markRouteNodeCleared(state, node);
  state.index += 1;
  state.furthest = Math.max(state.furthest, state.index);
  return next;
};

export const jumpRoute = (
  route: Route,
  state: RouteState,
  nodeId: string,
): RouteNode | null => {
  const aside = route.asides.find((node) => node.id === nodeId);
  if (aside !== undefined) {
    state.aside = aside.id;
    return aside;
  }
  const index = route.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return null;
  state.aside = null;
  state.index = index;
  state.furthest = Math.max(state.furthest, index);
  return route.nodes[index];
};

export const settleRoute = (route: Route, state: RouteState, world: World): void => {
  if (world.outcome === 'cleared') markRouteNodeCleared(state, routeNode(route, state));
  if (state.aside !== null) return;
  if (routeNextNode(route, state) !== null) return;
  if (world.outcome === 'cleared') state.complete = true;
};

export const routeObjective = (
  route: Route,
  state: RouteState,
  world: World,
): string | null => {
  if (state.complete) return 'The crown is yours';
  const node = routeNode(route, state);
  if (state.aside !== null) {
    return world.outcome === 'cleared' || routeNodeCleared(state, node)
      ? null
      : `${node.label} — end it`;
  }
  const next = routeNextNode(route, state);
  if (next === null) return `${node.label} — end it`;
  if (!routeExitOpen(node, world, state)) return `${node.label} — clear the room`;
  return null;
};

export const routeProgress = (route: Route, state: RouteState): string =>
  `${state.index + 1} / ${route.nodes.length}`;

export const routeReadout = (
  route: Route,
  state: RouteState,
  world: World,
  interact: string,
): readonly string[] => {
  const node = routeNode(route, state);
  return [
    `route       ${route.label}  ${routeProgress(route, state)}${
      state.aside === null ? '' : '  (off the ladder)'
    }`,
    `  node       ${node.id} (${node.beat}) -> ${node.encounterId}`,
    `  objective  ${routeObjective(route, state, world) ?? '-'}`,
    `  teaches    ${node.teaches}`,
    `  door       ${routePrompt(route, state, world, interact) ?? '-'}`,
    `  furthest   ${state.furthest + 1} / ${route.nodes.length}`,
  ];
};
