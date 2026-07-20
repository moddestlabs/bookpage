/**
 * inkComposite.js
 * Composites the text (ink) layer onto the paper albedo canvas
 * using multiply / darken blend modes.
 * Returns the final composited canvas used as the Three.js texture.
 *
 * @param {HTMLCanvasElement} paperAlbedo  Base paper colour canvas
 * @param {HTMLCanvasElement} textLayer    Ink canvas (transparent background)
 * @returns {HTMLCanvasElement}            Composited canvas
 */
export function compositeInkOnPaper(paperAlbedo, textLayer) {
  const size = paperAlbedo.width;

  const out = document.createElement('canvas');
  out.width = out.height = size;
  const ctx = out.getContext('2d');

  // 1. Draw the paper base
  ctx.drawImage(paperAlbedo, 0, 0);

  // 2. Composite ink with 'multiply' blend mode.
  //    Multiply darkens only where ink is present; pure white ink = no change.
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(textLayer, 0, 0);

  // 3. Overlay a very faint 'darken' pass for deep-fibre ink absorption effect
  ctx.globalCompositeOperation = 'darken';
  ctx.globalAlpha = 0.15;
  ctx.drawImage(textLayer, 0, 0);

  // Reset
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  return out;
}
