
import type { World } from '../sim/types';
import type { Palette } from './palette';
import type { Camera } from './iso';
import {
  routeExitOpen,
  routeNextNode,
  routeNode,
  routePreviousNode,
  routeObjective,
  routePrompt,
  type Route,
  type RouteState,
} from '../game/route';
import { drawWrappedText } from './text';
import { AFFORDANCE_ROWS, regionRow, regionRowFits, type LayoutFrame } from './layout';
import type { FloorPad } from './draw';
import { floorPad } from './floor-pad';

const OBJECTIVE_ROWS = 2;

export const routeFloorPads = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
  route: Route,
  state: RouteState,
  frame: LayoutFrame,
): FloorPad[] => {
  const node = routeNode(route, state);
  const next = routeNextNode(route, state);
  const previous = routePreviousNode(route, state);
  const pads: FloorPad[] = [];

  if (node.exitAt !== null && next !== null) {
    pads.push(
      floorPad(ctx, world, cam, pal, frame, {
        at: node.exitAt,
        open: routeExitOpen(node, world, state),
        label: next.label,
        direction: 'forward',
        labelId: 'route.exit.label',
      }),
    );
  }

  if (previous !== null) {
    pads.push(
      floorPad(ctx, world, cam, pal, frame, {
        at: node.spawnAt,
        open: true,
        label: previous.label,
        direction: 'back',
        labelId: 'route.back.label',
      }),
    );
  }

  return pads;
};

export const drawRoute = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
  route: Route,
  state: RouteState,
  frame: LayoutFrame,
  verb: string,
  escortLine: string | null = null,
  puzzleLine: string | null = null,
  puzzlePrompt: string | null = null,
): boolean => {
  const type = frame.type;




  const objective = frame.regions.objective;
  if (objective !== undefined) {
    ctx.save();
    const right = objective.x + objective.w;
    ctx.textAlign = 'right';

    const firstRow = 1;
    let rows = 0;
    while (rows < OBJECTIVE_ROWS && regionRowFits(frame, objective, firstRow + rows)) {
      rows += 1;
    }


    const objectiveText = escortLine ?? puzzleLine ?? routeObjective(route, state, world);
    if (rows > 0 && objectiveText !== null) {
      ctx.fillStyle = pal.hudText;
      ctx.font = `${type.base}px ui-monospace, monospace`;
      drawWrappedText(
        ctx,
        'route.objective.text',
        objectiveText,
        objective.w,
        rows,
        right,
        (row) => regionRow(frame, objective, firstRow + row),
      );
    }
    ctx.restore();
  }

  const prompt = routePrompt(route, state, world, verb) ?? puzzlePrompt;
  const affordance = frame.regions.affordance;
  if (prompt !== null && affordance !== undefined) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.hudText;
    ctx.font = `${type.base}px ui-monospace, monospace`;
    drawWrappedText(
      ctx,
      'route.prompt.text',
      prompt,
      affordance.w,
      AFFORDANCE_ROWS,
      affordance.x + affordance.w / 2,
      (row) => regionRow(frame, affordance, row, type.base),
    );
    ctx.restore();
    return true;
  }
  return false;
};
