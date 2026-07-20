/**
 * textLayer.js
 * Renders multi-script text to an offscreen canvas.
 * Handles: LTR, RTL (Hebrew), and CJK/Japanese (Intl.Segmenter).
 */

// Google-Fonts-based font stack ordered by script coverage
const FONT_FAMILY =
  '"Noto Sans JP", "Noto Sans SC", "Noto Sans Hebrew", "Noto Sans", serif';

/**
 * Detect whether a string is predominantly RTL.
 * Uses Unicode bidirectional character property ranges.
 */
function isRTL(text) {
  // Hebrew: U+0590–U+05FF, Arabic: U+0600–U+06FF, etc.
  const rtlPattern =
    /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  const rtlCount = (text.match(rtlPattern) || []).length;
  return rtlCount / text.length > 0.3;
}

/**
 * Segment text into grapheme clusters for correct CJK line wrapping.
 * Falls back to character splitting if Intl.Segmenter is unavailable.
 */
function segmentText(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return [...segmenter.segment(text)].map((s) => s.segment);
  }
  return [...text]; // Unicode-safe character split
}

/**
 * Wrap text into lines that fit within maxWidth pixels.
 * Handles both space-based wrapping (Latin) and character-based (CJK).
 */
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  // First split on explicit newlines
  for (const paragraph of text.split('\n')) {
    const segments = segmentText(paragraph);
    let line = '';
    let lineWidth = 0;

    for (const seg of segments) {
      const segWidth = ctx.measureText(seg).width;
      const spaceWidth = ctx.measureText(' ').width;

      if (lineWidth + segWidth > maxWidth && line.length > 0) {
        lines.push(line);
        line = seg;
        lineWidth = segWidth;
      } else {
        // Use space separator for Latin; join directly for CJK
        if (line.length > 0 && /\s/.test(seg)) {
          line += seg;
          lineWidth += spaceWidth;
        } else {
          line += seg;
          lineWidth += segWidth;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Render text to an offscreen canvas with subtle ink realism:
 * slight blur + low-opacity noise so it doesn't look like crisp vector text.
 *
 * @param {object} opts
 * @param {string}  opts.text
 * @param {number}  opts.canvasSize   Width & height of the output (square)
 * @param {number}  opts.fontSize     px
 * @param {string}  opts.color        CSS color string (ink colour)
 * @param {number}  opts.opacity      0–1, ink layer opacity
 * @returns {HTMLCanvasElement}
 */
export function renderTextLayer({ text, canvasSize, fontSize, color, opacity }) {
  const pad = Math.round(canvasSize * 0.07);
  const maxWidth = canvasSize - pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d');

  // Font setup
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.direction = isRTL(text) ? 'rtl' : 'ltr';
  if (ctx.direction === 'rtl') ctx.textAlign = 'right';

  const lines = wrapText(ctx, text, maxWidth);
  const lineHeight = fontSize * 1.45;
  const totalHeight = lines.length * lineHeight;
  const startY = Math.max(pad, (canvasSize - totalHeight) / 2);
  const xPos = ctx.direction === 'rtl' ? canvasSize - pad : pad;

  // ── Pass 1: draw ink with a tiny blur to soften edges ──
  ctx.save();
  ctx.filter = 'blur(0.6px)';
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  lines.forEach((line, i) => {
    ctx.fillText(line, xPos, startY + i * lineHeight);
  });
  ctx.restore();

  // ── Pass 2: subtle noise overlay to break up perfect uniformity ──
  applyInkNoise(ctx, canvasSize, color, opacity * 0.08);

  return canvas;
}

/**
 * Scatter a very faint random speckle over the canvas to simulate
 * paper-absorbed ink variation.
 */
function applyInkNoise(ctx, size, color, alpha) {
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    // Only add noise where ink already exists (alpha > 0)
    if (data[i + 3] > 10) {
      const jitter = (Math.random() - 0.5) * 18;
      data[i] = Math.min(255, Math.max(0, data[i] + jitter));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + jitter));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + jitter));
    }
  }
  ctx.putImageData(imageData, 0, 0);
}
