
/** @typedef {import('./audio-plan.d.mts').PlanEntry} PlanEntry */

/**
 * One-shot or loop, from the cue's role.
 *
 * A cue long enough to be a texture is the thing Suno calls a loop. Note what this does *not* do:
 * it never makes `parry` a loop, because `presetFor` puts every essential cue in the one-shot camp
 * regardless of length — a cue carrying information nothing else carries must have an attack.
 * @param {PlanEntry} entry
 */
export const soundKind = (entry) => (entry.derived.basis === 'texture' ? 'loop' : 'one_shot');

const elevenlabs = {
  id: 'elevenlabs',
  keyEnv: 'ELEVENLABS_API_KEY',
  format: 'mp3',
  endpoint: 'https://api.elevenlabs.io/v1/sound-generation',
  /**
   * @param {PlanEntry} entry
   * @param {string} key
   * @returns {Promise<Buffer>}
   */
  async generate(entry, key) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: entry.prompt,
        duration_seconds: entry.durationSeconds,
        prompt_influence: entry.promptInfluence,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${response.statusText} ${detail.slice(0, 400)}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error('the endpoint returned no bytes');
    return bytes;
  },
};

const suno = {
  id: 'suno',
  keyEnv: 'SUNO_API_KEY',
  format: 'mp3',
  endpoint: 'https://api.sunoapi.org/api/v1/generate/sounds',
  pollEndpoint: 'https://api.sunoapi.org/api/v1/generate/record-info',
  creditEndpoint: 'https://api.sunoapi.org/api/v1/generate/credit',
  model: 'V5',
  promptLimit: 500,
  timeoutMs: 180_000,
  pollMs: 3_000,
  /**
   * Remaining credits, or null when the balance cannot be read.
   *
   * Read-only and free, so `gen-audio.mjs` can refuse a batch it cannot pay for instead of
   * discovering it fourteen failures in — which is how the ElevenLabs quota was found, three samples
   * into a fourteen-sample pack that then had to be reverted from git.
   * @param {string} key
   */
  async credits(key) {
    const res = await fetch(this.creditEndpoint, { headers: { authorization: `Bearer ${key}` } }).catch(() => null);
    if (res === null || !res.ok) return null;
    const body = await res.json().catch(() => null);
    return typeof body?.data === 'number' ? body.data : null;
  },
  /**
   * @param {PlanEntry} entry
   * @param {string} key
   * @returns {Promise<Buffer>}
   */
  async generate(entry, key) {
    if (entry.prompt.length > this.promptLimit) {
      throw new Error(`prompt is ${entry.prompt.length} chars, over this endpoint's ${this.promptLimit}`);
    }
    const submit = await fetch(this.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: entry.prompt,
        model: this.model,
        soundLoop: soundKind(entry) === 'loop',
      }),
    });
    if (!submit.ok) {
      const detail = await submit.text().catch(() => '');
      throw new Error(`HTTP ${submit.status} ${submit.statusText} ${detail.slice(0, 400)}`);
    }
    const task = await submit.json();
    const id = task?.data?.taskId;
    if (typeof id !== 'string') {
      throw new Error(`no taskId in the response: ${JSON.stringify(task).slice(0, 200)}`);
    }

    const attempts = Math.ceil(this.timeoutMs / this.pollMs);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await new Promise((done) => setTimeout(done, this.pollMs));
      const poll = await fetch(`${this.pollEndpoint}?taskId=${encodeURIComponent(id)}`, {
        headers: { authorization: `Bearer ${key}` },
      }).catch(() => null);
      if (poll === null || !poll.ok) continue;
      const body = await poll.json().catch(() => null);
      const status = body?.data?.status;
      if (status === 'SUCCESS') {
        const url = body?.data?.response?.sunoData?.[0]?.audioUrl;
        if (typeof url !== 'string') throw new Error(`task ${id} succeeded with no audioUrl`);
        const audio = await fetch(url);
        if (!audio.ok) throw new Error(`task ${id} finished but ${url} would not download`);
        const bytes = Buffer.from(await audio.arrayBuffer());
        if (bytes.length === 0) throw new Error(`task ${id} returned an empty file`);
        return bytes;
      }
      if (typeof status === 'string' && /FAILED|ERROR|EXCEPTION/.test(status)) {
        throw new Error(`task ${id} ended ${status}`);
      }
    }
    throw new Error(`task ${id} did not finish in ${this.timeoutMs / 1000}s — it may still be paid for`);
  },
};

export const PROVIDERS = { elevenlabs, suno };

/**
 * The provider by name, with its key, or a rejection naming exactly what is absent.
 *
 * The key is read here and nowhere earlier so that `--list` and `audio:plan` never touch the
 * environment: a listing that fails for a missing secret teaches an operator to export one before
 * reading what a batch *would* do, which is backwards.
 * @param {string} name
 */
export const providerNamed = (name) => {
  const provider = PROVIDERS[name];
  if (provider === undefined) {
    throw new Error(`no provider "${name}" — try one of: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
};

/** @param {{ keyEnv: string, id: string }} provider */
export const keyFor = (provider) => {
  const key = process.env[provider.keyEnv];
  if (key === undefined || key === '') {
    throw new Error(`${provider.keyEnv} is not in the environment — see gen-audio.mjs’s header`);
  }
  return key;
};
