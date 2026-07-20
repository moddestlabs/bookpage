/**
 * page.vert.glsl
 * Displaces a subdivided plane into a book-page curve.
 *
 * Curve model (horizontal axis = u, spine at u=0, outer edge at u=1):
 *  - Primary bend: shallow sine arc across the full width.
 *  - Spine taper:  extra dip near u=0 to simulate the gutter.
 *
 * After displacement, we pass the modified position and the
 * un-displaced normal to the fragment shader for lighting.
 */

uniform float uCurvature;  // 0–1
uniform float uSpineTaper; // 0–1
uniform float uTime;       // unused for now, placeholder for animation

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPos;

void main() {
  vUv = uv;

  // u in [0,1] — horizontal, 0 = spine side, 1 = outer edge
  float u = uv.x;

  // ── Primary arc ──
  // Maps [0,1] → sin(π·u) so both edges are at 0 and the middle rises
  // toward the viewer (positive Z = toward camera).
  float arc = sin(u * 3.14159265) * uCurvature * 0.35;

  // ── Spine taper ──
  // Extra curl toward the viewer near the spine (u≈0), falls off quickly.
  float taper = exp(-u * 6.0) * uSpineTaper * 0.15;

  // Combined Z displacement (positive = toward viewer)
  float dz = arc + taper;

  vec3 displaced = position + vec3(0.0, 0.0, dz);

  vNormal = normalMatrix * normal;
  vViewPos = (modelViewMatrix * vec4(displaced, 1.0)).xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
