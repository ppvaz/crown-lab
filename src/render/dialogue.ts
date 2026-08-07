
import type { Palette } from './palette';
import { reportUiRect, reportUiText } from './ui-probe';
import type { UiElementId } from './ui-elements';
import { drawFittedText, drawWrappedText } from './text';
import { NARRATION_ROWS, regionRow, regionRowFits } from './layout';
import type { LayoutFrame, Rect } from './layout';
import {
  drawOrnamentalFrame,
  drawOrnamentalRule,
  UI_DISPLAY_FONT,
  UI_TEXT_FONT,
} from './ui-ornaments';

export type DialogueId = 'travel.dialogue' | 'herald.dialogue' | 'envoy.dialogue';

export type DialogueBody =
  | { kind: 'line'; line: string }
  | { kind: 'choices'; labels: readonly string[]; selected: number }
  | {
      kind: 'keys';
      id: UiElementId;
      rows: readonly (readonly string[])[];
      cursor: { row: number; col: number };
    };

export interface DialogueFrame {
  id: DialogueId;
  region: Rect;
  speaker: string;
  body: DialogueBody;
  aside?: { id: UiElementId; text: string } | null;
  hint: string | null;
}

const SELECTED = '◆ ';
const UNSELECTED = '◇ ';

const windowStart = (selected: number, count: number, rows: number): number =>
  Math.max(0, Math.min(selected - Math.floor((rows - 1) / 2), count - rows));

export const drawDialogue = (
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  frame: LayoutFrame,
  { id, region, speaker, body, aside = null, hint }: DialogueFrame,
): string[] => {
  const type = frame.type;
  const { x, y, w, h } = region;

  ctx.globalAlpha = 0.94;
  ctx.fillStyle = '#0b0b10';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  drawOrnamentalFrame(ctx, region, pal.playerAccent);
  reportUiRect(`${id}.box`, x, y, w, h);



  const inset = Math.round(type.base * 1.2);
  ctx.textAlign = 'left';
  ctx.fillStyle = pal.playerAccent;
  ctx.font = `bold ${type.base}px ${UI_DISPLAY_FONT}`;
  const speakerY = regionRow(frame, region, 0, type.base);
  ctx.fillText(speaker, x + inset, speakerY);
  reportUiText(ctx, `${id}.speaker`, speaker, x + inset, speakerY);

  drawOrnamentalRule(
    ctx,
    x + inset,
    x + w - inset,
    speakerY + type.base * 0.55,
    pal.playerAccent,
    0.46,
  );

  if (aside !== null) {
    ctx.textAlign = 'right';
    ctx.font = `bold ${type.base}px ui-monospace, monospace`;
    ctx.fillText(aside.text, x + w - inset, speakerY);
    reportUiText(ctx, aside.id, aside.text, x + w - inset, speakerY);
    ctx.textAlign = 'left';
  }



  let bodyRows = 1;
  for (let row = NARRATION_ROWS; row > 1; row -= 1) {
    if (regionRowFits(frame, region, row + 1, type.base)) {
      bodyRows = row;
      break;
    }
  }

  ctx.fillStyle = pal.hudText;
  ctx.font = `${type.base}px ${UI_TEXT_FONT}`;
  const bodyWidth = w - inset * 2;
  const bodyY = (index: number): number => regionRow(frame, region, index + 1, type.base);

  let lines: string[];
  if (body.kind === 'line') {
    lines = drawWrappedText(
      ctx,
      `${id}.text`,
      body.line,
      bodyWidth,
      bodyRows,
      x + inset,
      bodyY,
    );
  } else if (body.kind === 'keys') {



    const rows = Math.min(bodyRows, body.rows.length);
    ctx.font = `${type.base}px ui-monospace, monospace`;
    lines = [];
    for (let row = 0; row < rows; row += 1) {
      const cells = body.rows[row] ?? [];
      const onRow = body.cursor.row === row;
      let text = '';
      for (let col = 0; col < cells.length; col += 1) {
        const selected = onRow && body.cursor.col === col;
        const after = onRow && body.cursor.col === col - 1;
        text += col === 0 ? (selected ? '[' : '') : selected ? '[' : after ? ']' : ' ';
        text += cells[col];
      }
      if (onRow && body.cursor.col === cells.length - 1) text += ']';
      ctx.fillStyle = onRow ? pal.hudText : pal.hudDim;
      lines.push(
        drawFittedText(ctx, body.id, text, bodyWidth, x + inset, bodyY(row), `row${row}`),
      );
    }

  } else {


    const rows = Math.min(bodyRows, body.labels.length);
    const start = windowStart(body.selected, body.labels.length, rows);
    lines = [];
    for (let row = 0; row < rows; row += 1) {
      const index = start + row;
      const chosen = index === body.selected;
      ctx.fillStyle = chosen ? pal.hudText : pal.hudDim;
      lines.push(
        drawFittedText(
          ctx,
          `${id}.text`,
          `${chosen ? SELECTED : UNSELECTED}${body.labels[index]}`,
          bodyWidth,
          x + inset,
          bodyY(row),
          `row${row}`,
        ),
      );
    }
  }

  if (hint !== null) {
    ctx.textAlign = 'right';
    ctx.fillStyle = pal.hudDim;
    ctx.font = `${type.base}px ${UI_TEXT_FONT}`;
    const hintY = regionRow(frame, region, bodyRows + 1, type.base);
    ctx.fillText(hint, x + w - inset, hintY);
    reportUiText(ctx, `${id}.hint`, hint, x + w - inset, hintY);
  }

  return lines;
};
