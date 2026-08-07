
import { createWorld } from '../src/sim/encounter';
import { ENCOUNTERS } from '../src/lab/encounters';
import { DEFAULT_COMBAT } from '../src/lab/config';
import {
  courtFurniture,
  furnitureObstacles,
  furnitureOfKind,
  inOpeningCourt,
} from '../src/game/furniture';
import { POWER_STANDS, STAND_RADIUS, armouryObstacles, isArmoury } from '../src/game/armoury';
import { COURT_PILLARS, courtPillarObstacles } from '../src/game/court';
import { HERALD, HERALD_RADIUS, heraldPresent } from '../src/game/herald';
import { ENVOY, envoyPresent } from '../src/game/envoy';
import { MARA, acceptEscort, createEscortState, escortPresent } from '../src/game/escort';

const courtWorld = () => createWorld(ENCOUNTERS.wayfarer_court, DEFAULT_COMBAT, 1);
const elsewhere = () => createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 1);

describe('the four predicates that were one question', () => {
  it('agree with each other and with the room, in both rooms', () => {
    for (const [world, expected] of [
      [courtWorld(), true],
      [elsewhere(), false],
    ] as const) {
      expect(inOpeningCourt(world)).toBe(expected);
      expect(isArmoury(world)).toBe(expected);
      expect(heraldPresent(world)).toBe(expected);
      expect(escortPresent(world)).toBe(expected);
      expect(envoyPresent(world)).toBe(expected);
    }
  });
});

describe('court furniture', () => {
  it('stands nothing up in a room that is not the court', () => {
    expect(courtFurniture(elsewhere(), createEscortState())).toEqual([]);
    expect(furnitureObstacles(courtFurniture(elsewhere(), createEscortState()))).toEqual([]);
  });

  it('is the same collision the two hand-assembled branches produced', () => {
    const world = courtWorld();
    const escort = createEscortState();
    expect(furnitureObstacles(courtFurniture(world, escort))).toEqual([
      ...armouryObstacles(),
      { at: { ...HERALD.at }, radius: HERALD_RADIUS },
      { at: { ...ENVOY.at }, radius: ENVOY.radius },
      ...courtPillarObstacles(),
      { at: { ...MARA.at }, radius: MARA.radius },
    ]);
  });

  it('drops Mara from the floor once she is following, and only her', () => {
    const world = courtWorld();
    const escort = createEscortState();
    expect(acceptEscort(escort, MARA.at), 'she must actually take the offer').toBe(true);
    const after = courtFurniture(world, escort);

    expect(furnitureOfKind(after, 'escort')).toEqual([]);
    expect(furnitureObstacles(after)).toEqual([
      ...armouryObstacles(),
      { at: { ...HERALD.at }, radius: HERALD_RADIUS },
      { at: { ...ENVOY.at }, radius: ENVOY.radius },
      ...courtPillarObstacles(),
    ]);
  });

  it('makes every kind it draws solid, and draws every kind it makes solid', () => {
    const world = courtWorld();
    const following = createEscortState();
    acceptEscort(following, MARA.at);
    for (const escort of [createEscortState(), following]) {
      const furniture = courtFurniture(world, escort);
      const obstacles = furnitureObstacles(furniture);
      expect(obstacles).toHaveLength(furniture.length);
      for (const [index, item] of furniture.entries()) {
        expect(obstacles[index].at, `${item.kind} moved between the two lists`).toEqual(item.at);
        expect(obstacles[index].radius, `${item.kind} resized between the two lists`).toBe(
          item.radius,
        );
      }
    }
  });

  it('carries each plinth with its own stand, so a label cannot land on the wrong footprint', () => {
    const stands = furnitureOfKind(courtFurniture(courtWorld(), createEscortState()), 'power_stand');
    expect(stands.map((item) => item.stand)).toEqual([...POWER_STANDS]);
    for (const item of stands) {
      expect(item.at).toEqual(item.stand.at);
      expect(item.radius).toBe(STAND_RADIUS);
    }
  });

  it('counts the pillars the court authored', () => {
    const pillars = furnitureOfKind(courtFurniture(courtWorld(), createEscortState()), 'court_pillar');
    expect(pillars.map((item) => item.radius)).toEqual(COURT_PILLARS.map((p) => p.radius));
  });

  it('hands the world copies, never the authored positions', () => {
    const furniture = courtFurniture(courtWorld(), createEscortState());
    const obstacles = furnitureObstacles(furniture);
    obstacles[0].at.x = 999;
    expect(POWER_STANDS[0].at.x).not.toBe(999);
    expect(furniture[0].at.x).not.toBe(999);
  });
});
