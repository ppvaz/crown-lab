
import type { World } from '../src/sim/types';
import { TICK_MS } from '../src/sim/types';
import { bareWorld, cfg, countOf, firstOf, intent, run, ticksFor } from './support/world';

const c = cfg();
const HEAVY = c.player.attacks.heavy;
const LIGHT = c.player.attacks.light;
const PARRY = c.player.parry;
const STEP = c.player.step;

const press = (world: World, input: Parameters<typeof run>[2], n = 0) => {
  const events = run(world, 1, input);
  if (n > 0) events.push(...run(world, n));
  return events;
};

describe('attack phases', () => {
  it('walks windup -> active -> recovery -> idle on the configured clocks', () => {
    const w = bareWorld();
    press(w, intent({ lightPressed: true }));
    expect(w.players[0].state.kind).toBe('windup');

    run(w, ticksFor(LIGHT.windupMs));
    expect(w.players[0].state.kind).toBe('active');

    run(w, ticksFor(LIGHT.activeMs));
    expect(w.players[0].state.kind).toBe('recovery');

    run(w, ticksFor(LIGHT.recoveryMs));
    expect(w.players[0].state.kind).toBe('idle');
  });

  it('refuses to be cancelled out of a wind-up', () => {
    const w = bareWorld();
    press(w, intent({ heavyPressed: true }));
    expect(w.players[0].state.kind).toBe('windup');

    run(w, 4, intent({ lightPressed: true, stepPressed: true, guardPressed: true }));

    expect(w.players[0].state.kind).toBe('windup');
    expect(w.players[0].state.attack).toBe('heavy');
  });

  it('refuses to be cancelled out of recovery — the punish window is the whole point', () => {
    const w = bareWorld();
    press(w, intent({ lightPressed: true }));
    run(w, ticksFor(LIGHT.windupMs) + ticksFor(LIGHT.activeMs));
    expect(w.players[0].state.kind).toBe('recovery');

    run(w, 4, intent({ stepPressed: true, guardPressed: true }));
    expect(w.players[0].state.kind).toBe('recovery');
  });

  it('reports a whiff when the swing finds nothing', () => {
    const w = bareWorld();
    const events = press(w, intent({ lightPressed: true }), ticksFor(LIGHT.windupMs + LIGHT.activeMs) + 2);
    const whiff = firstOf(events, 'attack_whiffed');
    expect(whiff?.data?.attack).toBe('light');
    expect(whiff?.data?.recoveryMs).toBe(LIGHT.recoveryMs);
  });

  it('will not start an attack it cannot pay for', () => {
    const w = bareWorld();
    w.players[0].stamina = HEAVY.staminaCost - 1;
    press(w, intent({ heavyPressed: true }));
    expect(w.players[0].state.kind).not.toBe('windup');
  });
});

describe('riposte', () => {
  it('skips most of the heavy wind-up and consumes the window', () => {
    const w = bareWorld();
    w.players[0].riposteWindowMs = PARRY.riposteWindowMs;

    const events = press(w, intent({ heavyPressed: true }));
    const started = firstOf(events, 'attack_started');

    expect(started?.data?.riposte).toBe(true);
    expect(started?.data?.effectiveWindupMs).toBeCloseTo(
      HEAVY.windupMs * PARRY.riposteWindupScale,
      6,
    );
    expect(w.players[0].riposteWindowMs).toBe(0);
  });

  it('reaches active far sooner than a cold heavy', () => {
    const cold = bareWorld();
    press(cold, intent({ heavyPressed: true }));
    run(cold, ticksFor(HEAVY.windupMs * PARRY.riposteWindupScale) + 1);
    expect(cold.players[0].state.kind).toBe('windup');

    const hot = bareWorld();
    hot.players[0].riposteWindowMs = PARRY.riposteWindowMs;
    press(hot, intent({ heavyPressed: true }));
    run(hot, ticksFor(HEAVY.windupMs * PARRY.riposteWindupScale) + 1);
    expect(hot.players[0].state.kind).toBe('active');
  });

  it('expires on its own clock', () => {
    const w = bareWorld();
    w.players[0].riposteWindowMs = PARRY.riposteWindowMs;
    run(w, ticksFor(PARRY.riposteWindowMs) + 1);
    expect(w.players[0].riposteWindowMs).toBe(0);

    const events = press(w, intent({ heavyPressed: true }));
    expect(firstOf(events, 'attack_started')?.data?.riposte).toBe(false);
  });
});

describe('guard and parry', () => {
  it('opens the parry window on the rising edge, not on the hold', () => {
    const w = bareWorld();
    run(w, 3, intent({ guardHeld: true }));
    expect(w.players[0].state.kind).toBe('guard');

    const fresh = bareWorld();
    press(fresh, intent({ guardHeld: true, guardPressed: true }));
    expect(fresh.players[0].state.kind).toBe('parry');
  });

  it('settles into a held guard once the window has passed', () => {
    const w = bareWorld();
    press(w, intent({ guardHeld: true, guardPressed: true }));
    run(w, ticksFor(PARRY.onsetMs + PARRY.perfectMs + PARRY.lateMs) + 1, intent({ guardHeld: true }));
    expect(w.players[0].state.kind).toBe('guard');
  });

  it('charges the lockout for a parry that absorbed nothing', () => {
    const w = bareWorld();
    press(w, intent({ guardHeld: true, guardPressed: true }));
    run(w, ticksFor(PARRY.onsetMs + PARRY.perfectMs + PARRY.lateMs) + 1, intent({ guardHeld: true }));
    expect(w.players[0].parryLockoutMs).toBeGreaterThan(0);
  });

  it('still raises the shield while locked out, but opens no window', () => {
    const w = bareWorld();
    w.players[0].parryLockoutMs = PARRY.whiffLockoutMs;

    press(w, intent({ guardHeld: true, guardPressed: true }));

    expect(w.players[0].state.kind).toBe('guard');
  });

  it('drops the guard the moment the button is released', () => {
    const w = bareWorld();
    run(w, 3, intent({ guardHeld: true }));
    expect(w.players[0].state.kind).toBe('guard');
    run(w, 1);
    expect(w.players[0].state.kind).toBe('idle');
  });

  it('slows movement while guarding', () => {
    const open = bareWorld();
    run(open, 60, intent({ move: { x: 1, y: 0 } }));

    const shielded = bareWorld();
    run(shielded, 60, intent({ move: { x: 1, y: 0 }, guardHeld: true }));

    expect(shielded.players[0].pos.x).toBeLessThan(open.players[0].pos.x);
    expect(shielded.players[0].pos.x).toBeGreaterThan(0);
  });
});

describe('step', () => {
  it('commits for its duration, then owes a recovery tail', () => {
    const w = bareWorld();
    press(w, intent({ stepPressed: true, move: { x: 1, y: 0 } }));

    expect(w.players[0].state.kind).toBe('step');

    run(w, ticksFor(STEP.durationMs));
    expect(w.players[0].state.kind).toBe('recovery');
    expect(w.players[0].state.attack).toBeNull();

    run(w, ticksFor(STEP.recoveryMs));
    expect(w.players[0].state.kind).toBe('move');
    press(w, intent({ lightPressed: true }));
    expect(w.players[0].state.kind).toBe('windup');
  });

  it('leaves the king gliding above run speed when recovery is shorter than deceleration', () => {
    const w = bareWorld();
    press(w, intent({ stepPressed: true, move: { x: 1, y: 0 } }));
    run(w, ticksFor(STEP.durationMs) + ticksFor(STEP.recoveryMs));

    const speed = Math.hypot(w.players[0].vel.x, w.players[0].vel.y);
    expect(speed).toBeGreaterThan(c.player.moveSpeed);
  });

  it('covers the configured distance to within the tick it is quantized to', () => {
    const w = bareWorld();
    press(w, intent({ stepPressed: true, move: { x: 1, y: 0 } }));
    run(w, ticksFor(STEP.durationMs));

    const perTick = STEP.distance / (STEP.durationMs / TICK_MS);
    expect(w.players[0].pos.x).toBeGreaterThan(STEP.distance);
    expect(w.players[0].pos.x).toBeLessThan(STEP.distance + 3 * perTick);
  });

  it('steps backwards rather than nowhere when the stick is neutral', () => {
    const w = bareWorld();
    press(w, intent({ stepPressed: true }));
    run(w, ticksFor(STEP.durationMs));
    expect(w.players[0].pos.x).toBeLessThan(-1);
  });

  it('turns freely while it travels, so the king arrives already facing his target', () => {
    const w = bareWorld();
    press(w, intent({ stepPressed: true, move: { x: 1, y: 0 }, facing: Math.PI }));
    run(w, ticksFor(STEP.durationMs), intent({ move: { x: 1, y: 0 }, facing: Math.PI }));

    expect(w.players[0].pos.x).toBeGreaterThan(1);
    expect(Math.abs(w.players[0].facing)).toBeGreaterThan(2.0);
  });

  it('keeps turning through its own tail, but never through an attack\'s', () => {
    const stepTail = bareWorld();
    press(stepTail, intent({ stepPressed: true, move: { x: 1, y: 0 } }));
    run(stepTail, ticksFor(STEP.durationMs));
    expect(stepTail.players[0].state.kind).toBe('recovery');
    expect(stepTail.players[0].state.attack).toBeNull();
    const before = stepTail.players[0].facing;
    run(stepTail, 4, intent({ facing: Math.PI }));
    expect(stepTail.players[0].facing).not.toBe(before);

    const swingTail = bareWorld();
    press(swingTail, intent({ lightPressed: true }));
    run(swingTail, ticksFor(LIGHT.windupMs + LIGHT.activeMs) + 1);
    expect(swingTail.players[0].state.kind).toBe('recovery');
    const locked = swingTail.players[0].facing;
    run(swingTail, 4, intent({ facing: Math.PI }));
    expect(swingTail.players[0].facing).toBe(locked);
  });

  it('grants no invulnerability at all — the escape is positional', () => {
    const w = bareWorld();
    press(w, intent({ stepPressed: true, move: { x: 1, y: 0 } }));

    expect(w.players[0].state.kind).toBe('step');
    expect(w.players[0].iframeMs).toBe(0);

    run(w, ticksFor(STEP.durationMs));
    expect(w.players[0].iframeMs).toBe(0);
  });
});

describe('stamina', () => {
  it('spends on commitment and pauses regen for the configured delay', () => {
    const w = bareWorld();
    press(w, intent({ lightPressed: true }));
    const afterSpend = w.players[0].stamina;
    expect(afterSpend).toBe(100 - LIGHT.staminaCost);
    expect(w.players[0].regenDelayMs).toBe(c.player.staminaRegenDelayMs);

    run(w, ticksFor(LIGHT.windupMs + LIGHT.activeMs) + 1);
    expect(w.players[0].stamina).toBeCloseTo(afterSpend, 6);
  });

  it('refills at the configured rate once the delay lapses', () => {
    const w = bareWorld();
    w.players[0].stamina = 50;
    run(w, ticksFor(1000));
    expect(w.players[0].stamina).toBeCloseTo(
      Math.min(100, 50 + c.player.staminaRegenPerSec),
      0,
    );
  });

  it('does not regenerate while the shield is up', () => {
    const w = bareWorld();
    w.players[0].stamina = 50;
    run(w, ticksFor(1000), intent({ guardHeld: true }));
    expect(w.players[0].stamina).toBe(50);
  });

  it('emits stamina_empty exactly once when a spend bottoms it out', () => {
    const w = bareWorld();
    w.players[0].stamina = LIGHT.staminaCost;
    const events = press(w, intent({ lightPressed: true }), 10);
    expect(countOf(events, 'stamina_empty')).toBe(1);
  });
});

describe('movement and facing', () => {
  it('accelerates rather than snapping to full speed', () => {
    const w = bareWorld();
    run(w, 1, intent({ move: { x: 1, y: 0 } }));
    const firstTick = w.players[0].vel.x;
    expect(firstTick).toBeGreaterThan(0);
    expect(firstTick).toBeLessThan(c.player.moveSpeed);

    run(w, 60, intent({ move: { x: 1, y: 0 } }));
    expect(w.players[0].vel.x).toBeCloseTo(c.player.moveSpeed, 3);
  });

  it('clamps a diagonal so it is not faster than a cardinal', () => {
    const straight = bareWorld();
    run(straight, 120, intent({ move: { x: 1, y: 0 } }));

    const diagonal = bareWorld();
    run(diagonal, 120, intent({ move: { x: 1, y: 1 } }));

    const dLen = Math.sqrt(diagonal.players[0].pos.x ** 2 + diagonal.players[0].pos.y ** 2);
    expect(dLen).toBeCloseTo(straight.players[0].pos.x, 1);
  });

  it('holds the player inside the arena', () => {
    const w = bareWorld();
    run(w, 2000, intent({ move: { x: 1, y: 0 } }));
    expect(w.players[0].pos.x).toBeCloseTo(w.arena.halfExtents.x - c.player.radius, 6);
  });

  it('turns at a limited rate rather than snapping', () => {
    const w = bareWorld();
    run(w, 1, intent({ facing: Math.PI }));
    expect(Math.abs(w.players[0].facing)).toBeCloseTo(c.player.turnRate * (TICK_MS / 1000), 6);
  });

  it('barely turns during a wind-up — the swing is aimed when it is committed', () => {
    const w = bareWorld();
    press(w, intent({ heavyPressed: true }));
    const before = w.players[0].facing;
    run(w, 1, intent({ heavyPressed: false, facing: Math.PI / 2 }));
    const turned = Math.abs(w.players[0].facing - before);
    expect(turned).toBeCloseTo(HEAVY.turnRateDuringWindup * (TICK_MS / 1000), 6);
    expect(turned).toBeLessThan(c.player.turnRate * (TICK_MS / 1000));
  });

  it('does not turn at all once the blade is live', () => {
    const w = bareWorld();
    press(w, intent({ lightPressed: true }));
    run(w, ticksFor(LIGHT.windupMs));
    expect(w.players[0].state.kind).toBe('active');
    const before = w.players[0].facing;
    run(w, 2, intent({ facing: Math.PI }));
    expect(w.players[0].facing).toBe(before);
  });
});

describe('telemetry hygiene', () => {
  it('does not emit a state change for every idle/move flicker', () => {
    const w = bareWorld();
    let events = run(w, 30, intent({ move: { x: 1, y: 0 } }));
    events = events.concat(run(w, 30));
    events = events.concat(run(w, 30, intent({ move: { x: -1, y: 0 } })));

    expect(countOf(events, 'player_state_change')).toBe(0);
  });

  it('does emit one for every real commitment', () => {
    const w = bareWorld();
    const events = press(
      w,
      intent({ lightPressed: true }),
      ticksFor(LIGHT.windupMs + LIGHT.activeMs + LIGHT.recoveryMs) + 3,
    );
    const kinds = events
      .filter((e) => e.type === 'player_state_change')
      .map((e) => e.data?.to);
    expect(kinds).toEqual(['windup', 'active', 'recovery', 'idle']);
  });
});
