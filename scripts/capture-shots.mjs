import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { launchChrome, startViteServer, waitForServer } from './lib/harness.mjs';
import { listArg, valueArg } from './lib/args.mjs';

const PORT = 5198;
const BASE = `http://localhost:${PORT}`;
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  laptop: { viewport: { width: 1280, height: 720 } },
  'mobile-landscape': {
    viewport: { width: 984, height: 443 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2.4375,
  },
};
const SHOTS = [
  'weapon-contact',
  'perfect-parry',
  'enemy-weapon-contact',
  'first-blade-entrance',
  'first-blade-room',
  'first-blade-phase-two',
  'first-blade-glide',
  'captain-direct',
  'captain-feint',
  'captain-pressure',
  'captain-release',
  'rain-field',
  'rain-overlap',
  'chancellor-room',
  'chancellor-lightning',
  'queen-regalia',
  'queen-unsworn',
  'queen-last-decree',
  'guard-shield',
  'guard-shield-back',
  'guard-shield-profile',
  'guard-shield-profile-rear',
  'arena-training',
  'mesh-guard',
  'mesh-guard-inspect',
  'arena-duel',
  'arena-crossfire',
  'arena-corner',
  'arena-stairs',
  'arena-rotated-rectangle',
  'herald-room',
  'route-guard-locked',
  'route-guard-open',
  'route-antechamber',
  'shape-gallery',
  'shape-twin-bowls',
  'shape-combat-bowl',
  'shape-cramped-keep',
  'maze-corner',
  'maze-portal-down',
  'maze-followed',
  'generated-chambers',
  'background-encounter',
  'concept-bell-court-empty',
  'concept-bell-court-combat',
  'concept-shattered-dais-empty',
  'concept-shattered-dais-combat',
  'concept-rain-breached-hall-empty',
  'concept-rain-breached-hall-combat',
  'concept-parallax-gallery-empty',
  'concept-parallax-gallery-combat',
  'concept-prop-gallery-empty',
  'concept-prop-gallery-combat',
  'concept-prop-gallery-solids',
  'concept-prop-gallery-flush',
  'concept-kit-gallery-empty',
  'concept-kit-gallery-combat',
  'concept-kit-gallery-desaturated',
  'concept-kit-gallery-floors',
  'concept-kit-gallery-walls',
  'concept-kit-gallery-windows',
  'concept-kit-gallery-details',
  'concept-clutter-gallery-empty',
  'concept-clutter-gallery-combat',
  'concept-clutter-gallery-desaturated',
  'concept-clutter-gallery-loyalty',
  'concept-clutter-gallery-absence',
  'concept-clutter-gallery-siege',
  'concept-clutter-gallery-service',
  'concept-lantern-cloister-empty',
  'concept-lantern-cloister-combat',
  'concept-lantern-cloister-desaturated',
  'concept-lantern-cloister-baked',
  'concept-lantern-cloister-live',
  'concept-lantern-cloister-storm',
  'concept-oath-gallery-empty',
  'concept-oath-gallery-combat',
  'concept-oath-gallery-desaturated',
  'concept-bell-court-desaturated',
  'concept-guard-procession-empty',
  'concept-guard-procession-combat',
  'concept-guard-procession-desaturated',
  'concept-violet-chancellery-empty',
  'concept-violet-chancellery-combat',
  'concept-violet-chancellery-desaturated',
  'concept-shattered-dais-desaturated',
  'concept-rookery-roofs-empty',
  'concept-rookery-roofs-combat',
  'concept-rookery-roofs-desaturated',
  'concept-chainbridge-court-empty',
  'concept-chainbridge-court-combat',
  'concept-chainbridge-court-desaturated',
  'concept-flooded-nave-empty',
  'concept-flooded-nave-combat',
  'concept-flooded-nave-desaturated',
  'concept-bell-foundry-empty',
  'concept-bell-foundry-combat',
  'concept-bell-foundry-desaturated',
  'concept-archive-spiral-empty',
  'concept-archive-spiral-combat',
  'concept-archive-spiral-desaturated',
  'concept-hollow-throne-empty',
  'concept-hollow-throne-combat',
  'concept-hollow-throne-desaturated',
];
const SHOT_ENCOUNTERS = {
  'weapon-contact': 'kernel_guard',
  'perfect-parry': 'kernel_guard',
  'enemy-weapon-contact': 'kernel_guard',
  'first-blade-entrance': 'first_blade',
  'first-blade-room': 'first_blade',
  'first-blade-phase-two': 'first_blade',
  'first-blade-glide': 'first_blade',
  'captain-direct': 'captain',
  'captain-feint': 'captain',
  'captain-pressure': 'captain',
  'captain-release': 'captain',
  'rain-field': 'projectile_rain_boss',
  'rain-overlap': 'projectile_rain_boss',
  'chancellor-room': 'chancellor',
  'chancellor-lightning': 'chancellor',
  'queen-regalia': 'queen',
  'queen-unsworn': 'queen',
  'queen-last-decree': 'queen',
  'guard-shield': 'kernel_guard',
  'guard-shield-back': 'kernel_guard',
  'guard-shield-profile': 'kernel_guard',
  'guard-shield-profile-rear': 'kernel_guard',
  'arena-training': 'kernel_guard',
  'mesh-guard': 'mesh_guard',
  'mesh-guard-inspect': 'mesh_guard',
  'arena-duel': 'kernel_duelist',
  'arena-crossfire': 'court_45s',
  'arena-corner': 'overlap_court',
  'arena-stairs': 'siege_10',
  'arena-rotated-rectangle': 'rotated_rectangle',
  'herald-room': 'wayfarer_court',
  'route-guard-locked': 'kernel_guard',
  'route-guard-open': 'kernel_guard',
  'route-antechamber': 'upper_hall',
  'shape-gallery': 'shape_gallery',
  'shape-twin-bowls': 'shape_twin_bowls',
  'shape-combat-bowl': 'shape_combat_bowl',
  'shape-cramped-keep': 'shape_cramped_keep',
  'maze-corner': 'maze_serpentine',
  'maze-portal-down': 'maze_serpentine',
  'maze-followed': 'maze_serpentine',
  'generated-chambers': 'generated_chambers',
  'background-encounter': 'background_encounter',
  'concept-bell-court-empty': 'concept_bell_court',
  'concept-bell-court-combat': 'concept_bell_court',
  'concept-shattered-dais-empty': 'concept_shattered_dais',
  'concept-shattered-dais-combat': 'concept_shattered_dais',
  'concept-rain-breached-hall-empty': 'concept_rain_breached_hall',
  'concept-rain-breached-hall-combat': 'concept_rain_breached_hall',
  'concept-parallax-gallery-empty': 'concept_parallax_gallery',
  'concept-parallax-gallery-combat': 'concept_parallax_gallery',
  'concept-prop-gallery-empty': 'concept_prop_gallery',
  'concept-prop-gallery-combat': 'concept_prop_gallery',
  'concept-prop-gallery-solids': 'concept_prop_gallery',
  'concept-prop-gallery-flush': 'concept_prop_gallery',
  'concept-kit-gallery-empty': 'concept_kit_gallery',
  'concept-kit-gallery-combat': 'concept_kit_gallery',
  'concept-kit-gallery-desaturated': 'concept_kit_gallery',
  'concept-kit-gallery-floors': 'concept_kit_gallery',
  'concept-kit-gallery-walls': 'concept_kit_gallery',
  'concept-kit-gallery-windows': 'concept_kit_gallery',
  'concept-kit-gallery-details': 'concept_kit_gallery',
  'concept-clutter-gallery-empty': 'concept_clutter_gallery',
  'concept-clutter-gallery-combat': 'concept_clutter_gallery',
  'concept-clutter-gallery-desaturated': 'concept_clutter_gallery',
  'concept-clutter-gallery-loyalty': 'concept_clutter_gallery',
  'concept-clutter-gallery-absence': 'concept_clutter_gallery',
  'concept-clutter-gallery-siege': 'concept_clutter_gallery',
  'concept-clutter-gallery-service': 'concept_clutter_gallery',
  'concept-lantern-cloister-empty': 'concept_lantern_cloister',
  'concept-lantern-cloister-combat': 'concept_lantern_cloister',
  'concept-lantern-cloister-desaturated': 'concept_lantern_cloister',
  'concept-lantern-cloister-baked': 'concept_lantern_cloister_baked',
  'concept-lantern-cloister-live': 'concept_lantern_cloister_live',
  'concept-lantern-cloister-storm': 'concept_lantern_cloister_live',
  'concept-oath-gallery-empty': 'concept_oath_gallery',
  'concept-oath-gallery-combat': 'concept_oath_gallery',
  'concept-oath-gallery-desaturated': 'concept_oath_gallery',
  'concept-bell-court-desaturated': 'concept_bell_court',
  'concept-guard-procession-empty': 'concept_guard_procession',
  'concept-guard-procession-combat': 'concept_guard_procession',
  'concept-guard-procession-desaturated': 'concept_guard_procession',
  'concept-violet-chancellery-empty': 'concept_violet_chancellery',
  'concept-violet-chancellery-combat': 'concept_violet_chancellery',
  'concept-violet-chancellery-desaturated': 'concept_violet_chancellery',
  'concept-shattered-dais-desaturated': 'concept_shattered_dais',
  'concept-rookery-roofs-empty': 'concept_rookery_roofs',
  'concept-rookery-roofs-combat': 'concept_rookery_roofs',
  'concept-rookery-roofs-desaturated': 'concept_rookery_roofs',
  'concept-chainbridge-court-empty': 'concept_chainbridge_court',
  'concept-chainbridge-court-combat': 'concept_chainbridge_court',
  'concept-chainbridge-court-desaturated': 'concept_chainbridge_court',
  'concept-flooded-nave-empty': 'concept_flooded_nave',
  'concept-flooded-nave-combat': 'concept_flooded_nave',
  'concept-flooded-nave-desaturated': 'concept_flooded_nave',
  'concept-bell-foundry-empty': 'concept_bell_foundry',
  'concept-bell-foundry-combat': 'concept_bell_foundry',
  'concept-bell-foundry-desaturated': 'concept_bell_foundry',
  'concept-archive-spiral-empty': 'concept_archive_spiral',
  'concept-archive-spiral-combat': 'concept_archive_spiral',
  'concept-archive-spiral-desaturated': 'concept_archive_spiral',
  'concept-hollow-throne-empty': 'concept_hollow_throne',
  'concept-hollow-throne-combat': 'concept_hollow_throne',
  'concept-hollow-throne-desaturated': 'concept_hollow_throne',
};


const shots = listArg('shots', SHOTS);
const viewports = listArg('viewports', Object.keys(VIEWPORTS));
const outputRoot = valueArg('output', 'captures');
const cast = valueArg('cast', '');
const { proc: server, state: serverState } = startViteServer({ port: PORT });

try {
  await waitForServer(BASE, serverState);
  const browser = await launchChrome();
  const failures = [];

  for (const viewportName of viewports) {
    const contextOptions = VIEWPORTS[viewportName];
    if (!contextOptions) {
      failures.push(`unknown viewport: ${viewportName}`);
      continue;
    }
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error(`Browser: ${error.message}`));
    const directory = `${outputRoot}/${viewportName}`;
    await mkdir(directory, { recursive: true });

    for (const shot of shots) {
      const label = `${viewportName}/${shot}`;
      try {
        const search = new URLSearchParams({ capture: shot });
        if (cast) search.set('cast', cast);
        await page.goto(`${BASE}/?${search}`);
        await page.waitForSelector(
          `html[data-capture-ready="true"][data-capture-shot="${shot}"]`,
          { timeout: 30_000 },
        );
        const state = await page.evaluate(() => ({
          encounter: document.documentElement.dataset.captureEncounter,
          tick: document.documentElement.dataset.captureTick,
        }));
        const expectedEncounter = SHOT_ENCOUNTERS[shot];
        if (state.encounter !== expectedEncounter) {
          throw new Error(`expected ${expectedEncounter ?? 'known shot'}, got ${state.encounter ?? 'unknown'}`);
        }
        const path = `${directory}/${shot}.png`;
        const first = await page.screenshot();
        const repeated = await page.screenshot();
        if (!first.equals(repeated)) {
          throw new Error('repeated frozen screenshots were not byte-identical');
        }
        await writeFile(path, first);
        console.log(`✓ ${label} tick=${state.tick} → ${path}`);
      } catch (error) {
        failures.push(label);
        console.error(`✖ ${label}: ${error.message.split('\n')[0]}`);
      }
    }
    await context.close();
  }

  await browser.close();
  if (failures.length > 0) {
    console.error(`\n${failures.length} capture(s) failed.`);
    process.exitCode = 1;
  }
} finally {
  server.kill();
}
