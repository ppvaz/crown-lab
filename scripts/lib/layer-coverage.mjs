
export const coverageOf = (image, threshold = 10) => {
  const { width, height, at, alphaAt, channels } = image;
  const hasAlpha = channels === 2 || channels === 4;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (hasAlpha) {
        if (alphaAt(x, y) >= 128) mask[y * width + x] = 1;
        continue;
      }
      const [r, g, b] = at(x, y);
      if ((r + g + b) / 3 >= threshold) mask[y * width + x] = 1;
    }
  }
  return { width, height, mask };
};

export const partitionReport = (whole, parts) => {
  const { width, height, mask: all } = whole;
  for (const part of parts) {
    if (part.width !== width || part.height !== height) {
      throw new Error(
        `coverage sizes differ: whole is ${width}x${height}, a part is ${part.width}x${part.height}`,
      );
    }
  }

  let covered = 0;
  let dropped = 0;
  let overlapped = 0;
  let outside = 0;
  let perimeter = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      let hits = 0;
      for (const part of parts) hits += part.mask[i];
      if (all[i]) {
        covered += 1;
        if (hits === 0) dropped += 1;
        const edge =
          x === 0 ||
          y === 0 ||
          x === width - 1 ||
          y === height - 1 ||
          !all[i - 1] ||
          !all[i + 1] ||
          !all[i - width] ||
          !all[i + width];
        if (edge) perimeter += 1;
      } else if (hits > 0) {
        outside += 1;
      }
      if (hits > 1) overlapped += 1;
    }
  }
  return { covered, dropped, overlapped, outside, perimeter };
};

/**
 * Does the decomposition reconstruct the room? `merged x shadow` against one whole render.
 *
 * The `shadow` layer is only honest if the geometry layers gave the shadow term up — otherwise it
 * darkens a room that is already dark, and nothing downstream can tell. So this performs the
 * runtime's own operation and compares the result with a beauty render of the same scene: the
 * static layers over one another in composition order, then Canvas2D's `multiply` against the
 * shadow layer, byte for byte in the sRGB encoding the browser blends in rather than in linear.
 *
 * **Interior pixels only.** A pixel whose alpha is not full is a silhouette pixel, and a subset
 * render antialiases its own edge against nothing while the whole render antialiases it against
 * whatever stands behind it. Those differ for reasons that are not the decomposition, they are
 * O(perimeter) against an O(area) question, and including them would put a floor under the
 * residual that no amount of correctness could get below. `compared` says how many survived.
 *
 * @param {{width: number, height: number, at: Function, alphaAt: Function}} whole
 * @param {readonly {at: Function, alphaAt: Function}[]} statics in composition order, back to front
 * @param {{at: Function, alphaAt: Function}} shadow
 */
export const recomposeReport = (whole, statics, shadow, { opaque = 250 } = {}) => {
  const { width, height } = whole;
  let compared = 0;
  let sum = 0;
  let baseSum = 0;
  let worst = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (whole.alphaAt(x, y) < opaque || shadow.alphaAt(x, y) < opaque) continue;
      let merged = null;
      for (const layer of statics) {
        if (layer.alphaAt(x, y) < opaque) continue;
        merged = layer.at(x, y);
      }
      if (merged === null) continue;
      compared += 1;
      const want = whole.at(x, y);
      const factor = shadow.at(x, y);
      for (let c = 0; c < 3; c += 1) {
        const got = (merged[c] * factor[c]) / 255;
        const error = Math.abs(got - want[c]);
        sum += error;
        baseSum += merged[c];
        if (error > worst) worst = error;
      }
    }
  }
  return {
    compared,
    meanAbsError: compared === 0 ? 0 : sum / (compared * 3),
    maxAbsError: worst,
    meanBase: compared === 0 ? 0 : baseSum / (compared * 3),
  };
};
