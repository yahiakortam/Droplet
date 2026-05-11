/**
 * scene.js
 * Sets up the Three.js scene: sky gradient, ground plane, ambient fog.
 */

import * as THREE from 'three';
import { buildTerrainMesh } from './terrain.js';

export function createScene() {
  const scene = new THREE.Scene();

  // Atmospheric fog — gives depth and haze to the rain field
  scene.fog = new THREE.FogExp2(0x9ab8d8, 0.0025);

  // ── Sky background using a large sphere with a gradient shader ──
  const skyGeo = new THREE.SphereGeometry(900, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:    { value: new THREE.Color(0x1a3a6e) },
      bottomColor: { value: new THREE.Color(0x9ab8d8) },
      horizonColor:{ value: new THREE.Color(0xc8ddf5) },
      offset:      { value: 0.35 },
      exponent:    { value: 0.55 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 horizonColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        // blend: below horizon -> bottom, near horizon -> horizon, above -> top
        float t = max(h, 0.0);
        float blend = pow(t, exponent);
        vec3 col = mix(horizonColor, topColor, blend);
        // darken below horizon
        float below = clamp(-h * 4.0, 0.0, 1.0);
        col = mix(col, bottomColor, below);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // ── Terrain mesh (rolling hills) ──
  scene.add(buildTerrainMesh());

  // ── Ambient light ──
  const ambient = new THREE.AmbientLight(0x6688aa, 0.5);
  scene.add(ambient);

  return scene;
}
