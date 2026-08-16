import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const profile = arg('profile', 'lab');
const dist = resolve(root, arg('dir', 'dist'));
const expectedWatermark = arg('expected-watermark', '');
const requireSigned = arg('require-signed', 'false') === 'true';
const forbiddenPublicLiterals = new Set([
  'idle',
  'move',
  'windup',
  'active',
  'recovery',
  'parry',
  'stagger',
  'dead',
  'approach',
  'reposition',
  'sequence_reposition',
  'edge_reposition',
  'telegraph',
  'attack',
  'entrance_fall',
  'entrance_roar',
  'phase_roar',
  'running',
  'cleared',
  'timeout',
  'run_started',
  'run_ended',
  'wave_spawned',
  'arena_gate_opened',
  'companion_hit',
  'companion_downed',
  'player_state_change',
  'attack_started',
  'attack_whiffed',
  'hit_landed',
  'hit_received',
  'guard_success',
  'guard_broken',
  'parry_success',
  'parry_failed',
  'step_started',
  'stamina_empty',
  'enemy_telegraph',
  'enemy_feint',
  'enemy_attack',
  'boss_intro_landed',
  'boss_intro_roar_started',
  'boss_fight_started',
  'boss_phase_roar_started',
  'enemy_sequence_step',
  'enemy_phase_changed',
  'enemy_staggered',
  'enemy_died',
  'projectile_fired',
  'projectile_impact',
  'projectile_reflected',
  'power_used',
  'power_hit',
  'power_overcast',
  'power_released',
  'enemy_status_applied',
  'enemy_status_tick',
  'enemy_status_ended',
  'friendly_fire',
  'player_died',
  'encounter_cleared',
  'slowmo_started',
  'slowmo_ended',
]);

const filesUnder = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });

const files = filesUnder(dist);
const relativeFiles = files.map((file) => relative(dist, file));
const failures = [];

for (const file of files) {
  const extension = extname(file);
  const relativeFile = relative(dist, file);
  const pathSegments = relativeFile.split(/[\\/]/);
  if (extension === '.md' || extension === '.mdx') {
    failures.push(`${relativeFile} is documentation`);
  }
  if (pathSegments.includes('docs')) {
    failures.push(`${relativeFile} is inside a docs directory`);
  }
  if (
    pathSegments.includes('test') ||
    pathSegments.includes('tests') ||
    /\.(?:test|spec)\.[^.]+$/.test(relativeFile)
  ) {
    failures.push(`${relativeFile} is test code`);
  }
  if (extension === '.map') failures.push(`${relative(dist, file)} is a source map`);
  if (!['.html', '.css', '.js'].includes(extension)) continue;

  const contents = readFileSync(file, 'utf8');
  if (contents.includes('sourceMappingURL')) {
    failures.push(`${relative(dist, file)} references a source map`);
  }
  if (extension !== '.js' && contents.includes('/*')) {
    failures.push(`${relative(dist, file)} contains a block comment`);
  }
  if (extension === '.js') {
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.Standard,
      contents,
    );



    const braces = [];
    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      if (token === ts.SyntaxKind.TemplateHead) braces.push('template');
      else if (token === ts.SyntaxKind.OpenBraceToken) braces.push('brace');
      else if (token === ts.SyntaxKind.CloseBraceToken) {
        if (braces[braces.length - 1] === 'template') {
          token = scanner.reScanTemplateToken(false);
          if (token === ts.SyntaxKind.TemplateTail) braces.pop();
        } else braces.pop();
      }
      if (
        token === ts.SyntaxKind.SingleLineCommentTrivia ||
        token === ts.SyntaxKind.MultiLineCommentTrivia
      ) {
        failures.push(`${relative(dist, file)} contains a JavaScript comment`);
        break;
      }
      if (
        profile === 'game' &&
        (token === ts.SyntaxKind.StringLiteral ||
          token === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
          token === ts.SyntaxKind.TemplateHead ||
          token === ts.SyntaxKind.TemplateMiddle ||
          token === ts.SyntaxKind.TemplateTail) &&
        forbiddenPublicLiterals.has(scanner.getTokenValue())
      ) {
        failures.push(
          `${relative(dist, file)} exposes public internal vocabulary ${JSON.stringify(scanner.getTokenValue())}`,
        );
        break;
      }
    }
  }
  if (extension === '.html' && contents.includes('<!--')) {
    failures.push(`${relative(dist, file)} contains an HTML comment`);
  }
}

const index = readFileSync(join(dist, 'index.html'), 'utf8');
if (index.includes('\n')) failures.push('index.html is not minified to one line');
const expectedDistribution = profile === 'game' ? 'public-game' : 'private-lab';
if (!index.includes(`data-distribution="${expectedDistribution}"`)) {
  failures.push(`index.html does not identify itself as ${expectedDistribution}`);
}
if (profile === 'lab' && !index.includes('noindex,nofollow,noarchive')) {
  failures.push('private lab build does not opt out of crawler indexing');
}
if (profile === 'lab') {
  const watermarkPath = join(dist, 'lab-watermark.json');
  let watermark;
  try {
    watermark = JSON.parse(readFileSync(watermarkPath, 'utf8'));
  } catch {
    failures.push('private lab build has no valid lab-watermark.json');
  }
  if (watermark !== undefined) {
    if (!/^lab-[a-f0-9]{20}$/.test(watermark.id ?? '')) {
      failures.push('lab watermark id is malformed');
    }
    if (expectedWatermark !== '' && watermark.id !== expectedWatermark) {
      failures.push(`lab watermark ${watermark.id} does not match ${expectedWatermark}`);
    }
    if (requireSigned && watermark.signed !== true) {
      failures.push('shared lab build watermark is not HMAC-signed');
    }
    if (!index.includes(`name="crown-lab-watermark" content="${watermark.id}"`)) {
      failures.push('lab watermark is missing from index metadata');
    }
    const javaScriptContents = files
      .filter((file) => extname(file) === '.js')
      .map((file) => readFileSync(file, 'utf8'))
      .join('');
    if (!javaScriptContents.includes(watermark.id)) {
      failures.push('lab watermark is missing from JavaScript');
    }
    if (!javaScriptContents.includes(watermark.recipient)) {
      failures.push('lab watermark recipient is missing from JavaScript');
    }
  }
}

const javascript = files.filter((file) => extname(file) === '.js');
if (javascript.length === 0) failures.push('no JavaScript bundle was emitted');

if (profile === 'game') {
  const allowedPublicFiles = new Set(['index.html', 'audio/LICENSE.txt']);
  const allowedAudioStems = [
    'death',
    'guard',
    'heavy',
    'hit',
    'light',
    'parry',
    'player_hurt',
    'power',
    'power_hit',
    'stagger',
    'step',
    'unparryable',
    'wave',


    'bgm-01',
    'bgm-02',
    'bgm-03',
    'bgm-06',
    'bgm-08',
  ];
  const audioStemPattern = new RegExp(
    `^assets/(${allowedAudioStems.join('|')})-[^/.]+\\.(?:ogg|mp3|webm)$`,
  );
  for (const file of relativeFiles) {
    if (allowedPublicFiles.has(file)) continue;
    if (/^assets\/(?:index|game)-[^/]+\.js$/.test(file)) continue;
    if (audioStemPattern.test(file)) continue;
    if (
      /^assets\/(?:far-mountains|distant-city|mid-battlements|near-colonnade)-[^/]+\.webp$/.test(
        file,
      )
    ) {
      continue;
    }
    failures.push(`${file} is not on the public asset allow-list`);
  }
  for (const file of allowedPublicFiles) {
    if (!relativeFiles.includes(file)) failures.push(`required public asset ${file} is missing`);
  }
  for (const stem of allowedAudioStems) {
    if (!relativeFiles.some((file) => audioStemPattern.test(file) && file.startsWith(`assets/${stem}-`))) {
      failures.push(`required public audio ${stem} is missing`);
    }
  }

  const bundle = javascript.map((file) => readFileSync(file, 'utf8')).join('');
  for (const file of relativeFiles) {
    if (!audioStemPattern.test(file)) continue;
    if (!bundle.includes(basename(file))) {
      failures.push(`${file} is shipped but no JavaScript asks for it by name`);
    }
  }

  const forbidden = [
    'CROWN LAB',
    'Parry_Strict',
    'mastery     (no completed runs yet)',
    'run used debug cheats',
    'reset to defaults',
    'capture state did not settle',
    'Hud_Reduced',
    'Subtracted_All',
    'lab-actions',
    'fps-meter',
    'touch-lab-mode',
    'data-lab-key',
    'private-lab',
    'enteredTick',
    'telegraphJitterMs',
    'sequenceParries',
    'riposteWindowMs',
    'powerChannelMs',
    'slowMoUsedThisEncounter',
    'slowMoCooldownMs',
    'pendingOwner',
    'ownerId',
    'hitstopMs',






  ];
  for (const file of files) {
    if (!['.html', '.css', '.js'].includes(extname(file))) continue;
    const contents = readFileSync(file, 'utf8');
    for (const marker of forbidden) {
      if (contents.includes(marker)) {
        failures.push(`${relative(dist, file)} exposes game-forbidden marker ${JSON.stringify(marker)}`);
      }
    }
  }
  if (relativeFiles.some((file) => /(?:^|[/\\])lab-[^/\\]*\.js$/.test(file))) {
    failures.push('a lab-named JavaScript chunk was emitted in the game build');
  }
}










const PUBLIC_MODEL_DEFINITIONS = new Set([
  'POLISHED_KING',
  'POLISHED_GUARD',
  'POLISHED_DUELIST',
  'POLISHED_ARCHER',
  'POLISHED_FIRST_BLADE',
  'POLISHED_CAPTAIN',
  'POLISHED_CHANCELLOR',
  'POLISHED_GLASS_REGENT',
  'POLISHED_QUEEN',
  'POLISHED_THORN_MARSHAL',
]);

const minifiedNumber = (text) => {
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  let out = String(value);
  if (out.startsWith('0.')) out = out.slice(1);
  else if (out.startsWith('-0.')) out = `-${out.slice(2)}`;
  return out;
};

const pointsNeedle = (node, source) => {
  if (!ts.isArrayLiteralExpression(node) || node.elements.length < 3) return null;
  const points = [];
  for (const element of node.elements) {
    if (!ts.isArrayLiteralExpression(element) || element.elements.length !== 2) return null;
    const pair = [];
    for (const value of element.elements) {
      if (ts.isNumericLiteral(value)) pair.push(minifiedNumber(value.getText(source)));
      else if (
        ts.isPrefixUnaryExpression(value) &&
        value.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(value.operand)
      ) {
        pair.push(minifiedNumber(`-${value.operand.getText(source)}`));
      } else return null;
    }
    if (pair.includes(null)) return null;
    points.push(`[${pair.join(',')}]`);
  }
  return `[${points.join(',')}]`;
};

const modelSources = () => {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) found.push(relative(root, full));
    }
  };
  walk(resolve(root, 'src/render'));
  return found;
};

const geometryFingerprints = () => {
  const fingerprints = [];
  for (const relativePath of modelSources()) {
    const source = ts.createSourceFile(
      relativePath,
      readFileSync(resolve(root, relativePath), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const name = declaration.name.getText(source);
        if (declaration.type?.getText(source) !== 'ModelDef') continue;
        if (PUBLIC_MODEL_DEFINITIONS.has(name)) continue;
        let best = null;
        const walk = (node) => {
          const needle = pointsNeedle(node, source);
          if (needle !== null && (best === null || needle.length > best.length)) best = needle;
          ts.forEachChild(node, walk);
        };
        ts.forEachChild(declaration, walk);
        if (best !== null) fingerprints.push({ name, needle: best });
      }
    }
  }
  return fingerprints;
};

if (profile === 'game') {
  const bundled = javascript.map((file) => readFileSync(file, 'utf8')).join('\n');
  const fingerprints = geometryFingerprints();
  if (fingerprints.length === 0) {
    failures.push('unpublished-silhouette check found no lab models to look for — it is broken');
  }
  for (const { name, needle } of fingerprints) {
    if (bundled.includes(needle)) {
      failures.push(`unpublished silhouette ${name} is in the public bundle`);
    }
  }





  const PUBLIC_RENDERER = /** @type {'2d' | '3d'} */ ('2d');
  const THREE_MARKERS = ['__THREE_DEVTOOLS__', 'THREE.WebGLRenderer'];
  const present = THREE_MARKERS.filter((marker) => bundled.includes(marker));
  if (PUBLIC_RENDERER === '2d' && present.length > 0) {
    failures.push(
      `three.js is in the public bundle (${present.join(', ')}) while the declared public ` +
        'renderer is 2d — flip PUBLIC_RENDERER or find out what pulled it in',
    );
  }
  if (PUBLIC_RENDERER === '3d' && present.length < THREE_MARKERS.length) {
    failures.push(
      'the declared public renderer is 3d and three.js is not in the bundle — ADR-051 clause 1: ' +
        'the library going missing is the failure this direction of the check exists for',
    );
  }
}

const jsBytes = javascript.reduce((sum, file) => sum + statSync(file).size, 0);

if (failures.length > 0) {
  throw new Error(`Production build policy failed:\n- ${failures.join('\n- ')}`);
}

console.log(
  `Production ${profile} policy verified: ${relativeFiles.length} files, ${jsBytes} JS bytes, minified, comment-free, no source maps.`,
);
