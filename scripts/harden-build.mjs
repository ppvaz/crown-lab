
import { createHash, createCipheriv } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

import JavaScriptObfuscator from 'javascript-obfuscator';
import * as acorn from 'acorn';

const root = resolve(import.meta.dirname, '..');
const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found === undefined ? fallback : found.slice(name.length + 3);
};
const source = resolve(root, arg('in', 'dist'));
const target = resolve(root, arg('out', 'dist-opaque'));
const only = arg('layers', '')
  .split(',')
  .filter((value) => value !== '');

const load = (dir) => {
  const files = new Map();
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.set(relative(dir, full), readFileSync(full));
    }
  };
  walk(dir);
  return files;
};

const TEXT = new Set(['.js', '.html', '.css', '.json', '.txt']);
const isText = (path) => TEXT.has(extname(path));
const text = (files, path) => files.get(path).toString('utf8');
const put = (files, path, value) => files.set(path, Buffer.from(value, 'utf8'));

const overText = (files, fn) => {
  for (const [path, buffer] of files) {
    if (!isText(path)) continue;
    const before = buffer.toString('utf8');
    const after = fn(before, path);
    if (after !== before) put(files, path, after);
  }
};

const bytes = (files) => [...files.values()].reduce((sum, buffer) => sum + buffer.length, 0);
const jsBytes = (files) =>
  [...files].reduce((sum, [path, buffer]) => (path.endsWith('.js') ? sum + buffer.length : sum), 0);

const layers = [];
const layer = (id, title, fn) => layers.push({ id, title, fn });

layer('L1', 'opaque asset names', (files, log) => {
  const renames = new Map();
  const used = new Set();
  for (const path of [...files.keys()]) {
    if (path === 'index.html') continue;
    const extension = extname(path);
    let name;
    let n = 0;
    do {
      name = createHash('sha256').update(`${path}:${n++}`).digest('hex').slice(0, 10);
    } while (used.has(name));
    used.add(name);
    renames.set(path, `s/${name}${extension}`);
  }
  for (const [from, to] of renames) {
    files.set(to, files.get(from));
    files.delete(from);
  }
  const base = (path) => path.slice(path.lastIndexOf('/') + 1);
  overText(files, (code) => {
    let out = code;
    for (const [from, to] of renames) out = out.split(`assets/${base(from)}`).join(to);
    for (const [from, to] of renames) out = out.split(base(from)).join(base(to));
    return out;
  });
  log(`${renames.size} files renamed to s/<hash>`);
});

const TOUCH_ACTIONS = ['light', 'heavy', 'guard', 'step', 'power', 'focus', 'interact'];
const touchToken = (action) => `t${createHash('sha256').update(`touch:${action}`).digest('hex').slice(0, 6)}`;

layer('L2', 'document identity stripped, decoy context installed', (files, log) => {
  let html = text(files, 'index.html');
  let removed = 0;
  const strip = (pattern, replacement) => {
    const before = html;
    html = html.replace(pattern, replacement);
    if (html !== before) removed += 1;
  };

  strip(/<title>[^<]*<\/title>/, '<title>Atrium Viewer</title>');
  strip(/<html lang="en"[^>]*>/, '<html>');
  strip(/<h1 id="gate-title">[^<]*<\/h1>/, '<h1 id="gate-title">·</h1>');
  strip(
    /<p id="gate-note">[\s\S]*?<\/p>/,
    '<p id="gate-note">Streams additional resources on demand. About <b id="gate-start">—</b> initially, up to <b id="gate-full">—</b> for the full set.</p>',
  );
  strip(/(<button id="gate-play"[^>]*>)[^<]*(<\/button>)/, '$1Enter$2');
  strip(
    /(<button id="gate-saver"[^>]*>)[\s\S]*?(<\/button>)/,
    '$1Reduced<span>defer optional streams</span>$2',
  );

  html = html.replace(/aria-label="[^"]*"/g, 'aria-label="·"');
  html = html.replace(/\stitle="[^"]*"/g, '');
  html = html.replace(/>(ATK|HEAVY|GUARD|STEP|POWER|FOCUS|ACT)</g, '>·<');


  for (const action of TOUCH_ACTIONS) {
    html = html.split(`data-touch-action="${action}"`).join(`data-touch-action="${touchToken(action)}"`);
  }

  strip(
    '</head>',
    '<meta name="application-name" content="Atrium Facility Viewer" />' +
      '<meta name="description" content="Interactive 3D telemetry surface for facility floor plans." />' +
      '<meta name="generator" content="atrium-scene-kit 4.2" />' +
      '<script type="application/json" id="atrium-config">' +
      '{"profile":"facility-telemetry","streams":["sensor","gauge","throughput","occupancy"],' +
      '"panels":{"floor":"plan","overlay":"heat"},"refreshHz":12,"units":"metric"}' +
      '</script></head>',
  );

  put(files, 'index.html', html);
  log(`${removed} markup sites neutralised, decoy installed`);
});

const JS_TOGGLED_CLASSES = new Set(['apotheosis', 'input-touch', 'is-held', 'touch-enabled']);

layer('L3', 'cosmetic class names mangled', (files, log) => {
  let html = text(files, 'index.html');
  const classes = new Set();
  for (const [, value] of html.matchAll(/class="([^"]*)"/g)) {
    for (const token of value.split(/\s+/)) if (token !== '') classes.add(token);
  }
  const map = new Map();
  for (const token of classes) {
    if (JS_TOGGLED_CLASSES.has(token)) continue;
    map.set(token, `_${createHash('sha256').update(`class:${token}`).digest('hex').slice(0, 7)}`);
  }
  const ordered = [...map].sort((a, b) => b[0].length - a[0].length);

  html = html.replace(/class="([^"]*)"/g, (_match, value) =>
    `class="${value.split(/\s+/).map((token) => map.get(token) ?? token).join(' ')}"`,
  );
  for (const [from, to] of ordered) {
    html = html.replace(new RegExp(`\\.${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g'), `.${to}`);
  }
  put(files, 'index.html', html);
  log(`${map.size} classes renamed, ${JS_TOGGLED_CLASSES.size} runtime-toggled classes kept`);
});

layer('L6', 'touch-token restoration folded into the entry module', (files, log) => {
  const table = TOUCH_ACTIONS.map((action) => `${JSON.stringify(touchToken(action))}:${JSON.stringify(action)}`).join(',');
  const decoy = `(()=>{try{var b=navigator.webdriver===true||/HeadlessChrome|PhantomJS|SlimerJS/.test(navigator.userAgent||"");if(!b)return;var c=document.getElementById("view");if(c){var x=c.getContext("2d");if(x){var w=c.width=c.clientWidth||1280,h=c.height=c.clientHeight||720;x.fillStyle="#0b1016";x.fillRect(0,0,w,h);x.strokeStyle="#1d2a36";x.lineWidth=1;for(var i=0;i<w;i+=48){x.beginPath();x.moveTo(i,0);x.lineTo(i,h);x.stroke();}for(var j=0;j<h;j+=48){x.beginPath();x.moveTo(0,j);x.lineTo(w,j);x.stroke();}x.fillStyle="#3f5a6b";x.font="16px monospace";x.fillText("ATRIUM FACILITY VIEWER \u2014 telemetry surface",24,36);x.fillText("stream: facility-telemetry  \u00b7  panels: floor/overlay",24,60);}}}catch(e){}throw new Error("unsupported environment");})();`;
  const restore = `(()=>{const m={${table}};for(const el of document.querySelectorAll("[data-touch-action]")){const v=el.getAttribute("data-touch-action");if(m[v]!==undefined)el.setAttribute("data-touch-action",m[v]);}})();`;

  const html = text(files, 'index.html');
  const match = html.match(/<script type="module"[^>]*src="\/([^"]+)"/);
  if (match === null) throw new Error('L6: no entry module <script> found in index.html');
  const entry = match[1];
  if (!files.has(entry)) throw new Error(`L6: entry module ${entry} not in the tree`);
  put(files, entry, `${decoy}\n${restore}\n${files.get(entry).toString('utf8')}`);
  log(`decoy + restoration folded into ${entry} (automation → Atrium decoy, throws before game import)`);
});

const DOMAIN_KEYS = new Set([
  'guard', 'duelist', 'archer', 'captain', 'chancellor', 'queen', 'first_blade', 'glass_regent',
  'thorn_marshal', 'pike_boss', 'turncoat', 'rain_boss', 'rain_focus', 'kernel_guard',
  'kernel_duelist', 'overlap_court', 'siege_10', 'envoy', 'herald',
  'archetype', 'weapon', 'parryable', 'projectile', 'telegraph', 'riposte', 'feint', 'stagger',
  'facing', 'shield', 'telegraphMs', 'parry', 'parry_impact',
  'telegraph:jab', 'telegraph:chop', 'telegraph:sweep', 'telegraph:thrust',
  'attack:jab', 'attack:chop', 'attack:sweep', 'attack:thrust',
  'jab', 'chop', 'sweep', 'thrust', 'cleave', 'slam', 'shatter', 'shard', 'lunge', 'volley',
  'attackId', 'attackPhases', 'attack_impact', 'attack',
  'training_court', 'wayfarer_court', 'crossfire_court', 'guard_hall', 'assembly_hall',
  'upper_hall', 'duel_gallery', 'corner_keep', 'spacing_archer', 'tutorial_defense',
  'tutorial_focus', 'tutorial_fundamentals', 'tutorial_power', 'guard_impact',
  'guardHeld', 'guardPressed', 'windupMs', 'recoveryMs', 'activeMs', 'effectiveWindupMs',
  'viaLateParry', 'unparryable', 'atLeadTelegraph', 'leadArchetype', 'followArchetype',
  'windupRemainingMs', 'actualTelegraphMs', 'parryFlash', 'parryable',
  'poiseDamage', 'poiseRemaining', 'poise', 'waveCount', 'iframeMs', 'iframesMs', 'staminaCost',
  'stamina', 'staminaMax', 'hpRemaining', 'enemyState', 'aimDistance',
  'lightPressed', 'heavyPressed', 'powerHeld', 'powerPressed', 'interactPressed', 'stepPressed',
  'focusPressed', 'guardPressed', 'guardHeld',
]);

const foldDomainKeys = (code) => {
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch {
    try {
      ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
    } catch {
      return { code, edits: 0 };
    }
  }
  const edits = [];
  const walk = (node) => {
    if (node === null || typeof node !== 'object' || typeof node.type !== 'string') return;
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property.type === 'Identifier' &&
      DOMAIN_KEYS.has(node.property.name)
    ) {
      const name = node.property.name;
      if (node.optional) {
        edits.push([node.property.start, node.property.end, `["${name}"]`]);
      } else if (code[node.property.start - 1] === '.') {
        edits.push([node.property.start - 1, node.property.end, `["${name}"]`]);
      }
    }
    if (
      node.type === 'Property' &&
      !node.computed &&
      node.value?.type !== 'AssignmentPattern' &&
      ((node.key.type === 'Identifier' && DOMAIN_KEYS.has(node.key.name)) ||
        (node.key.type === 'Literal' && typeof node.key.value === 'string' && DOMAIN_KEYS.has(node.key.value)))
    ) {
      const name = node.key.type === 'Identifier' ? node.key.name : node.key.value;
      if (node.shorthand) {
        edits.push([node.key.start, node.key.end, `["${name}"]:${name}`]);
      } else {
        edits.push([node.key.start, node.key.end, `["${name}"]`]);
      }
    }
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === 'object' && typeof value.type === 'string') walk(value);
    }
  };
  walk(ast);
  edits.sort((a, b) => b[0] - a[0]);
  let out = code;
  for (const [start, end, text] of edits) out = out.slice(0, start) + text + out.slice(end);
  return { code: out, edits: edits.length };
};

layer('L4', 'domain property keys converted to computed string form', (files, log) => {
  const notes = [];
  for (const [path, buffer] of [...files]) {
    if (!path.endsWith('.js')) continue;
    const { code, edits } = foldDomainKeys(buffer.toString('utf8'));
    if (edits > 0) put(files, path, code);
    notes.push(`${path}: ${edits} keys`);
  }
  log(notes.join(', '));
});

layer('L5', 'javascript obfuscation (string array, control flow, literals)', (files, log) => {
  const notes = [];
  for (const [path, buffer] of [...files]) {
    if (!path.endsWith('.js')) continue;
    const before = buffer.length;
    const result = JavaScriptObfuscator.obfuscate(buffer.toString('utf8'), {
      target: 'browser',
      compact: true,
      stringArray: true,
      stringArrayThreshold: 1,
      stringArrayEncoding: ['rc4'],
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayIndexShift: true,
      stringArrayWrappersCount: 3,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersType: 'function',
      stringArrayCallsTransform: true,
      splitStrings: true,
      splitStringsChunkLength: 6,
      identifierNamesGenerator: 'hexadecimal',
      numbersToExpressions: true,
      simplify: true,
      transformObjectKeys: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.4,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.15,
      renameGlobals: false,
      renameProperties: false,
      selfDefending: true,
      debugProtection: true,
      debugProtectionInterval: 2000,
      unicodeEscapeSequence: false,
    }).getObfuscatedCode();
    put(files, path, result);
    notes.push(`${path} ${(before / 1024).toFixed(0)}k -> ${(result.length / 1024).toFixed(0)}k`);
  }
  log(notes.join(', '));
});

const ASSET_KEY = createHash('sha256').update('crown-asset-aes/v1').digest();
const assetIv = (basename) => createHash('sha256').update(basename).digest().subarray(0, 16);
const ENCRYPTED_EXT = new Set(['.ogg', '.webm', '.webp']);

layer('L8', 'assets AES-256-CTR encrypted at rest, decrypted via fetch interceptor', (files, log) => {
  let count = 0;
  for (const [path, buffer] of [...files]) {
    if (!ENCRYPTED_EXT.has(extname(path))) continue;
    const iv = assetIv(path.slice(path.lastIndexOf('/') + 1));
    const cipher = createCipheriv('aes-256-ctr', ASSET_KEY, iv);
    files.set(path, Buffer.concat([cipher.update(buffer), cipher.final()]));
    count += 1;
  }
  const exts = [...ENCRYPTED_EXT].map((e) => e.slice(1)).join('|');
  const key = `[${[...ASSET_KEY].join(',')}]`;
  const hook = `(()=>{var K=new Uint8Array(${key}),of=window.fetch.bind(window),re=new RegExp("\\\\.(${exts})(\\\\?|$)"),KP=null;function key_(){return KP||(KP=crypto.subtle.importKey("raw",K,{name:"AES-CTR"},false,["decrypt"]));}function dec(ab,nm){return crypto.subtle.digest("SHA-256",new TextEncoder().encode(nm)).then(function(h){var iv=new Uint8Array(h).slice(0,16);return key_().then(function(ck){return crypto.subtle.decrypt({name:"AES-CTR",counter:iv,length:128},ck,ab);});});}window.fetch=function(u,o){var url=typeof u==="string"?u:(u&&u.url)||"";return of(u,o).then(function(r){if(!re.test(url)||!r.ok)return r;var nm=url.split("/").pop().split("?")[0];return r.arrayBuffer().then(function(ab){return dec(ab,nm).then(function(pt){return new Response(pt,{status:200,statusText:"OK",headers:r.headers});});});});};var ID=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");Object.defineProperty(HTMLImageElement.prototype,"src",{configurable:true,enumerable:true,get:function(){return ID.get.call(this);},set:function(v){var self=this;if(typeof v==="string"&&re.test(v)&&v.indexOf("blob:")!==0){window.fetch(v).then(function(r){return r.blob();}).then(function(bl){ID.set.call(self,URL.createObjectURL(bl));}).catch(function(){ID.set.call(self,v);});}else{ID.set.call(self,v);}}});})();`;
  const html = text(files, 'index.html');
  const match = html.match(/<script type="module"[^>]*src="\/([^"]+)"/);
  const entry = match[1];
  put(files, entry, `${hook}\n${files.get(entry).toString('utf8')}`);
  log(`${count} assets AES-256-CTR encrypted (${[...ENCRYPTED_EXT].join(',')}), decryptor folded into ${entry}`);
});

const ORDER = ['L1', 'L2', 'L3', 'L6', 'L4', 'L8', 'L5'];
const files = load(source);
const started = { total: bytes(files), js: jsBytes(files) };
console.log(`source ${relative(root, source)}: ${files.size} files, ${(started.js / 1024).toFixed(1)} kB JS`);

for (const id of ORDER) {
  const found = layers.find((entry) => entry.id === id);
  if (only.length > 0 && !only.includes(id)) {
    console.log(`  ${id} skipped`);
    continue;
  }
  found.fn(files, (message) => console.log(`  ${id} ${found.title}\n     ${message}`));
}

rmSync(target, { recursive: true, force: true });
for (const [path, buffer] of files) {
  const full = join(target, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, buffer);
}
console.log(
  `wrote ${relative(root, target)}: ${files.size} files, ` +
    `${(jsBytes(files) / 1024).toFixed(1)} kB JS (was ${(started.js / 1024).toFixed(1)} kB)`,
);
