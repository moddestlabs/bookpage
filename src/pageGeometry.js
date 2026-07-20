/**
 * pageGeometry.js
 * Builds and updates the Three.js ShaderMaterial + PlaneGeometry
 * that represents the curved book page.
 *
 * Exports:
 *  - createPage(scene, textures)  → { mesh, updateUniforms(opts) }
 */

import * as THREE from 'three';
import vertSrc from './shaders/page.vert.glsl?raw';
import fragSrc from './shaders/page.frag.glsl?raw';

/** Plane segment count — enough to bend smoothly at max curvature */
const SEGMENTS = 96;

/** Aspect ratio: width / height of the page (A4-ish) */
const PAGE_W = 1.4;
const PAGE_H = 2.0;

/**
 * @param {THREE.Scene} scene
 * @param {{ diffuse: THREE.Texture, normal: THREE.Texture }} textures
 * @returns {{ mesh: THREE.Mesh, updateUniforms: Function, updateTextures: Function }}
 */
export function createPage(scene, textures) {
  const geometry = new THREE.PlaneGeometry(
    PAGE_W, PAGE_H,
    SEGMENTS, SEGMENTS,
  );

  // Light direction: upper-left, slightly in front of the page
  const lightDir = new THREE.Vector3(0.4, 0.6, 1.0).normalize();

  const material = new THREE.ShaderMaterial({
    vertexShader: vertSrc,
    fragmentShader: fragSrc,
    uniforms: {
      tDiffuse: { value: textures.diffuse },
      tNormal:  { value: textures.normal  },
      uLight:   { value: lightDir },
      uAmbient:    { value: 0.4  },
      uGrain:      { value: 0.55 },
      uDistortion: { value: 0.5  },
      uCurvature:  { value: 0.4  },
      uSpineTaper: { value: 0.3  },
      uTime:       { value: 0.0  },
    },
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  /** Update shader uniforms from UI parameters */
  function updateUniforms({ curvature, spineTaper, ambient, grain, distortion }) {
    if (curvature   !== undefined) material.uniforms.uCurvature.value   = curvature;
    if (spineTaper  !== undefined) material.uniforms.uSpineTaper.value  = spineTaper;
    if (ambient     !== undefined) material.uniforms.uAmbient.value     = ambient;
    if (grain       !== undefined) material.uniforms.uGrain.value       = grain;
    if (distortion  !== undefined) material.uniforms.uDistortion.value  = distortion;
  }

  /** Hot-swap diffuse/normal textures when user changes paper or text */
  function updateTextures({ diffuse, normal } = {}) {
    if (diffuse) material.uniforms.tDiffuse.value = diffuse;
    if (normal)  material.uniforms.tNormal.value  = normal;
  }

  return { mesh, updateUniforms, updateTextures };
}
