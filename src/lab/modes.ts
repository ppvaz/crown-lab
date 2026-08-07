
export interface ModeProfile {
  id: string;
  name: string;
  question: string;
  source: string;
  combatId: string;
  encounterId: string;
  presentationId: string;
  slowMoId: string;
  watchFor: string;
}

export const MODE_PROFILES: Record<string, ModeProfile> = {
  Muralha: {
    id: 'Muralha',
    name: 'A Muralha',
    question: 'Does the player begin to *want* the enemies to attack?',
    source: 'docs/05-EXPERIMENTS.md §2.2',
    combatId: 'Wall',
    encounterId: 'court_45s',
    presentationId: 'Full',
    slowMoId: 'none',
    watchFor:
      'the shift from retreat → wait → react to approach → provoke → parry → execute: ' +
      'distance held from a telegraphing enemy across attempts, and parries taken while ' +
      'advancing versus while retreating',
  },
  Cacada: {
    id: 'Cacada',
    name: 'The Hunt',
    question: 'Does the player begin to cross the room as one continuous phrase?',
    source: 'docs/05-EXPERIMENTS.md §2.3',
    combatId: 'Hunt',
    encounterId: 'siege_10_paced',
    presentationId: 'Full',
    slowMoId: 'none',
    watchFor:
      'whether the room becomes one phrase or one mash: variety of actions between kills, ' +
      'damage taken while advancing, and whether pace comes from correct reads or from speed',
  },
};

export const modeProfile = (id: string): ModeProfile | undefined => MODE_PROFILES[id];

export const MODE_PROFILE_IDS: readonly string[] = Object.keys(MODE_PROFILES);

export interface ModeDials {
  combatId: string;
  encounterId: string;
  presentationId: string;
  slowMoId: string;
}

export const modeDials = (profile: ModeProfile): ModeDials => ({
  combatId: profile.combatId,
  encounterId: profile.encounterId,
  presentationId: profile.presentationId,
  slowMoId: profile.slowMoId,
});

export const modeIdFor = (dials: ModeDials): string | null =>
  MODE_PROFILE_IDS.find((id) => {
    const want = modeDials(MODE_PROFILES[id]);
    return (
      want.combatId === dials.combatId &&
      want.encounterId === dials.encounterId &&
      want.presentationId === dials.presentationId &&
      want.slowMoId === dials.slowMoId
    );
  }) ?? null;

export const modeIdFromSearch = (search: string): string | null => {
  const raw = new URLSearchParams(search).get('mode')?.trim();
  return raw === undefined || raw === '' ? null : raw;
};
