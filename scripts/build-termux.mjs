import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const profile = arg('profile', 'game');
if (profile !== 'game' && profile !== 'lab') throw new Error(`Unknown profile: ${profile}`);
const dist = resolve(root, arg('dir', profile === 'lab' ? 'dist-lab' : 'dist'));
const labWatermark =
  profile === 'lab'
    ? JSON.parse(readFileSync(join(dist, 'lab-watermark.json'), 'utf8')).id
    : null;
const artifactName =
  profile === 'lab'
    ? `crown-lab-${labWatermark}-termux.run`
    : 'the-last-king-termux.run';
const output = arg('out') === undefined ? join(root, 'artifacts', artifactName) : resolve(root, arg('out'));
const temporaryDirectory = mkdtempSync(join(tmpdir(), `${profile}-termux-`));
const archive = join(temporaryDirectory, 'payload.tar.gz');
const displayName = profile === 'lab' ? `Crown Lab ${labWatermark}` : 'The Last King';
const dataDirectory = profile === 'lab' ? 'crown-lab' : 'the-last-king';
const defaultPort = profile === 'lab' ? 5174 : 5173;

const filesUnder = (directory) =>
  readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    })
    .sort();

const payloadFiles = filesUnder(dist).filter((file) => file !== output);
const digest = createHash('sha256');
for (const file of payloadFiles) {
  digest.update(relative(dist, file));
  digest.update(readFileSync(file));
}
const bundleId = digest.digest('hex').slice(0, 12);

const tar = spawnSync('tar', ['-czf', archive, '-C', dist, '.'], {
  encoding: 'utf8',
});
if (tar.status !== 0) {
  throw new Error(`Could not create Termux payload:\n${tar.stderr || tar.stdout}`);
}

const launcher = `#!/data/data/com.termux/files/usr/bin/bash
set -eu

KING_BUNDLE_ID='${bundleId}'
# KING_GAME_HOME names a parent, never the data root itself: the profile segment is appended
# either way, so a shared override cannot land the lab and the game in one directory where the
# prune pass below would delete across profiles.
KING_DATA_ROOT="\${KING_GAME_HOME:+\${KING_GAME_HOME}/${dataDirectory}}"
KING_DATA_ROOT="\${KING_DATA_ROOT:-\${HOME}/.local/share/${dataDirectory}}"
KING_APP_DIR="\${KING_DATA_ROOT}/\${KING_BUNDLE_ID}"
KING_PORT="\${KING_GAME_PORT:-${defaultPort}}"
KING_URL="http://127.0.0.1:\${KING_PORT}"

if [ ! -f "\${KING_APP_DIR}/index.html" ]; then
  mkdir -p "\${KING_APP_DIR}"
  KING_PAYLOAD_LINE="$(awk '/^__KING_GAME_ARCHIVE_BELOW__$/ { print NR + 1; exit }' "$0")"
  tail -n "+\${KING_PAYLOAD_LINE}" "$0" | tar -xzf - -C "\${KING_APP_DIR}"
fi

# Each build installs under its own content hash, so without this the phone would keep one
# copy of every package ever run. Pruning runs only after a successful extraction, and two
# guards keep an unusual KING_GAME_HOME from reaching unrelated data: the directory name must
# be shaped like one of our own bundle ids, and it must actually hold an extracted build.
for KING_OLD in "\${KING_DATA_ROOT}"/*; do
  [ -d "\${KING_OLD}" ] || continue
  KING_OLD_ID="\${KING_OLD##*/}"
  [ "\${KING_OLD_ID}" != "\${KING_BUNDLE_ID}" ] || continue
  [ "\${#KING_OLD_ID}" -eq ${bundleId.length} ] || continue
  case "\${KING_OLD_ID}" in *[!0-9a-f]*) continue ;; esac
  [ -f "\${KING_OLD}/index.html" ] || continue
  rm -rf "\${KING_OLD}"
  echo "Versao anterior removida: \${KING_OLD_ID}"
done

# Lets an installer script — or a test — stop after the filesystem work, with no Python and no
# listening port.
if [ "\${KING_GAME_INSTALL_ONLY:-0}" = "1" ]; then
  echo "\${KING_APP_DIR}"
  exit 0
fi

if command -v python3 >/dev/null 2>&1; then
  KING_PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  KING_PYTHON=python
elif command -v pkg >/dev/null 2>&1; then
  echo "Python ausente; instalando automaticamente pelo Termux..."
  pkg install -y python
  KING_PYTHON=python
else
  echo "Nao encontrei Python nem o gerenciador pkg do Termux." >&2
  exit 1
fi

KING_WAKE_LOCKED=0
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
  KING_WAKE_LOCKED=1
fi

king_cleanup() {
  if [ "\${KING_WAKE_LOCKED}" -eq 1 ] && command -v termux-wake-unlock >/dev/null 2>&1; then
    termux-wake-unlock
  fi
}
trap king_cleanup EXIT INT TERM

echo
echo "${displayName} pronto em \${KING_URL}"
echo "Pressione Ctrl+C para encerrar."
echo

if [ "\${KING_GAME_SKIP_OPEN:-0}" != "1" ] && command -v termux-open-url >/dev/null 2>&1; then
  (sleep 1; termux-open-url "\${KING_URL}") &
fi

cd "\${KING_APP_DIR}"
"\${KING_PYTHON}" -m http.server "\${KING_PORT}" --bind 127.0.0.1
exit $?
__KING_GAME_ARCHIVE_BELOW__
`;

try {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, launcher);
  appendFileSync(output, readFileSync(archive));
  chmodSync(output, 0o755);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(
  `Termux package created: ${relative(root, output)} (${bundleId}, ${statSync(output).size} bytes, ${basename(output)})`,
);
