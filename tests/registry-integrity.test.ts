
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CAST_ASSET_DIR, CAST_ASSET_ROUTE } from '../vite.config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { CAST_MESHES } from '../src/render/cast-meshes-lab';
import { KING_MESH, LAB_ROOM_MESHES } from '../src/render/asset-registry-lab';
import { LAB_ROOM_DECLARATIONS } from '../src/render/rooms/index-lab';
import { THREAT_COST } from '../src/lab/threat-budget';
import { HERALD } from '../src/game/herald';
import { heraldOffersIn } from '../src/app/route-run';
import { FIRST_CROWN, ROUTES, routeDestination } from '../src/game/route';
import { PALETTE, publicArchetypeColor } from '../src/render/palette';
import { labArchetypeColor } from '../src/render/palette-lab';
import type { EnemyArchetype } from '../src/sim/types';

const ARCHETYPES = Object.keys(THREAT_COST) as EnemyArchetype[];

describe('labArchetypeColor', () => {
  it('covers every archetype in the union', () => {
    for (const archetype of ARCHETYPES) {
      expect(() => labArchetypeColor(archetype)).not.toThrow();
    }
    expect(ARCHETYPES.length).toBeGreaterThan(0);
  });

  it('returns a hex colour for every archetype', () => {
    for (const archetype of ARCHETYPES) {
      expect(labArchetypeColor(archetype)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('gives no enemy the king’s accent', () => {
    for (const archetype of ARCHETYPES) {
      expect(labArchetypeColor(archetype)).not.toBe(PALETTE.playerAccent);
    }
  });

  it('agrees with the public palette on the announced bodies', () => {
    const announced: EnemyArchetype[] = [
      'guard',
      'duelist',
      'archer',
      'first_blade',
      'queen',
      'glass_regent',
      'thorn_marshal',
    ];
    for (const archetype of announced) {
      expect(labArchetypeColor(archetype)).toBe(publicArchetypeColor(archetype));
    }
  });

  it('draws the mesh guard in the guard’s own colour', () => {
    expect(labArchetypeColor('mesh_guard')).toBe(labArchetypeColor('guard'));
  });

  it('draws the read Captain in the Captain’s colour', () => {
    expect(labArchetypeColor('captain_read')).toBe(labArchetypeColor('captain'));
  });
});

describe('the herald’s offers resolve, in the registry where everything exists', () => {
  const rides = HERALD.offers.filter((offer) => offer.to !== null);

  it('names a route node that exists, for every offer', () => {
    for (const offer of rides) {
      expect(
        routeDestination(FIRST_CROWN, offer.to as string),
        `${offer.label} -> route node '${offer.to}'`,
      ).not.toBeNull();
    }
  });

  it('lands on an encounter that exists, for every offer', () => {
    for (const offer of rides) {
      const node = routeDestination(FIRST_CROWN, offer.to as string);
      if (node === null) continue;
      expect(
        ENCOUNTERS[node.encounterId],
        `${offer.label} -> node '${node.id}' -> encounter '${node.encounterId}'`,
      ).toBeDefined();
    }
  });

  it('drops none of them on the way to the panel', () => {
    const offers = heraldOffersIn(ENCOUNTERS, 'LEAVE');
    expect(offers.map((offer) => offer.label)).toEqual([
      ...rides.map((offer) => offer.label),
      'LEAVE',
    ]);
  });
});

describe('every route points at encounters that exist', () => {
  it('resolves every node in every registered route', () => {
    const routeIds = Object.keys(ROUTES);
    expect(routeIds.length).toBeGreaterThan(0);
    for (const routeId of routeIds) {
      for (const node of ROUTES[routeId].nodes) {
        expect(
          ENCOUNTERS[node.encounterId],
          `${routeId} / ${node.id} -> '${node.encounterId}'`,
        ).toBeDefined();
      }
    }
  });
});

describe('the cast’s route strings resolve to files that exist', () => {
  const onDisk = (route: string): string =>
    resolve(
      import.meta.dirname,
      '..',
      CAST_ASSET_DIR,
      route.slice(CAST_ASSET_ROUTE.length).replace(/^\/+/, ''),
    );

  it('serves every baked body the lab can select', () => {
    const ids = Object.keys(CAST_MESHES) as Array<keyof typeof CAST_MESHES>;
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const { glb } = CAST_MESHES[id];
      const file = onDisk(glb);
      expect(existsSync(file) && statSync(file).isFile(), `${id} -> ${glb}`).toBe(true);
    }
  });

  it('states them as routes rather than as bundler imports', () => {
    for (const id of Object.keys(CAST_MESHES) as Array<keyof typeof CAST_MESHES>) {
      const { glb } = CAST_MESHES[id];
      expect(glb.startsWith(`${CAST_ASSET_ROUTE}/`), `${id} -> ${glb}`).toBe(true);
      expect(glb, `${id} must not be a resolved URL`).not.toMatch(/^[a-z]+:/i);
    }
  });

  it('agrees with itself about the king', () => {
    expect(KING_MESH.glb).toBe(CAST_MESHES.player.glb);
  });
});

describe('every baked room is keyed to an encounter that exists', () => {
  it('resolves every key in the room-mesh registry', () => {
    const keys = Object.keys(LAB_ROOM_MESHES);
    expect(keys.length).toBeGreaterThan(0);
    for (const encounterId of keys) {
      expect(ENCOUNTERS[encounterId], `room mesh -> encounter '${encounterId}'`).toBeDefined();
    }
  });
});

describe('the lab room registry claims no encounter that is missing', () => {
  it('dresses only encounters that exist', () => {
    expect(LAB_ROOM_DECLARATIONS.themed.length).toBeGreaterThan(0);
    for (const encounterId of LAB_ROOM_DECLARATIONS.themed) {
      expect(ENCOUNTERS[encounterId], `THEME_BY_ENCOUNTER -> '${encounterId}'`).toBeDefined();
    }
  });

  it('lights only encounters that exist', () => {
    expect(LAB_ROOM_DECLARATIONS.lit.length).toBeGreaterThan(0);
    for (const encounterId of LAB_ROOM_DECLARATIONS.lit) {
      expect(ENCOUNTERS[encounterId], `AMBIENCE -> '${encounterId}'`).toBeDefined();
    }
  });
});
