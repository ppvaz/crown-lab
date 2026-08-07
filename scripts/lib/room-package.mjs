
export const REQUIRED_LAYERS = [
  'backgroundArchitecture',
  'playableFloor',
  'solidProps',
  'foregroundOccluders',
  'lighting',
  'shadow',
  'occlusionMask',
];
export const OPTIONAL_LAYERS = ['depth'];

const problem = (code, message) => ({ code, message, severity: 'error' });
const warning = (code, message) => ({ code, message, severity: 'warning' });

const CLAY_CANNOT_PRODUCE = ['lighting', 'shadow'];
const isClayRender = (manifest) => manifest.provenance?.preset?.engine === 'BLENDER_WORKBENCH';

/**
 * @param {object} manifest the package's own `room-package.json`
 * @param {object} contract the emitted `tools/blender/contracts/<room>.json`
 * @param {Record<string, {width: number, height: number, bytes: number} | null>} found
 *        layer name -> what is on disk, or null when the file is missing
 * @returns {{code: string, message: string}[]} empty when the package is sound
 */
export const validateRoomPackage = (manifest, contract, found) => {
  const problems = [];

  if (manifest.id !== contract.room) {
    problems.push(
      problem('id-mismatch', `manifest id "${manifest.id}" is not the contract's room "${contract.room}"`),
    );
  }

  if (manifest.contractHash !== contract.contentHash) {
    problems.push(
      problem(
        'stale-contract',
        `built against contract ${manifest.contractHash ?? '(none recorded)'}, current is ` +
          `${contract.contentHash} — re-run \`npm run rooms:camera\` and re-render`,
      ),
    );
  }

  if (manifest.widthPx !== contract.raster.widthPx || manifest.heightPx !== contract.raster.heightPx) {
    problems.push(
      problem(
        'raster-mismatch',
        `manifest is ${manifest.widthPx}x${manifest.heightPx}, contract requires ` +
          `${contract.raster.widthPx}x${contract.raster.heightPx}`,
      ),
    );
  }

  const clay = isClayRender(manifest);
  for (const name of REQUIRED_LAYERS) {
    if (manifest.layers?.[name] !== undefined) continue;
    if (clay && CLAY_CANNOT_PRODUCE.includes(name)) {
      problems.push(
        warning(
          'layer-awaiting-materials',
          `\`${name}\` is absent, which a Workbench clay render cannot help — it is the work ` +
            'material authoring owes, not a defect in this package',
        ),
      );
      continue;
    }
    problems.push(problem('layer-undeclared', `manifest does not declare \`${name}\``));
  }

  const declared = Object.keys(manifest.layers ?? {});
  for (const name of declared) {
    if (!REQUIRED_LAYERS.includes(name) && !OPTIONAL_LAYERS.includes(name)) {
      problems.push(problem('layer-unknown', `manifest declares unknown layer \`${name}\``));
    }
    const file = found[name];
    if (file === null || file === undefined) {
      problems.push(problem('layer-missing', `\`${name}\` is declared but not on disk`));
      continue;
    }
    if (file.width !== manifest.widthPx || file.height !== manifest.heightPx) {
      problems.push(
        problem(
          'layer-dimensions',
          `\`${name}\` is ${file.width}x${file.height}, manifest declares ` +
            `${manifest.widthPx}x${manifest.heightPx}`,
        ),
      );
    }
  }

  if (manifest.colorSpace !== 'srgb') {
    problems.push(problem('color-space', `colorSpace is "${manifest.colorSpace}", expected "srgb"`));
  }

  const projection = manifest.projection;
  if (projection === undefined) {
    problems.push(
      problem(
        'projection-undeclared',
        'no projection block — the compositor cannot place a layer without isoX/isoY, the ' +
          'effective scale and the raster origin, and it may not re-derive them',
      ),
    );
  } else {
    const want = {
      isoX: contract.projection.isoX,
      isoY: contract.projection.isoY,
      elevationY: contract.projection.elevationY,
      effectiveScale: contract.raster.effectiveScale,
      origin: contract.raster.origin,
    };
    for (const [key, value] of Object.entries(want)) {
      const mine = projection[key];
      const same =
        typeof value === 'object' && value !== null
          ? JSON.stringify(mine) === JSON.stringify(value)
          : mine === value;
      if (!same) {
        problems.push(
          problem(
            'projection-mismatch',
            `projection.${key} is ${JSON.stringify(mine)}, contract says ${JSON.stringify(value)}`,
          ),
        );
      }
    }
  }

  const SINGLE_CHANNEL_LAYERS = ['occlusionMask'];
  for (const [name, file] of Object.entries(found)) {
    if (!file || typeof file.colorType !== 'number') continue;
    const single = SINGLE_CHANNEL_LAYERS.includes(name);
    if (single && ![0, 4].includes(file.colorType)) {
      problems.push(
        problem(
          'mask-not-single-channel',
          `\`${name}\` is colour type ${file.colorType}; a coverage mask is one channel, and ` +
            'three identical ones are two thirds of a layer carrying no information',
        ),
      );
    }
    if (!single && ![4, 6].includes(file.colorType)) {
      problems.push(
        problem(
          'layer-without-alpha',
          `\`${name}\` is colour type ${file.colorType} and carries no alpha — a layer with no ` +
            'transparency composites as an opaque rectangle over everything beneath it',
        ),
      );
    }
  }
  if (typeof manifest.premultipliedAlpha !== 'boolean') {
    problems.push(
      problem(
        'alpha-convention',
        'premultipliedAlpha is not declared — a straight/premultiplied mismatch is a halo nobody ' +
          'attributes to the right cause',
      ),
    );
  }

  const NON_DEFAULT_BLENDS = { shadow: 'multiply', lighting: 'lighter' };
  for (const [name, required] of Object.entries(NON_DEFAULT_BLENDS)) {
    if (manifest.layers?.[name] === undefined) continue;
    const mode = manifest.composite?.[name];
    const term = required === 'multiply' ? 'multiplicative' : 'additive';
    if (mode === undefined) {
      problems.push(
        problem(
          'composite-undeclared',
          `\`${name}\` declares no composite mode; it carries a ${term} term and reads as ` +
            `${required === 'multiply' ? 'an opaque sheet over the room' : 'a black rectangle'} if drawn normally`,
        ),
      );
      continue;
    }
    if (mode !== required) {
      problems.push(
        problem(
          'composite-wrong',
          `\`${name}\` declares composite "${mode}"; it carries a ${term} term and must be ` +
            `"${required}" — see CONCEPT-ART-FIDELITY-PLAN §5.4`,
        ),
      );
    }
  }

  if (manifest.layers?.shadow !== undefined && manifest.staticLayersUnshadowed !== true) {
    problems.push(
      problem(
        'shadow-double-counted',
        'a `shadow` layer is declared but staticLayersUnshadowed is not true — either the geometry ' +
          'layers kept their shadowing, in which case multiplying darkens the room twice, or the ' +
          'export failed to say that they did not',
      ),
    );
  }

  const draws = manifest.maxDrawsPerFrame;
  if (typeof draws !== 'number') {
    problems.push(problem('draws-undeclared', 'maxDrawsPerFrame is not declared (ADR-024 clause 2)'));
  } else if (draws > contract.budget.maxDrawsPerFrame) {
    problems.push(
      problem(
        'draws-over-budget',
        `declares ${draws} draws/frame, budget is ${contract.budget.maxDrawsPerFrame} (ADR-024)`,
      ),
    );
  }

  const perLayerMb = (manifest.widthPx * manifest.heightPx * 4) / 1_048_576;
  const residentMb = perLayerMb * (typeof draws === 'number' ? draws : 0);
  if (residentMb > contract.budget.decodedMbCeiling * 1.02) {
    problems.push(
      problem(
        'resident-over-budget',
        `${residentMb.toFixed(0)} MB resident after merge against a ` +
          `${contract.budget.decodedMbCeiling.toFixed(0)} MB ceiling`,
      ),
    );
  }

  const peakMb = Object.values(found)
    .filter(Boolean)
    .reduce((sum, f) => sum + (f.width * f.height * 4) / 1_048_576, 0);
  const peakCeiling = contract.budget.decodePeakMbCeiling;
  if (typeof peakCeiling === 'number' && peakMb > peakCeiling * 1.02) {
    problems.push(
      problem(
        'decode-peak-over-budget',
        `${peakMb.toFixed(0)} MB decoded at load against a ${peakCeiling.toFixed(0)} MB ceiling — ` +
          'decode and merge incrementally, or the loading screen is where this fails',
      ),
    );
  }

  if (typeof manifest.collisionVersion !== 'string' || manifest.collisionVersion === '') {
    problems.push(
      problem(
        'collision-version',
        'collisionVersion is not recorded — a re-exported room with stale collision traps the player',
      ),
    );
  }

  return problems;
};
