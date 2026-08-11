
export const POSITIVE_IS = Object.freeze({
  swing: 'forward — a limb travels toward the front, a spine bows over its toes',
  spread: 'outward — a limb leaves the midline, a torso leans toward its own left',
  turn: 'toward the body\'s left — a shoulder line or a head rotating anticlockwise seen from above',
  twist: 'clockwise seen from the joint looking down the bone away from the body',
});

export const JOINTS = Object.freeze({
  root: { chain: [['Hips', 1]], translates: true },
  hips: { chain: [['Hips', 1]] },
  spine: { chain: [['Spine02', 0.4], ['Spine01', 0.35], ['Spine', 0.25]] },
  neck: { chain: [['neck', 1]] },
  head: { chain: [['Head', 1]] },

  shoulderL: { chain: [['LeftShoulder', 1]] },
  shoulderR: { chain: [['RightShoulder', 1]] },
  armL: { chain: [['LeftArm', 1]], side: 'left' },
  armR: { chain: [['RightArm', 1]], side: 'right' },
  elbowL: { chain: [['LeftForeArm', 1]], side: 'left', aliases: { bend: ['swing', 1] } },
  elbowR: { chain: [['RightForeArm', 1]], side: 'right', aliases: { bend: ['swing', 1] } },
  wristL: { chain: [['LeftHand', 1]], side: 'left' },
  wristR: { chain: [['RightHand', 1]], side: 'right' },

  legL: { chain: [['LeftUpLeg', 1]], side: 'left' },
  legR: { chain: [['RightUpLeg', 1]], side: 'right' },


  kneeL: { chain: [['LeftLeg', 1]], side: 'left', aliases: { bend: ['swing', -1] } },
  kneeR: { chain: [['RightLeg', 1]], side: 'right', aliases: { bend: ['swing', -1] } },
  ankleL: { chain: [['LeftFoot', 1]], side: 'left' },
  ankleR: { chain: [['RightFoot', 1]], side: 'right' },
  toeL: { chain: [['LeftToeBase', 1]], side: 'left' },
  toeR: { chain: [['RightToeBase', 1]], side: 'right' },
});

export const MIRRORED_TERMS = Object.freeze(['spread', 'turn']);

export const TERMS = Object.freeze(['swing', 'spread', 'turn', 'twist']);

export const TRANSLATIONS = Object.freeze(['push', 'drift', 'lift']);

/**
 * Resolve a pose written in joint terms into per-bone world-axis rotations.
 *
 * Pure, and the reason the vocabulary is testable without Blender: everything rig-specific — what
 * a world axis *is* in a given bone's basis — happens on the other side of the JSON, in
 * `cast_clips.py`. What happens here is the two things a person gets wrong by hand: distributing an
 * angle down a chain, and mirroring a term for the body's right.
 *
 * @param {Record<string, Record<string, number>>} pose joint name to terms
 * @param {number} [amplitude] scales every rotation; see the `amplitude` overlay
 * @returns {{ bones: Record<string, Record<string, number>>, root: Record<string, number> }}
 */
export const resolvePose = (pose, amplitude = 1) => {
  /** @type {Record<string, Record<string, number>>} */
  const bones = {};
  /** @type {Record<string, number>} */
  const root = {};
  for (const [joint, terms] of Object.entries(pose)) {
    const spec = JOINTS[joint];
    if (spec === undefined) throw new Error(`no joint named ${joint}`);
    for (const [rawTerm, rawValue] of Object.entries(terms)) {
      const alias = spec.aliases?.[rawTerm];
      const term = alias === undefined ? rawTerm : alias[0];
      const value = alias === undefined ? rawValue : rawValue * alias[1];
      if (TRANSLATIONS.includes(term)) {
        if (spec.translates !== true) throw new Error(`${joint} does not translate, so ${term} is not a term it has`);
        root[term] = (root[term] ?? 0) + value * amplitude;
        continue;
      }
      if (!TERMS.includes(term)) throw new Error(`${joint} has no term ${term}`);
      const mirrored = spec.side === 'right' && MIRRORED_TERMS.includes(term) ? -1 : 1;
      for (const [bone, weight] of spec.chain) {
        const into = bones[bone] ?? (bones[bone] = {});
        into[term] = (into[term] ?? 0) + value * weight * mirrored * amplitude;
      }
    }
  }
  return { bones, root };
};

export const blendPoses = (...poses) => {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const pose of poses) {
    if (pose === undefined) continue;
    for (const [joint, terms] of Object.entries(pose)) {
      const into = out[joint] ?? (out[joint] = {});
      for (const [term, value] of Object.entries(terms)) into[term] = (into[term] ?? 0) + value;
    }
  }
  return out;
};


export const POSES = Object.freeze({
  stand: {
    spine: { swing: 4 },
    head: { swing: -2 },
    armL: { spread: 5, swing: -2 },
    armR: { spread: 6, swing: -4 },
    elbowL: { bend: 10 },
    elbowR: { bend: 14 },
    kneeL: { bend: 5 },
    kneeR: { bend: 5 },
  },

  breatheIn: {
    root: { lift: 0.008 },
    spine: { swing: -2 },
    shoulderL: { spread: 2 },
    shoulderR: { spread: 2 },
    head: { swing: -1 },
  },

  breatheOut: {
    root: { lift: -0.004 },
    spine: { swing: 1.5 },
    shoulderL: { spread: -1 },
    shoulderR: { spread: -1 },
  },

  ready: {
    hips: { turn: -14 },
    spine: { turn: 10, swing: 6 },
    head: { turn: -8 },
    armR: { swing: -14, spread: 10 },
    elbowR: { bend: 46 },
    armL: { swing: -6, spread: -18 },
    elbowL: { bend: 58 },
    legR: { swing: -10, spread: 6 },
    kneeR: { bend: 14 },
    kneeL: { bend: 8 },
  },

  raiseHigh: {
    hips: { swing: -6, turn: -8 },
    spine: { swing: -16, turn: 8 },
    head: { swing: -14 },
    armR: { swing: 148, spread: 14 },
    elbowR: { bend: 40 },
    armL: { swing: 140, spread: -10 },
    elbowL: { bend: 52 },
    shoulderR: { spread: 12 },
    shoulderL: { spread: 10 },
    legR: { swing: -16 },
    kneeR: { bend: 10 },
  },

  contactLow: {
    root: { push: 0.06, lift: -0.05 },
    hips: { swing: 14, turn: 10 },
    spine: { swing: 26, turn: -8 },
    head: { swing: 14 },
    armR: { swing: 26, spread: 8 },
    elbowR: { bend: 12 },
    armL: { swing: 22, spread: -12 },
    elbowL: { bend: 18 },
    legL: { swing: 18 },
    kneeL: { bend: 26 },
    legR: { swing: -22 },
    kneeR: { bend: 34 },
    ankleR: { swing: 16 },
  },

  settleLow: {
    root: { push: 0.03, lift: -0.02 },
    hips: { swing: 8, turn: 4 },
    spine: { swing: 15, turn: -2 },
    head: { swing: 6 },
    armR: { swing: 6, spread: 12 },
    elbowR: { bend: 34 },
    armL: { swing: 4, spread: -8 },
    elbowL: { bend: 40 },
    legL: { swing: 10 },
    kneeL: { bend: 18 },
    kneeR: { bend: 20 },
  },

  raiseCross: {
    hips: { turn: -18 },
    spine: { turn: 20, swing: -6, spread: -8 },
    head: { turn: -10 },
    armR: { swing: 96, spread: -28 },
    elbowR: { bend: 62 },
    armL: { swing: 84, spread: -34 },
    elbowL: { bend: 70 },
    shoulderR: { spread: 8 },
    kneeR: { bend: 12 },
  },

  contactCross: {
    root: { push: 0.035 },
    hips: { swing: 8, turn: 14 },
    spine: { swing: 16, turn: -18, spread: 6 },
    head: { swing: 8, turn: 8 },
    armR: { swing: 24, spread: 26 },
    elbowR: { bend: 16 },
    armL: { swing: 20, spread: 6 },
    elbowL: { bend: 26 },
    legL: { swing: 12 },
    kneeL: { bend: 20 },
    kneeR: { bend: 22 },
  },

  guardHigh: {
    hips: { turn: -8 },
    spine: { swing: 10, turn: 6 },
    head: { swing: 4 },
    shoulderR: { spread: 16, swing: 10 },
    shoulderL: { spread: 14, swing: 12 },
    armR: { swing: 64, spread: -16 },
    elbowR: { bend: 78 },
    armL: { swing: 72, spread: -24 },
    elbowL: { bend: 86 },
    legR: { swing: -8 },
    kneeR: { bend: 16 },
    kneeL: { bend: 12 },
  },

  parryBeat: {
    hips: { turn: 6 },
    spine: { turn: -18, swing: 6 },
    head: { turn: -6 },
    shoulderR: { swing: 16 },
    armR: { swing: 58, spread: 12 },
    elbowR: { bend: 62 },
    armL: { swing: 66, spread: -6 },
    elbowL: { bend: 74 },
    wristR: { twist: -30 },
  },

  recoil: {
    root: { push: -0.05, lift: -0.02 },
    hips: { swing: -8, turn: 8 },
    spine: { swing: -20, turn: -10, spread: 10 },
    head: { swing: -18, turn: -8 },
    shoulderR: { spread: 10 },
    armR: { swing: -26, spread: 24 },
    elbowR: { bend: 30 },
    armL: { swing: -20, spread: 20 },
    elbowL: { bend: 26 },
    kneeL: { bend: 18 },
    kneeR: { bend: 14 },
  },

  buckle: {
    root: { lift: -0.32, push: -0.04 },
    hips: { swing: 22 },
    spine: { swing: 30, turn: -12 },
    head: { swing: 20 },
    armR: { swing: -14, spread: 22 },
    elbowR: { bend: 40 },
    armL: { swing: -10, spread: 20 },
    elbowL: { bend: 36 },
    legL: { swing: 40 },
    kneeL: { bend: 86 },
    legR: { swing: 30 },
    kneeR: { bend: 78 },
  },

  down: {
    root: { lift: -0.78, push: -0.12 },
    hips: { swing: 62, spread: 24 },
    spine: { swing: 34, turn: -18, spread: 12 },
    head: { swing: -12, turn: -14 },
    armR: { swing: -34, spread: 44 },
    elbowR: { bend: 24 },
    armL: { swing: -28, spread: 40 },
    elbowL: { bend: 20 },
    legL: { swing: 52, spread: 18 },
    kneeL: { bend: 62 },
    legR: { swing: 40, spread: 22 },
    kneeR: { bend: 54 },
  },

  roarOpen: {
    root: { lift: 0.04 },
    hips: { swing: -10 },
    spine: { swing: -26 },
    head: { swing: -30 },
    shoulderL: { spread: 20, swing: -14 },
    shoulderR: { spread: 20, swing: -14 },
    armL: { swing: -40, spread: 46 },
    armR: { swing: -44, spread: 48 },
    elbowL: { bend: 34 },
    elbowR: { bend: 30 },
    kneeL: { bend: 10 },
    kneeR: { bend: 10 },
  },

  roarGather: {
    root: { lift: -0.06 },
    hips: { swing: 10 },
    spine: { swing: 18 },
    head: { swing: 12 },
    shoulderL: { swing: 14 },
    shoulderR: { swing: 14 },
    armL: { swing: 16, spread: -10 },
    armR: { swing: 14, spread: -12 },
    elbowL: { bend: 34 },
    elbowR: { bend: 58 },
    kneeL: { bend: 22 },
    kneeR: { bend: 22 },
  },

  powerGather: {
    root: { lift: -0.025 },
    hips: { turn: -5 },
    spine: { swing: 10, turn: 7 },
    head: { swing: 5, turn: -5 },
    shoulderL: { swing: 12, spread: 4 },
    armL: { swing: 72, spread: 6 },
    elbowL: { bend: 54 },
    armR: { swing: -22, spread: 4 },
    elbowR: { bend: 18 },
    kneeL: { bend: 8 },
    kneeR: { bend: 8 },
  },

  powerCast: {
    root: { lift: 0.015 },
    hips: { turn: -8 },
    spine: { swing: -8, turn: 10, spread: -3 },
    head: { swing: -10, turn: -7 },
    shoulderL: { swing: 20, spread: 5 },
    armL: { swing: 126, spread: 6 },
    elbowL: { bend: 12 },
    armR: { swing: -28, spread: 4 },
    elbowR: { bend: 16 },
    kneeL: { bend: 6 },
    kneeR: { bend: 8 },
  },

});


/**
 * One half of a stride, as a function so the other half is the same authored motion with the legs
 * exchanged rather than a second set of numbers.
 *
 * **The rig is not symmetric and this does not assume it is.** `RightFoot` is 29.3 armature units
 * against `LeftFoot`'s 11.0 on the donor, so a pose mirrored by negating a sign does not produce a
 * mirrored *body*. What is mirrored here is the authored intent — which leg is forward — and the
 * conversion into each bone's own basis then happens per bone, against that bone's real rest. The
 * asymmetry that survives is the rig's, and `cast:clips` reports it rather than hiding it.
 *
 * @param {'L'|'R'} lead the leg that is forward at this key
 * @param {number} reach degrees of hip swing at full stride
 * @param {number} lift how far the body rises over the planted leg, in metres
 */
export const stride = (lead, reach, lift) => {
  const trail = lead === 'L' ? 'R' : 'L';
  return {
    root: { lift },
    hips: { turn: lead === 'L' ? -5 : 5 },
    spine: { swing: 6, turn: lead === 'L' ? 4 : -4 },
    [`leg${lead}`]: { swing: reach },
    [`knee${lead}`]: { bend: reach * 0.35 },
    [`ankle${lead}`]: { swing: -reach * 0.25 },
    [`leg${trail}`]: { swing: -reach * 0.8 },
    [`knee${trail}`]: { bend: reach * 0.5 },
    [`ankle${trail}`]: { swing: reach * 0.4 },
    [`arm${trail}`]: { swing: reach * 0.45, spread: 4 },
    [`arm${lead}`]: { swing: -reach * 0.3, spread: 6 },
    [`elbow${trail}`]: { bend: 14 },
    [`elbow${lead}`]: { bend: 22 },
  };
};

/**
 * The moment between two contacts: one leg carries the body, the other is off the ground.
 *
 * **The swinging leg has to actually leave the floor, and the first draft of this bent both knees
 * equally and lifted neither.** Nothing about it looked wrong — every frame is a plausible pose of
 * a person mid-step — and `cast:clips`' `footSkate` is what said so, because a foot that never
 * leaves the ground spends the whole swing phase travelling forward while in contact with it. That
 * is the definition of skating, and it is the one locomotion defect a contact sheet cannot show.
 *
 * The lift is knee flexion plus a little hip flexion, which is how a leg clears the ground; raising
 * the root instead would lift the *planted* foot too and buy nothing.
 *
 * @param {'L'|'R'} swinging the leg that is off the ground
 * @param {number} lift how far the body rises over the planted leg, in metres
 * @param {number} clear degrees of knee flexion on the swinging leg
 */
export const pass = (swinging, lift, clear = 52) => {
  const planted = swinging === 'L' ? 'R' : 'L';
  return {
    root: { lift },
    spine: { swing: 5 },
    [`leg${swinging}`]: { swing: 14 },
    [`knee${swinging}`]: { bend: clear },
    [`ankle${swinging}`]: { swing: -10 },
    [`knee${planted}`]: { bend: 8 },
    [`elbow${swinging}`]: { bend: 18 },
    [`elbow${planted}`]: { bend: 14 },
  };
};


export const CLIPS = Object.freeze({
  idle: {
    seconds: 3.2,
    loop: true,
    keys: [
      { at: 0, pose: ['stand', 'breatheOut'], plant: ['L', 'R'] },
      { at: 0.42, pose: ['stand', 'breatheIn'], plant: ['L', 'R'] },
      { at: 0.68, pose: ['stand', 'breatheIn'], plant: ['L', 'R'] },
      { at: 1, pose: ['stand', 'breatheOut'], plant: ['L', 'R'] },
    ],
  },

  walk: {
    seconds: 1.0,
    loop: true,
    gait: true,
    keys: [
      { at: 0, pose: stride('L', 24, 0), plant: ['L', 'R'] },
      { at: 0.25, pose: pass('R', 0.022), plant: ['L'] },
      { at: 0.5, pose: stride('R', 24, 0), plant: ['L', 'R'] },
      { at: 0.75, pose: pass('L', 0.022), plant: ['R'] },
      { at: 1, pose: stride('L', 24, 0), plant: ['L', 'R'] },
    ],
  },

  run: {
    seconds: 0.62,
    loop: true,
    gait: true,
    keys: [
      { at: 0, pose: stride('L', 44, 0.01), plant: ['L'] },
      { at: 0.25, pose: pass('R', 0.075, 78) },
      { at: 0.5, pose: stride('R', 44, 0.01), plant: ['R'] },
      { at: 0.75, pose: pass('L', 0.075, 78) },
      { at: 1, pose: stride('L', 44, 0.01), plant: ['L'] },
    ],
  },

  step: {
    seconds: 0.42,
    gait: true,
    keys: [
      { at: 0, pose: 'stand', plant: ['L', 'R'] },
      { at: 0.28, pose: [{ root: { lift: -0.03 }, kneeL: { bend: 26 }, kneeR: { bend: 22 }, spine: { swing: 8 } }], plant: ['L', 'R'] },
      { at: 0.55, pose: pass('L', 0.03, 46), plant: ['R'] },
      { at: 0.78, pose: [stride('L', 30, 0.02), { spine: { swing: 4 } }], plant: ['L', 'R'] },
      { at: 1, pose: 'stand', plant: ['L', 'R'] },
    ],
  },

  power: {
    seconds: 0.5,
    keys: [
      { at: 0, pose: 'stand' },
      { at: 0.36, pose: 'powerGather' },
      { at: 0.78, pose: 'powerCast', ease: 'linear' },
      { at: 1, pose: 'powerCast' },
    ],
  },

  attackLight: {
    seconds: 0.9,
    phases: { contact: 0.52, settle: 0.7 },
    keys: [
      { at: 0, pose: 'ready' },
      { at: 0.34, pose: 'raiseCross' },
      { at: 0.52, pose: 'contactCross', ease: 'linear' },
      { at: 0.7, pose: 'settleLow' },
      { at: 1, pose: 'ready' },
    ],
  },

  attackHeavy: {
    seconds: 1.25,
    phases: { contact: 0.52, settle: 0.7 },
    keys: [
      { at: 0, pose: 'ready' },
      { at: 0.36, pose: 'raiseHigh' },
      { at: 0.52, pose: 'contactLow', ease: 'linear' },
      { at: 0.7, pose: 'settleLow' },
      { at: 1, pose: 'ready' },
    ],
  },

  guard: {
    seconds: 0.34,
    keys: [
      { at: 0, pose: 'stand' },
      { at: 0.55, pose: ['guardHigh', { shoulderL: { spread: 4 }, shoulderR: { spread: 4 } }] },
      { at: 1, pose: 'guardHigh' },
    ],
  },

  parry: {
    seconds: 0.4,
    keys: [
      { at: 0, pose: 'guardHigh' },
      { at: 0.3, pose: 'parryBeat', ease: 'linear' },
      { at: 0.62, pose: ['guardHigh', { spine: { turn: -6 } }] },
      { at: 1, pose: 'guardHigh' },
    ],
  },

  stagger: {
    seconds: 0.5,
    keys: [
      { at: 0, pose: 'stand' },
      { at: 0.22, pose: 'recoil', ease: 'linear' },
      { at: 0.55, pose: ['recoil', { spine: { swing: 12 }, head: { swing: 10 } }] },
      { at: 1, pose: 'stand' },
    ],
  },

  dead: {
    seconds: 1.1,
    keys: [
      { at: 0, pose: 'recoil' },
      { at: 0.3, pose: 'buckle' },
      { at: 0.72, pose: 'down' },
      { at: 1, pose: ['down', { spine: { swing: -3 } }] },
    ],
  },

  roar: {
    seconds: 1.6,
    keys: [
      { at: 0, pose: 'stand' },
      { at: 0.24, pose: 'roarGather' },
      { at: 0.44, pose: 'roarOpen', ease: 'linear' },
      { at: 0.78, pose: ['roarOpen', { spine: { swing: 6 }, head: { swing: 8 } }] },
      { at: 1, pose: 'stand' },
    ],
  },
});

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Flatten a clip's keys into resolved per-bone rotations, ready for the tool.
 *
 * A key's `pose` may be a name, an inline term map, or a list of either — a list blends, so
 * `['stand', 'breatheIn']` is the standing body at the top of its breath and neither pose has to
 * know about the other.
 *
 * @param {object} clip an entry of `CLIPS`
 * @param {{
 *   stance?: Record<string, Record<string, number>>,
 *   amplitude?: number,
 *   beat?: (at: number) => number,
 *   tempo?: number,
 * }} [overlay]
 */
export const resolveClip = (clip, overlay = {}) => {
  const { stance, amplitude = 1, beat, tempo = 1 } = overlay;
  const named = (entry) => {
    if (typeof entry !== 'string') return entry;
    const pose = POSES[entry];
    if (pose === undefined) throw new Error(`no pose named ${entry}`);
    return pose;
  };
  return {
    seconds: clip.seconds / tempo,
    loop: clip.loop === true,
    gait: clip.gait === true,

    phases: clip.phases === undefined || beat === undefined
      ? clip.phases
      : { contact: round3(beat(clip.phases.contact)), settle: round3(beat(clip.phases.settle)) },
    keys: clip.keys.map((key) => {
      const parts = (Array.isArray(key.pose) ? key.pose : [key.pose]).map(named);
      const at = beat === undefined ? key.at : beat(key.at);
      if (at < 0 || at > 1) throw new Error(`a beat put a key at ${at}, outside the clip`);
      return {
        at,
        ease: key.ease ?? 'smooth',
        ...(key.plant === undefined ? {} : { plant: key.plant }),
        ...resolvePose(blendPoses(stance, ...parts), amplitude),
      };
    }),
  };
};

export const AUTHORED_ROLES = Object.freeze(Object.keys(CLIPS));
