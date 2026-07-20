/**
 * exporter.js
 * Renders the scene to an offscreen canvas at the requested export
 * resolution and triggers a PNG download.
 *
 * Three.js preserveDrawingBuffer must be true on the renderer for
 * toDataURL() to work reliably — we handle that in main.js.
 */

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene}         scene
 * @param {THREE.Camera}        camera
 * @param {number}              size   Export pixel size (1024 / 2048 / 4096)
 */
export function exportPNG(renderer, scene, camera, size) {
  // Save original renderer dimensions
  const origW = renderer.domElement.width;
  const origH = renderer.domElement.height;

  // Resize to export resolution, render, capture
  renderer.setSize(size, size, false);
  renderer.render(scene, camera);

  const dataURL = renderer.domElement.toDataURL('image/png');

  // Restore
  renderer.setSize(origW, origH, false);

  // Trigger browser download
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = `bookpage-${Date.now()}.png`;
  a.click();
}
