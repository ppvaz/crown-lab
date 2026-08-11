
import { execFileSync } from 'node:child_process';

/**
 * A key, or `null` if neither source has one.
 *
 * @param {string} envVar the environment variable CI would set, e.g. `MESHY_API_KEY`
 * @param {string} keychainService the macOS Keychain service name, e.g. `crown-meshy`
 * @returns {string | null}
 */
export const readSecret = (envVar, keychainService) => {
  const fromEnv = process.env[envVar];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;

  if (process.platform !== 'darwin') return null;
  try {
    const found = execFileSync('security', ['find-generic-password', '-s', keychainService, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return found === '' ? null : found;
  } catch {
    return null;
  }
};

/**
 * The same, but it refuses to continue — for the top of a paid call.
 *
 * The message names the variable and the service and says nothing else. A key that is present but
 * wrong is the endpoint's problem to report, and it reports it in a response body this project is
 * already willing to print.
 *
 * @param {string} envVar
 * @param {string} keychainService
 * @returns {string}
 */
export const requireSecret = (envVar, keychainService) => {
  const secret = readSecret(envVar, keychainService);
  if (secret === null) {
    throw new Error(
      `${envVar} is not in the environment and no "${keychainService}" item is in the Keychain.\n`
      + `  export ${envVar}=…            (shell or CI secret manager)\n`
      + `  security add-generic-password -s ${keychainService} -a "$USER" -w   (this machine only)\n`
      + '  Never commit it, never put it in an .env an agent can read, never paste it into a transcript.',
    );
  }
  return secret;
};
