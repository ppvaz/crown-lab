
/**
 * @typedef {import('./manifest.d.mts').AudioPackManifest} AudioPackManifest
 */

/** @type {Readonly<Record<string, AudioPackManifest>>} */
export const PACKS = {
  forged: {
    id: 'forged',
    description: 'Steel, leather, bell and body.',
    prompts: {
      light: 'a slim steel sword swung fast past the microphone, sharp close air, dry',
      heavy: 'a heavy two-handed steel sword swung hard through air, deep displaced air, close and dry',
      hit: 'a steel blade landing hard on mail over a leather-armoured body, loud sharp crack, close and dry',
      parry:
        'two steel blades struck hard edge to edge, loud bright clash with a fast metal decay, close and dry',
      guard: 'a heavy blow landing on an iron-rimmed oak shield, loud dull boom, close and dry',
      unparryable: 'a great steel maul slammed flat onto a stone floor, loud deep boom with weight, close and dry',
      step: 'one armoured boot planted hard on a stone floor, sharp close scuff of steel and grit, dry',
      stagger: 'a man in mail crashing sideways into a stone wall, loud clattering scrape of metal on stone',
      death: 'a body in steel plate and leather collapsing hard onto a stone floor, loud clatter settling, close',
      player_hurt: 'a heavy blow landing hard on a leather gambeson over ribs, loud dull body thud, close and dry',
      power: 'a tesla coil arcing continuously, deep bass rumble under bright electrical crackle, close and dry',
      power_hit: 'a high voltage circuit shorting, loud sharp electrical crack with a deep thump, close and dry',
      wave: 'many armoured boots stamping hard on a stone floor, close and dry, building',
      slowmo: {
        prompt: 'a heavy bronze bell struck once and left to ring out slowly, dry and close',
        durationSeconds: 2.5,
        durationReason: 'the bell the pack is named for needs room to ring; a texture, not an impact',
      },
    },
  },
  arcane: {
    id: 'arcane',
    description: 'Synthetic material. The wrong-theme control — does the fantasy survive it?',
    prompts: {
      light: 'a short bright synthesizer sweep rising quickly, clean and dry',
      heavy: 'a deep synthesizer bass sweep falling slowly, clean and dry',
      hit: 'a hard digital square wave stab, one short burst, clean and dry',
      parry: 'a bright metallic synthesizer bell struck once, quick decay, clean and dry',
      guard: 'a dull filtered noise thump with a soft attack, clean and dry',
      unparryable: 'a deep synthesized sub bass drop, loud and clean',
      step: 'a short filtered noise tick, clean and dry',
      stagger: 'a stuttering digital glitch burst, clean and dry',
      death: 'a long synthesized bass note falling away to silence, clean',
      player_hurt: 'a harsh distorted synthesizer buzz, one short burst, clean',
      power: 'a rising synthesized arpeggio building quickly, bright and clean',
      power_hit: 'a sharp digital click with a bright metallic tail, clean',
      wave: 'a swelling synthesized drone rising, wide and clean',
      slowmo: {
        prompt: 'a slow synthesized tape-stop glide downward, clean',
        durationSeconds: 2.5,
        durationReason: 'a texture the slowed mix sits under, not an impact',
      },
    },
  },
  impact: {
    id: 'impact',
    description: 'No world. Whatever object actually sounds best doing this.',
    prompts: {
      light: 'a steel sword swung fast past the microphone, sharp close air, dry',
      heavy: 'a sledgehammer hitting a thick hardwood beam, loud deep crack with a low thud, close and dry',
      hit: 'a heavy steel blade chopping into meat on a wooden block, loud wet crack, close and dry',
      parry:
        'two heavy steel blades struck hard edge to edge, loud bright clash with a fast metal decay, close and dry',
      guard: 'a heavy blow landing on a thick oak shield with an iron rim, loud dull boom, close and dry',
      unparryable: 'a heavy iron sledge dropped flat onto a stone slab, loud deep boom with weight, close and dry',
      step: 'one armoured boot stamping down on a stone floor, sharp close scuff, dry',
      stagger: 'a man in armour slamming into a stone wall and scraping down it, close and dry',
      death: 'a body in steel plate falling hard onto a stone floor, loud clatter and settle, close and dry',
      player_hurt: 'a heavy fist landing hard on a padded leather torso, loud dull body thud, close and dry',
      power: 'a tesla coil arcing continuously, deep bass rumble under bright electrical crackle, close and dry',
      power_hit: 'a high voltage circuit shorting, loud sharp electrical crack with a deep thump, close and dry',
      wave: 'many armoured boots stamping hard on a stone floor, close and dry, building',
      slowmo: {
        prompt: 'a long low metallic groan drawn out slowly, dry and close',
        durationSeconds: 2.5,
        durationReason: 'a texture the slowed mix sits under, not an impact',
      },
    },
  },
  tempered: {
    id: 'tempered',
    description: 'Steel, iron, oak and stone, close and loud. The pack with the punch in it.',
    prompts: {
      light: 'a slim steel blade swung fast through air, sharp close cut, dry',
      heavy:
        'a heavy iron maul driven hard into a steel plate, loud deep clang with a low thud under it, close and dry',
      hit: 'a steel blade landing hard on iron plate over leather, loud sharp crack, close and dry',
      parry: 'two steel blades catching hard edge to edge, loud bright ring with a fast decay, close and dry',
      guard: 'a heavy blow caught on an iron-bound shield, loud dull clang into oak and hide, close and dry',
      unparryable:
        'a great iron hammer slammed flat onto a stone floor, loud deep boom with weight, close and dry',
      step: 'one armoured boot planted hard on a stone floor, sharp close scuff of steel and grit',
      stagger:
        'a man in steel plate crashing sideways into a stone wall, loud clattering scrape of metal on stone',
      death: 'a body in full steel plate collapsing hard onto stone, loud clattering crash settling',
      player_hurt:
        'a heavy blow landing hard on steel plate over ribs, loud dull impact with a low thud, close',
      power: 'a great steel blade drawn fast from an iron scabbard, bright rising rasp, close and dry',
      power_hit: 'a steel spike driven hard through an iron plate, loud bright crack, close and dry',
      wave: 'a crowd of armoured boots stamping hard on a stone floor, close and dry, heavy footfalls building',
      slowmo: {
        prompt: 'a heavy steel blade dragged slowly across stone, long drawn rasp, dry and close',
        durationSeconds: 2.5,
        durationReason: 'a texture the slowed mix sits under, not an impact',
      },
    },
  },
  hollow: {
    id: 'hollow',
    description: 'Bone, dry oak, stone and grit. The world with no ring in it.',
    prompts: {
      light: 'a slim dry ash pole swung fast through cold air, close mic',
      heavy: 'a heavy oak beam swung in a wide slow arc, deep displaced air, close mic',
      hit: 'a hardwood staff cracking hard onto a bone breastplate, loud sharp knock, dry and close',
      parry: 'two dense bone blades cracking together edge to edge, one bright report, close mic',
      guard: 'a thick oak and rawhide shield taking a blow, dull layered thud, close mic',
      unparryable: 'a wide stone slab dropped flat onto packed earth, deep dry weight',
      step: 'one boot on dry stone flagstone with grit underfoot, close mic',
      stagger: 'a body stumbling into a stone wall, cloth and grit dragging across stone',
      death: 'a body in bone plate and heavy cloth collapsing onto flagstones, dry clatter settling',
      player_hurt: 'a blunt blow into a padded leather gambeson over ribs, low body thud, close mic',
      power: 'air drawn fast up a long hollow bone pipe, rising breath',
      power_hit: 'a thick bone shard cracking clean in half, one bright snap, close mic',
      wave: 'a crowd of heavy boots stamping on a stone floor, close and dry, footfalls building',
      slowmo: {
        prompt: 'a long stone block dragged slowly across stone, drawn out, dry and gritty',
        durationSeconds: 2.5,
        durationReason: 'a texture the slowed mix sits under, not an impact',
      },
    },
  },
};

/**
 * The bank: one cue, one sound, chosen by ear from any brief.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SELECTION AND NOT A SIXTH FOLDER
 * ---------------------------------------------------------------------------
 * A `MaterialPack` in `render/soundbank.ts` is nothing but a cue→url map; `packUrlsFrom` derives one
 * from a directory, and *that* is the only thing that has ever made a pack a world. Nothing in the
 * runtime cared. So the bank is a per-cue choice over every take on disk, and the freedom asked for
 * — "not limited by material" — is bought here rather than by rewriting the briefs: `parry` may come
 * from the steel brief and `hit` from the no-world one and `step` from wherever it sounded best.
 *
 * `forged` and `arcane` stay exactly as they are. They are ADR-010's controlled pair and re-encoding
 * either would change what every session recorded against them heard.
 *
 * ---------------------------------------------------------------------------
 * IT IS EMPTY BECAUSE ONLY AN EAR CAN FILL IT
 * ---------------------------------------------------------------------------
 * The obvious default is "take the loudest roll of each cue", and it is the wrong one: this
 * endpoint's level is a lottery, so choosing by peak is choosing by luck while producing a table that
 * looks measured. `npm run audio:audition` builds a page of every take, each normalized to -1 dB so
 * the comparison is of sound and not loudness; `npm run audio:bank` writes the ones named here.
 *
 * Each entry is the take's provenance and is the reason this table exists rather than fourteen files
 * appearing in a directory: which brief asked for it, and which roll of that brief answered.
 *
 * Two forms per entry: `{ from, roll }` for a generated take, `{ file: 'path' }` for anything else —
 * a download, a library file, a recording. `audio:audition -- --dir=<folder>` hears a folder of
 * candidates the same way it hears the generated rolls.
 *
 * @type {Readonly<{ id: string, description: string, takes: Readonly<Record<string, { from?: string, roll?: number, file?: string }>> }>}
 */
export const BANK = {
  id: 'bank',
  description: 'One sound per cue, each chosen by ear from whichever brief did it best.',
  takes: {
  },
};
