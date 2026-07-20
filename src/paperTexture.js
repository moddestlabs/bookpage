/**
 * paperTexture.js
 * Loads CC0 paper textures (albedo + normal map) from image files, or
 * generates procedural equivalents as a fallback.
 *
 * Real-texture API:
 *   loadAlbedoCanvas(url, size)  → Promise<HTMLCanvasElement>
 *   loadNormalCanvas(url, size)  → Promise<HTMLCanvasElement>
 *
 * Procedural API (fallback):
 *   generateAlbedo(size, style, grain) → HTMLCanvasElement
 *   generateNormalMap(albedoCanvas)    → HTMLCanvasElement
 *
 * Paper styles: 'aged' | 'white' | 'kraft'
 */

/**
 * Load an image URL and draw it into a square canvas at the given size.
 * Rejects if the network request fails (so callers can fall back).
 * @param {string} url
 * @param {number} size  Output canvas width = height in px
 * @returns {Promise<HTMLCanvasElement>}
 */
export function loadAlbedoCanvas(url, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error(`Failed to load texture: ${url}`));
    img.src = url;
  });
}

/**
 * Load a normal-map image URL into a canvas at the given size.
 * @param {string} url
 * @param {number} size
 * @returns {Promise<HTMLCanvasElement>}
 */
export function loadNormalCanvas(url, size) {
  return loadAlbedoCanvas(url, size); // same draw-to-canvas logic
}

/** Base colours per paper style */
const PAPER_BASE = {
  aged:  { r: 240, g: 228, b: 196 },
  white: { r: 252, g: 250, b: 246 },
  kraft: { r: 199, g: 163, b: 115 },
};

/** Amount of dark fibre/grain per style (0–1) */
const GRAIN_DARK = {
  aged:  0.18,
  white: 0.07,
  kraft: 0.22,
};

/**
 * Generate an albedo (colour) canvas for the paper.
 * @param {number} size        Canvas width = height
 * @param {'aged'|'white'|'kraft'} style
 * @param {number} grainAmount 0–1 override (null = use style default)
 * @returns {HTMLCanvasElement}
 */
export function generateAlbedo(size, style = 'aged', grainAmount = null) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const base = PAPER_BASE[style] ?? PAPER_BASE.aged;
  const gStrength = (grainAmount ?? GRAIN_DARK[style]) * 255;

  // Solid base fill
  ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
  ctx.fillRect(0, 0, size, size);

  // Large low-frequency tonal variation (like paper pulp clumping)
  addLFNoise(ctx, size, base, 0.06, 8);

  // Fine high-frequency grain
  addHFGrain(ctx, size, gStrength);

  // Subtle horizontal fibre streaks (paper-making direction)
  addFibres(ctx, size, base, style);

  // Vignette — slightly darker edges, brighter centre
  addVignette(ctx, size, style);

  return canvas;
}

/**
 * Generate a normal map canvas corresponding to the same paper texture.
 * Approximated from the albedo's luminance gradient (Sobel-like).
 * @param {HTMLCanvasElement} albedo
 * @returns {HTMLCanvasElement}
 */
export function generateNormalMap(albedo) {
  const size = albedo.width;
  const src = albedo.getContext('2d').getImageData(0, 0, size, size);
  const out = new ImageData(size, size);

  function lum(x, y) {
    const i = (Math.min(size - 1, Math.max(0, y)) * size +
                Math.min(size - 1, Math.max(0, x))) * 4;
    return (src.data[i] * 0.299 + src.data[i + 1] * 0.587 + src.data[i + 2] * 0.114) / 255;
  }

  const strength = 6.0; // controls bump height interpretation
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sobel filter on luminance
      const tl = lum(x - 1, y - 1), tc = lum(x, y - 1), tr = lum(x + 1, y - 1);
      const ml = lum(x - 1, y),                           mr = lum(x + 1, y);
      const bl = lum(x - 1, y + 1), bc = lum(x, y + 1), br = lum(x + 1, y + 1);

      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);

      // Normal = normalize(-gx*strength, -gy*strength, 1)
      const nx = -gx * strength;
      const ny = -gy * strength;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      const idx = (y * size + x) * 4;
      out.data[idx]     = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      out.data[idx + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      out.data[idx + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      out.data[idx + 3] = 255;
    }
  }

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = normalCanvas.height = size;
  normalCanvas.getContext('2d').putImageData(out, 0, 0);
  return normalCanvas;
}

// ─── Private helpers ────────────────────────────────────────────────────────

function addLFNoise(ctx, size, base, amp, scale) {
  // Simple Perlin-ish approximation with random rects blended softly
  for (let i = 0; i < 200; i++) {
    const bx = Math.random() * size;
    const by = Math.random() * size;
    const bw = (Math.random() * 0.4 + 0.1) * size;
    const bh = (Math.random() * 0.4 + 0.05) * size;
    const delta = (Math.random() - 0.5) * amp * 255;
    const r = Math.round(Math.min(255, Math.max(0, base.r + delta)));
    const g = Math.round(Math.min(255, Math.max(0, base.g + delta)));
    const b = Math.round(Math.min(255, Math.max(0, base.b + delta * 0.5)));
    ctx.save();
    ctx.filter = `blur(${size * 0.04}px)`;
    ctx.fillStyle = `rgba(${r},${g},${b},0.25)`;
    ctx.fillRect(bx, by, bw, bh);
    ctx.restore();
  }
}

function addHFGrain(ctx, size, gStrength) {
  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * gStrength;
    d[i]     = clamp(d[i] + n);
    d[i + 1] = clamp(d[i + 1] + n * 0.9);
    d[i + 2] = clamp(d[i + 2] + n * 0.7);
  }
  ctx.putImageData(imgData, 0, 0);
}

function addFibres(ctx, size, base, style) {
  const count = style === 'kraft' ? 120 : 60;
  for (let i = 0; i < count; i++) {
    const y = Math.random() * size;
    const len = (Math.random() * 0.3 + 0.05) * size;
    const x = Math.random() * size;
    const darkness = Math.random() * 0.12;
    const r = Math.round(base.r * (1 - darkness));
    const g = Math.round(base.g * (1 - darkness));
    const b = Math.round(base.b * (1 - darkness * 1.2));
    ctx.save();
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.08 + Math.random() * 0.1})`;
    ctx.lineWidth = Math.random() * 0.8 + 0.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (Math.random() - 0.5) * 3);
    ctx.stroke();
    ctx.restore();
  }
}

function addVignette(ctx, size, style) {
  const strength = style === 'aged' ? 0.18 : 0.1;
  const grad = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.3,
    size / 2, size / 2, size * 0.85,
  );
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

function clamp(v) { return Math.min(255, Math.max(0, Math.round(v))); }
