
import { controlNamesFor } from '../src/game/controls';
import { copyFor, labCopyFor } from '../src/game/copy';
import { ENCOUNTERS } from '../src/lab/encounters';
import { TUTORIAL_ACTIONS, TutorialCoach } from '../src/game/tutorial';
import type { SimEvent } from '../src/sim/types';
import { intent } from './support/world';

const event = (type: SimEvent['type'], data?: Record<string, string | number | boolean>): SimEvent => ({
  tick: 1,
  type,
  data,
});

describe('tutorial coverage', () => {
  it('has a named lesson for every currently available player verb', () => {
    expect(TUTORIAL_ACTIONS).toEqual([
      'move',
      'aim',
      'light',
      'heavy',
      'guard',
      'parry',
      'step',
      'focus',
      'power',
    ]);
  });

  it('ships one selectable experiment for each curriculum group', () => {
    expect(ENCOUNTERS.tutorial_fundamentals.tutorial).toBe('fundamentals');
    expect(ENCOUNTERS.tutorial_defense.tutorial).toBe('defense');
    expect(ENCOUNTERS.tutorial_focus.tutorial).toBe('focus');
    expect(ENCOUNTERS.tutorial_power.tutorial).toBe('power');
  });
});

describe('TutorialCoach', () => {
  it('walks through the fundamental buttons in order', () => {
    const coach = new TutorialCoach(controlNamesFor('pointer', 'en'), labCopyFor('en'));
    coach.reset(ENCOUNTERS.tutorial_fundamentals, 'none', 'none');
    expect(coach.currentId).toBe('move');

    coach.update(intent({ move: { x: 1, y: 0 } }), []);
    expect(coach.currentId).toBe('aim');
    coach.update(intent({ facing: 0 }), []);
    expect(coach.currentId).toBe('light');
    coach.update(intent(), [event('attack_started', { attack: 'light' })]);
    expect(coach.currentId).toBe('heavy');
    coach.update(intent(), [event('attack_started', { attack: 'heavy' })]);
    expect(coach.prompt).toBe('Tutorial complete');
  });

  it('requires actual defensive outcomes rather than button presses', () => {
    const coach = new TutorialCoach(controlNamesFor('pointer', 'en'), labCopyFor('en'));
    coach.reset(ENCOUNTERS.tutorial_defense, 'none', 'none');

    coach.update(intent({ guardHeld: true, guardPressed: true }), []);
    expect(coach.currentId).toBe('guard');
    coach.update(intent(), [event('guard_success')]);
    expect(coach.currentId).toBe('parry');
    coach.update(intent({ guardPressed: true }), []);
    expect(coach.currentId).toBe('parry');
    coach.update(intent(), [event('parry_success')]);
    expect(coach.currentId).toBe('step');
    coach.update(intent(), [event('step_started')]);
    expect(coach.prompt).toBe('Tutorial complete');
  });

  it('counts three earned parries before teaching the focus button', () => {
    const coach = new TutorialCoach(controlNamesFor('pointer', 'en'), labCopyFor('en'));
    coach.reset(ENCOUNTERS.tutorial_focus, 'none', 'player_focus');

    for (let i = 0; i < 2; i++) coach.update(intent(), [event('parry_success')]);
    expect(coach.currentId).toBe('focus_charge');
    expect(coach.prompt).toContain('(2/3)');
    coach.update(intent(), [event('parry_success')]);
    expect(coach.currentId).toBe('focus_use');
    coach.update(intent({ focusPressed: true }), []);
    expect(coach.currentId).toBe('focus_use');
    coach.update(intent(), [event('slowmo_started', { trigger: 'manual' })]);
    expect(coach.prompt).toBe('Tutorial complete');
  });

  it('shows setup instructions when focus or power is not equipped', () => {
    const lab = labCopyFor('en');
    const coach = new TutorialCoach(controlNamesFor('pointer', 'en'), lab, lab.tutorialSetup);
    coach.reset(ENCOUNTERS.tutorial_focus, 'none', 'none');
    expect(coach.prompt).toContain('player_focus');
    expect(coach.currentId).toBeNull();

    coach.reset(ENCOUNTERS.tutorial_power, 'none', 'none');
    expect(coach.prompt).toContain('Power_*');
    coach.reset(ENCOUNTERS.tutorial_power, 'push', 'none');
    expect(coach.currentId).toBe('power_push');
    coach.controls = controlNamesFor('pointer', 'en');
    expect(coach.prompt).toContain('Q or middle mouse');
    coach.update(intent(), [event('power_used', { power: 'push' })]);
    expect(coach.prompt).toBe('Tutorial complete');
  });


  it('gives the public game no operator instruction, because it has none to give', () => {
    const coach = new TutorialCoach(controlNamesFor('pointer', 'en'), copyFor('en'));

    coach.reset(ENCOUNTERS.tutorial_focus, 'none', 'none');
    expect(coach.prompt).toBeNull();
    expect(coach.currentId).toBeNull();

    coach.reset(ENCOUNTERS.tutorial_power, 'none', 'none');
    expect(coach.prompt).toBeNull();

    coach.reset(ENCOUNTERS.tutorial_power, 'push', 'none');
    expect(coach.currentId).toBe('power_push');
  });
});
