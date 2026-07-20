/**
 * main.js
 * Wires the full pipeline together and drives the UI.
 *
 * Pipeline order (mirrors implementation.md):
 *  1. renderTextLayer()     → ink canvas
 *  2. generateAlbedo()      → paper canvas
 *  3. generateNormalMap()   → normal canvas
 *  4. compositeInkOnPaper() → combined canvas → THREE.CanvasTexture
 *  5. createPage()          → curved Three.js mesh
 *  6. OrbitControls         → mouse-driven view
 *  7. exportPNG()           → download
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { renderTextLayer }    from './textLayer.js';
import {
  loadAlbedoCanvas, loadNormalCanvas,
  generateAlbedo, generateNormalMap,
} from './paperTexture.js';
import { compositeInkOnPaper } from './inkComposite.js';
import { createPage }         from './pageGeometry.js';
import { exportPNG }          from './exporter.js';

// ─── DOM refs ────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const textInput   = $('text-input');
const fontSize    = $('font-size');
const fontSizeVal = $('font-size-val');
const inkColor    = $('ink-color');
const inkOpacity  = $('ink-opacity');
const inkOpacityVal = $('ink-opacity-val');
const inkDistortion = $('ink-distortion');
const inkDistortionVal = $('ink-distortion-val');
const paperStyle  = $('paper-style');
const grainSlider = $('grain');
const grainVal    = $('grain-val');
const ambientSlider = $('ambient');
const ambientVal  = $('ambient-val');
const curvature   = $('curvature');
const curvatureVal= $('curvature-val');
const spine       = $('spine');
const spineVal    = $('spine-val');
const rotX        = $('rot-x');
const rotXVal     = $('rot-x-val');
const rotY        = $('rot-y');
const rotYVal     = $('rot-y-val');
const rotZ        = $('rot-z');
const rotZVal     = $('rot-z-val');
const exportRes   = $('export-res');
const btnRender   = $('btn-render');
const btnExport   = $('btn-export');
const viewport    = $('viewport');
const loading     = $('loading');

// ─── Three.js setup ──────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true, // needed for toDataURL() export
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x1a1a1a);
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
camera.position.set(0, 0, 3.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1;
controls.maxDistance = 8;

// ─── Render loop ─────────────────────────────────────────────────────────────
let animId;
function startLoop() {
  cancelAnimationFrame(animId);
  (function loop() {
    animId = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  })();
}

// ─── Resize handling ─────────────────────────────────────────────────────────
const resizeObserver = new ResizeObserver(() => onResize());
resizeObserver.observe(viewport);

function onResize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ─── Texture helpers ─────────────────────────────────────────────────────────
function canvasToTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function normalCanvasToTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  // Normal maps are linear data — no sRGB conversion
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ─── Page state ──────────────────────────────────────────────────────────────
let page = null; // { mesh, updateUniforms, updateTextures }
let diffuseTex = null;
let normalTex  = null;

/** Texture size used for compositing (independent of export resolution) */
const TEXTURE_SIZE = 1024;

// ─── Paper texture configuration ─────────────────────────────────────────────
// To swap textures: drop a new folder into assets/ and update PAPER_FOLDER +
// PAPER_PREFIX below. All URL paths are derived from these two values.
// cc0-textures.com sets follow the pattern: {folder}/{prefix}Color.jpg etc.
const PAPER_FOLDER = 'Paper001_4K-JPG';
const PAPER_PREFIX = 'Paper001_4K_';

const REAL_ALBEDO_URL = `/${PAPER_FOLDER}/${PAPER_PREFIX}Color.jpg`;
const REAL_NORMAL_URL = `/${PAPER_FOLDER}/${PAPER_PREFIX}NormalGL.jpg`;

// Cache the normal canvas — it only changes when the paper source changes
let cachedNormalCanvas = null;
let cachedNormalSource = null; // track which source produced it

/**
 * Resolve the albedo canvas: try the real CC0 texture first,
 * fall back to procedural generation on any load error.
 */
async function resolveAlbedoCanvas() {
  const grain = parseInt(grainSlider.value, 10) / 100;
  try {
    return await loadAlbedoCanvas(REAL_ALBEDO_URL, TEXTURE_SIZE);
  } catch {
    return generateAlbedo(TEXTURE_SIZE, paperStyle.value, grain);
  }
}

/**
 * Resolve the normal canvas: try the real CC0 normal map (OpenGL convention),
 * fall back to Sobel-generated normal map from the albedo canvas.
 * Result is cached between renders (normal map doesn't change with text/ink).
 */
async function resolveNormalCanvas(albedoCanvas) {
  if (cachedNormalSource === 'real' && cachedNormalCanvas) return cachedNormalCanvas;
  try {
    cachedNormalCanvas = await loadNormalCanvas(REAL_NORMAL_URL, TEXTURE_SIZE);
    cachedNormalSource = 'real';
    return cachedNormalCanvas;
  } catch {
    // Sobel is fast; no need to cache
    return generateNormalMap(albedoCanvas);
  }
}

/**
 * (Re-)build the ink+paper texture and push it to the page mesh.
 */
async function buildTexture() {
  loading.classList.remove('hidden');

  // Yield to paint the loading overlay before starting canvas work
  await new Promise((r) => requestAnimationFrame(r));

  // 1. Text layer
  const inkCanvas = renderTextLayer({
    text:       textInput.value || ' ',
    canvasSize: TEXTURE_SIZE,
    fontSize:   parseInt(fontSize.value, 10),
    color:      inkColor.value,
    opacity:    parseInt(inkOpacity.value, 10) / 100,
  });

  // 2. Paper albedo (real CC0 JPG or procedural fallback)
  const albedoCanvas = await resolveAlbedoCanvas();

  // 3. Normal map (real CC0 JPG or Sobel fallback; cached)
  const normalCanvas = await resolveNormalCanvas(albedoCanvas);

  // 4. Composite ink onto paper
  const composited = compositeInkOnPaper(albedoCanvas, inkCanvas);

  // 5. Convert to Three.js textures
  if (diffuseTex) diffuseTex.dispose();
  if (normalTex)  normalTex.dispose();
  diffuseTex = canvasToTexture(composited);
  normalTex  = normalCanvasToTexture(normalCanvas);

  // 6. Push to page
  if (page) {
    page.updateTextures({ diffuse: diffuseTex, normal: normalTex });
  } else {
    page = createPage(scene, { diffuse: diffuseTex, normal: normalTex });
  }

  syncUniforms();
  syncTransform();
  loading.classList.add('hidden');
}

/** Push all slider-driven uniforms to the shader */
function syncUniforms() {
  if (!page) return;
  page.updateUniforms({
    curvature:   parseInt(curvature.value, 10) / 100,
    spineTaper:  parseInt(spine.value, 10) / 100,
    ambient:     parseInt(ambientSlider.value, 10) / 100,
    grain:       parseInt(grainSlider.value, 10) / 100,
    distortion:  parseInt(inkDistortion.value, 10) / 100,
  });
}

/** Apply rotation sliders to the page mesh */
function syncTransform() {
  if (!page) return;
  const toRad = (d) => (d * Math.PI) / 180;
  page.mesh.rotation.x = toRad(parseInt(rotX.value, 10));
  page.mesh.rotation.y = toRad(parseInt(rotY.value, 10));
  page.mesh.rotation.z = toRad(parseInt(rotZ.value, 10));
}

// ─── Slider value labels ─────────────────────────────────────────────────────
function bindLabel(input, label, fmt) {
  input.addEventListener('input', () => { label.textContent = fmt(input.value); });
}

bindLabel(fontSize,   fontSizeVal,    (v) => v);
bindLabel(inkOpacity, inkOpacityVal,  (v) => v + '%');
bindLabel(inkDistortion, inkDistortionVal, (v) => v + '%');
bindLabel(grainSlider,grainVal,       (v) => v + '%');
bindLabel(ambientSlider,ambientVal,   (v) => v + '%');
bindLabel(curvature,  curvatureVal,   (v) => v + '%');
bindLabel(spine,      spineVal,       (v) => v + '%');
bindLabel(rotX,       rotXVal,        (v) => v + '°');
bindLabel(rotY,       rotYVal,        (v) => v + '°');
bindLabel(rotZ,       rotZVal,        (v) => v + '°');

// ─── Live updates (cheap uniforms — no texture rebuild) ───────────────────────
[curvature, spine, ambientSlider, grainSlider, inkDistortion].forEach((el) =>
  el.addEventListener('input', syncUniforms)
);
[rotX, rotY, rotZ].forEach((el) =>
  el.addEventListener('input', syncTransform)
);

// ─── Texture rebuild triggers ─────────────────────────────────────────────────
btnRender.addEventListener('click', buildTexture);

// Auto-rebuild on text/font/paper changes with debounce
let debounceTimer;
function debouncedRebuild() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(buildTexture, 600);
}
[textInput, inkColor].forEach((el) =>
  el.addEventListener('input', debouncedRebuild)
);
// Paper style change: bust the normal cache so the right map is used
paperStyle.addEventListener('change', () => {
  cachedNormalCanvas = null;
  cachedNormalSource = null;
  debouncedRebuild();
});
[fontSize, inkOpacity].forEach((el) =>
  el.addEventListener('change', debouncedRebuild)
);

// ─── Export ──────────────────────────────────────────────────────────────────
btnExport.addEventListener('click', () => {
  const size = parseInt(exportRes.value, 10);
  exportPNG(renderer, scene, camera, size);
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────
onResize();
buildTexture();
startLoop();
