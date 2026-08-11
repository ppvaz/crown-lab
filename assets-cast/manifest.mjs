
export const UNKNOWN = 'unknown';

export const SERVICE = 'meshy.ai';

export const LICENCE_UNREAD = UNKNOWN;

export const ROLE_ACTIONS = Object.freeze({
  idle: { actionId: 0, action: 'Idle' },
  walk: { actionId: 30, action: 'Casual_Walk' },
  run: { actionId: 16, action: 'RunFast' },
  guard: { actionId: 138, action: 'Block1' },
  stagger: { actionId: 178, action: 'Hit_Reaction' },
  dead: { actionId: 8, action: 'Dead' },
});

export const BODIES = Object.freeze({
  king: {
    castId: 'player',
    brief: 'A king in a white and gold cloak, crowned, carrying a greatsword.',
    briefIsRecord: false,
    service: 'meshy.ai image-to-3d',
    modelVersion: 'meshy-5',
    generationId: '019ff169-7aae-7aea-8c3a-8208508a9f00',
    prompt: 'none — image-to-3d used the recorded reference image',
    generatedAt: '2026-08-11T12:23:22',
    licence: LICENCE_UNREAD,
    kind: 'texture',
    clips: [],
    clipActionIds: UNKNOWN,
    inputImage: '.crown-private/cast-source/king-body-reference.png',
    inputImageSha256: 'e4fec69d5d57e1c9ad2991049f6b484602e1f07f06e21e67f9911fbedfb95f44',
    evidence: 'generation id and model version read from the Meshy task receipt at generation '
      + 'time; generatedAt is that receipt’s UTC finish time converted to repository local time; '
      + 'input image and its exact image-generation prompt are retained under '
      + '.crown-private/cast-source/, and the source image SHA-256 is recorded here',
  },

  guard: {
    castId: 'guard',
    brief: 'Crimson Sentinel — a guard in plate with a halberd and a kite shield.',
    briefIsRecord: false,
    service: SERVICE,
    modelVersion: UNKNOWN,
    generationId: UNKNOWN,
    prompt: UNKNOWN,
    generatedAt: '2026-08-06T21:47:17',
    licence: LICENCE_UNREAD,
    kind: 'texture',
    clips: [],
    clipActionIds: UNKNOWN,
    evidence: 'generatedAt derived from the MMDDHHMMSS field of the source filename recorded in '
      + 'scripts/rig-cast-mesh.mjs; the name "Crimson Sentinel" is the generator’s, not a prompt',
  },

  first_blade: {
    castId: 'first_blade',
    brief: 'Ember Harvester — the king’s mirror, a blade hanging at his side.',
    briefIsRecord: false,
    service: SERVICE,
    modelVersion: UNKNOWN,
    generationId: UNKNOWN,
    prompt: UNKNOWN,
    generatedAt: '2026-08-06T22:46:58',
    licence: LICENCE_UNREAD,
    kind: 'texture',
    clips: [],
    clipActionIds: UNKNOWN,
    evidence: 'generatedAt derived from Meshy_AI_Ember_Harvester_0806224658_texture.blend',
  },

  duelist: {
    castId: 'duelist',
    brief: 'Azure Sentinel, carrying a Sunring Blade delivered as its own mesh.',
    briefIsRecord: false,
    service: SERVICE,
    modelVersion: UNKNOWN,
    generationId: UNKNOWN,
    prompt: UNKNOWN,
    generatedAt: '2026-08-06T23:18:58',
    licence: LICENCE_UNREAD,
    kind: 'texture',
    clips: [],
    clipActionIds: UNKNOWN,
    props: ['Sunring Blade (Meshy_AI_Sunring_Blade_0806231912)'],
    evidence: 'generatedAt derived from Meshy_AI_Azure_Sentinel_0806231858_texture.blend',
  },

  glass_regent: {
    castId: 'glass_regent',
    brief: 'Crystal Warden — a masked regent in a crystal-trimmed cloak, two shards orbiting his '
      + 'hood, a forked staff cradling a third.',
    briefIsRecord: false,
    service: SERVICE,
    modelVersion: UNKNOWN,
    generationId: UNKNOWN,
    prompt: UNKNOWN,
    generatedAt: '2026-08-10T19:18:09',
    licence: LICENCE_UNREAD,
    kind: 'texture',
    clips: [],
    clipActionIds: UNKNOWN,
    roleActions: {
      attackLight: { actionId: 129, action: 'mage_soell_cast' },
      attackHeavy: { actionId: 125, action: 'Charged_Spell_Cast' },
      roar: { actionId: 127, action: 'Charged_Ground_Slam' },
    },
    heightMeters: 1.906,
    evidence: 'generatedAt derived from the MMDDHHMMSS field of '
      + 'Meshy_AI_Crystal_Warden_0810191809_texture.blend; the first source preserved in '
      + '.crown-private/cast-source/ on arrival rather than read from a since-cleared ~/Downloads',
  },

  archer: {
    castId: 'archer',
    brief: 'Moonshadow Archer with a quiver, carrying a wooden bow delivered as its own mesh.',
    briefIsRecord: false,
    service: SERVICE,
    modelVersion: UNKNOWN,
    generationId: UNKNOWN,
    prompt: UNKNOWN,
    generatedAt: '2026-08-06T23:18:49',
    licence: LICENCE_UNREAD,
    kind: 'texture',
    clips: [],
    clipActionIds: UNKNOWN,
    props: ['Wooden Bow (Meshy_AI_Wooden_Bow_0806231838)'],
    evidence: 'generatedAt derived from Meshy_AI_Moonshadow_Archer_0806231849_texture.blend',
  },
});
