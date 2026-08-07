
const over = (statics, x, y) => {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const layer of statics) {
    const alpha = layer.alphaAt(x, y) / 255;
    if (alpha === 0) continue;
    const [sr, sg, sb] = layer.at(x, y);
    r = sr * alpha + r * (1 - alpha);
    g = sg * alpha + g * (1 - alpha);
    b = sb * alpha + b * (1 - alpha);
    a = alpha + a * (1 - alpha);
  }
  return [r, g, b, a];
};

/**
 * The multiply layer that turns the unshadowed room into the shadowed one.
 *
 * @param {import('./png.d.mts').PngImage} whole the room in one render, shadows on
 * @param {readonly import('./png.d.mts').PngImage[]} statics the geometry layers, shadows off,
 *        in composition order back to front
 * @returns {{width: number, height: number, rgba: Uint8Array, darkened: number, covered: number,
 *            meanFactor: number, clamped: number}}
 */
export const deriveShadowLayer = (whole, statics, { darkeningThreshold = 250 } = {}) => {
  const { width, height } = whole;
  const rgba = new Uint8Array(width * height * 4);
  let covered = 0;
  let darkened = 0;
  let clamped = 0;
  let factorSum = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const [mr, mg, mb, ma] = over(statics, x, y);
      if (ma === 0) {
        rgba[i] = 255;
        rgba[i + 1] = 255;
        rgba[i + 2] = 255;
        rgba[i + 3] = 0;
        continue;
      }
      const wa = whole.alphaAt(x, y) / 255;
      const [wr, wg, wb] = whole.at(x, y);
      const merged = [mr / ma, mg / ma, mb / ma];
      const want = wa === 0 ? [0, 0, 0] : [wr, wg, wb];
      let lowest = 255;
      for (let c = 0; c < 3; c += 1) {
        const raw = merged[c] <= 0 ? 255 : Math.round((255 * want[c]) / merged[c]);
        if (raw > 255) clamped += 1;
        const value = Math.max(0, Math.min(255, raw));
        rgba[i + c] = value;
        if (value < lowest) lowest = value;
      }
      rgba[i + 3] = Math.round(ma * 255);
      covered += 1;
      factorSum += lowest;
      if (lowest < darkeningThreshold) darkened += 1;
    }
  }
  return {
    width,
    height,
    rgba,
    covered,
    darkened,
    clamped,
    meanFactor: covered === 0 ? 1 : factorSum / (covered * 255),
  };
};
