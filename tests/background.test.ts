import { encounterBackgroundFor } from '../src/render/background';

describe('encounter background routing', () => {
  it('isolates the distant keep to Background Encounter', () => {
    expect(encounterBackgroundFor('background_encounter')).toBe('distant_keep');
    expect(encounterBackgroundFor('kernel_duelist')).toBeNull();
    expect(encounterBackgroundFor('first_blade')).toBeNull();
  });
});
