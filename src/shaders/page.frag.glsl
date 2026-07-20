/**
 * page.frag.glsl
 * Normal-map driven lighting pass for realistic ink-on-paper look.
 *
 * Inputs:
 *  - tDiffuse  : composited ink+paper albedo texture
 *  - tNormal   : paper normal map (tangent-space, RGB encoded)
 *  - uLight    : light direction in view space
 *  - uAmbient  : ambient light intensity (0–1)
 *  - uGrain    : paper grain bump strength (0–1)
 *
 * The normal map adds a subtle bump-lighting response so both the paper
 * grain and the ink read as lit by the same light source.
 */

uniform sampler2D tDiffuse;
uniform sampler2D tNormal;
uniform vec3  uLight;       // normalised light direction (view space)
uniform float uAmbient;     // 0–1
uniform float uGrain;       // 0–1, controls normal-map bump contribution
uniform float uDistortion;  // 0–1, ink UV warp by paper grain

varying vec2 vUv;
varying vec3 vNormal;     // geometric normal in view space
varying vec3 vViewPos;

void main() {
  // Decode tangent-space normal from texture: [0,1]→[-1,1]
  vec3 nTangent = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;

  // ── Ink distortion by paper grain ──
  // Ink settles into the paper's grooves as it dries; simulate this by
  // offsetting the diffuse UV in the direction of the local surface slope.
  float distortScale = uDistortion * 0.008;
  vec2 distortedUv = clamp(vUv + vec2(nTangent.x, -nTangent.y) * distortScale,
                           0.0, 1.0);
  vec4 albedo = texture2D(tDiffuse, distortedUv);

  // Blend between geometric normal and texture normal based on grain strength
  vec3 bumpedNormal = normalize(mix(normalize(vNormal),
                                    nTangent,
                                    uGrain * 0.6));

  // Simple diffuse + ambient
  float diff = max(dot(bumpedNormal, normalize(uLight)), 0.0);
  float light = uAmbient + (1.0 - uAmbient) * diff;

  // Specular highlight (very subtle — paper is matte)
  vec3 viewDir = normalize(-vViewPos);
  vec3 halfDir = normalize(normalize(uLight) + viewDir);
  float spec = pow(max(dot(bumpedNormal, halfDir), 0.0), 32.0) * 0.04;

  // Edge vignette from geometry: darken near the spine / outer curves
  float edgeDark = 1.0 - 0.25 * pow(abs(vUv.x - 0.5) * 2.0, 2.5);

  vec3 colour = albedo.rgb * light * edgeDark + vec3(spec);
  gl_FragColor = vec4(clamp(colour, 0.0, 1.0), albedo.a);
}
