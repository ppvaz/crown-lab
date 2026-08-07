Icons
=====

The sprite in `index.html` is inline, hand-maintained markup. There is no build step and no
dependency: every target must run from a `file://` URL in a Termux package and under a strict CSP
on Vercel, so an icon is markup or it does not exist. `tests/icon-sprite.test.ts` holds the spec.

Page controls
-------------

Seven glyphs — restart, pause, play, fullscreen, fullscreen-exit, lab, game.

Geometry is from **Tabler Icons**, MIT License, Copyright (c) 2020-2026 Paweł Kuna
(<https://tabler.io/icons>). Kept because it already matches the rules in `.icon *`:

    24 x 24 viewBox · fill: none · stroke: currentColor · stroke-width: 2 · round caps and joins

Anything added has to hold that spec by hand. Colour never appears in a symbol — the pressed and
hover states work by changing `color` on the button, and a hard-coded fill would ignore them.

Combat actions
--------------

Text, not icons: `ATK` `FORTE` `GUARDA` `PASSO` `PODER` `FOCO` `AÇÃO`.

The verbs have exact names and a 24px glyph does not — a light and a heavy swing are the same
weapon at different commitment, and every icon that separates them ends up implying a second
weapon. What was actually wrong with the old labels was their size: `clamp(9px, 2.5vw, 12px)` put
them under the 16 arcmin legibility floor on every phone `npm run audit:ui` measures. That is a
type-scale problem and is fixed as one.

Custom action art is planned and will replace the labels. When it lands it belongs here with its
provenance, and the button geometry must not move: the four core buttons sit on a constant-radius
arc that is load-bearing for thumb ergonomics — see `tests/touch-layout.test.ts` and
`npm run audit:touch`. Art changes the fill, never the layout.
