
/** @typedef {import('./ogg.d.mts').OggInfo} OggInfo */

const CAPTURE = 'OggS';
const PAGE_HEADER_BYTES = 27;
const OPUS_GRANULE_HZ = 48000;

/**
 * The byte offset of the first page, or -1. A file that does not begin with a capture pattern is
 * not an Ogg stream and is reported as such rather than parsed hopefully.
 * @param {Buffer} buf
 */
const firstPage = (buf) => (buf.length >= 4 && buf.toString('latin1', 0, 4) === CAPTURE ? 0 : -1);

/**
 * The byte offset of the last page's capture pattern, found by scanning back from the end.
 *
 * `lastIndexOf` on the capture bytes can in principle match audio payload rather than a page
 * boundary; the guard is that the match must have a plausible header behind it, which is checked by
 * the caller reading a granule from it. For the files this project generates — one stream, a few
 * seconds — the last page is within a few kilobytes of the end regardless.
 * @param {Buffer} buf
 */
const lastPage = (buf) => buf.lastIndexOf(CAPTURE, buf.length - 1, 'latin1');

/**
 * Channels, rate, codec and seconds, or a `problem` naming why not.
 *
 * Never throws: stage 5 wants every file's verdict in one run, so a truncated sample is a line in a
 * report rather than the end of the report.
 * @param {Buffer} buf
 * @returns {OggInfo}
 */
export const oggInfo = (buf) => {
  const start = firstPage(buf);
  if (start !== 0) {
    return { ok: false, problem: 'not an Ogg stream — no OggS capture pattern at byte 0' };
  }
  const segments = buf.readUInt8(start + 26);
  const packet = start + PAGE_HEADER_BYTES + segments;
  if (packet >= buf.length) {
    return { ok: false, problem: 'truncated: the first page has no packet' };
  }

  /** @type {'vorbis' | 'opus' | null} */
  let codec = null;
  let channels = 0;
  let sampleRate = 0;
  if (buf.toString('latin1', packet + 1, packet + 7) === 'vorbis' && buf.readUInt8(packet) === 1) {
    codec = 'vorbis';
    channels = buf.readUInt8(packet + 11);
    sampleRate = buf.readUInt32LE(packet + 12);
  } else if (buf.toString('latin1', packet, packet + 8) === 'OpusHead') {
    codec = 'opus';
    channels = buf.readUInt8(packet + 9);
    sampleRate = buf.readUInt32LE(packet + 12);
  } else {
    return { ok: false, problem: 'first packet is neither a Vorbis nor an Opus identification header' };
  }
  if (channels === 0 || sampleRate === 0) {
    return { ok: false, problem: 'identification header declares no channels or no sample rate' };
  }

  const last = lastPage(buf);
  if (last < 0 || last + PAGE_HEADER_BYTES > buf.length) {
    return { ok: false, problem: 'truncated: no final page to take a length from' };
  }
  const granule = Number(buf.readBigUInt64LE(last + 6));
  const granuleHz = codec === 'opus' ? OPUS_GRANULE_HZ : sampleRate;
  const durationSeconds = granule / granuleHz;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { ok: false, problem: 'final page declares no samples — the stream is empty' };
  }

  return { ok: true, codec, channels, sampleRate, durationSeconds };
};

/**
 * What holding this file decoded costs, in bytes.
 *
 * `AudioBuffer` is planar Float32 at the *context's* rate, so this is the floor rather than the
 * figure: a 44.1 kHz sample in a 48 kHz context is resampled up on decode and costs 8.8% more than
 * this says. It is the right floor to budget against because the context's rate is the device's and
 * is not ours to choose.
 * @param {OggInfo} info
 */
export const decodedBytes = (info) =>
  info.ok ? Math.round(info.durationSeconds * info.sampleRate * info.channels * 4) : 0;

/**
 * Why this exists rather than callers reading `info.problem` after an `if (!info.ok)`.
 *
 * `tsconfig.scripts.json` turns `strict` off deliberately — these scripts stub `window` and
 * `document` with object literals — and `strictNullChecks` is what makes a discriminated union
 * narrow. So the `ok: false` branch does not narrow inside `scripts/`, and every consumer would
 * otherwise need a cast at the one place it is trying to report an error. The tests are strict and
 * narrow fine; this is for the stage-5 checker.
 * @param {OggInfo} info
 * @returns {string | null}
 */
export const oggProblem = (info) => ('problem' in info ? info.problem : null);
