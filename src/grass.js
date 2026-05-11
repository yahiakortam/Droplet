/**
 * grass.js
 * Fortnite-style dense grass field: 50k crossed-quad blade clumps, each
 * animated by a wind shader that propagates a spatial wave across the field.
 */

import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

const BLADE_COUNT  = 15000;
const FIELD_HALF   = 220;     // half-extent of grass patch (matches rain zone)
const HEIGHT_MIN   = 0.7;
const HEIGHT_MAX   = 1.9;
const BLADE_WIDTH  = 0.22;
const SEGS         = 4;       // quad segments per strip

// Each blade = 2 crossing strips at 90°
// Verts per blade:  (SEGS+1) * 2 * 2 = 20
// Tris  per blade:  SEGS * 2 * 2     = 16
const VERTS = (SEGS + 1) * 2 * 2;
const TRIS  = SEGS * 2 * 2;

/* ── Vertex shader ─────────────────────────────────────────────────────────── */
const VERT = /* glsl */`
  uniform float uTime;
  uniform vec2  uWindDir;
  uniform float uWindStrength;

  attribute vec3  aColor;
  attribute float aHeight;   // 0 = base, 1 = tip  (normalized along blade)
  attribute float aPhase;    // per-blade spatial phase for wave propagation

  varying vec3  vColor;
  varying float vHeight;

  void main() {
    vColor  = aColor;
    vHeight = aHeight;

    vec3 pos = position;

    // Wind amplitude grows quadratically toward tip (base is anchored)
    float amp   = uWindStrength * aHeight * aHeight;

    // Two overlapping sine frequencies → organic, non-mechanical sway
    float t     = uTime * 1.7 + aPhase;
    float sway  = sin(t)              * amp
                + sin(t * 2.13 + 1.4) * amp * 0.28;

    pos.x += uWindDir.x * sway;
    pos.z += uWindDir.y * sway;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/* ── Fragment shader ───────────────────────────────────────────────────────── */
const FRAG = /* glsl */`
  varying vec3  vColor;
  varying float vHeight;

  void main() {
    vec3 col = vColor;

    // Tip brightening: shift toward warm yellow-green at top
    col = mix(col, col * vec3(1.35, 1.45, 0.65), vHeight * vHeight * 0.7);

    // Ambient occlusion darkening at the base
    float ao = mix(0.60, 1.0, smoothstep(0.0, 0.35, vHeight));
    col *= ao;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ── Grass class ───────────────────────────────────────────────────────────── */
export class Grass {
  constructor(scene) {
    const positions = new Float32Array(BLADE_COUNT * VERTS * 3);
    const aColor    = new Float32Array(BLADE_COUNT * VERTS * 3);
    const aHeight   = new Float32Array(BLADE_COUNT * VERTS);
    const aPhase    = new Float32Array(BLADE_COUNT * VERTS);
    const indices   = new Uint32Array(BLADE_COUNT * TRIS * 3);

    for (let b = 0; b < BLADE_COUNT; b++) {
      // Random blade properties
      const bx    = (Math.random() * 2 - 1) * FIELD_HALF;
      const bz    = (Math.random() * 2 - 1) * FIELD_HALF;
      const by    = terrainHeight(bx, bz);
      const h     = HEIGHT_MIN + Math.random() * (HEIGHT_MAX - HEIGHT_MIN);

      // Spatial phase: nearby blades share similar phase → visible wave
      const phase = bx * 0.48 + bz * 0.31 + (Math.random() - 0.5) * 0.9;

      // Per-blade color variation: range of vivid greens
      const gr = 0.30 + Math.random() * 0.20;   // green channel (dominant)
      const rr = 0.07 + Math.random() * 0.08;   // slight red
      const bl = 0.02 + Math.random() * 0.03;   // near-zero blue

      const vBase = b * VERTS;
      const iBase = b * TRIS * 3;

      // Two crossing strips (0° and 90°) for 3-D silhouette
      for (let strip = 0; strip < 2; strip++) {
        const angle = strip * Math.PI * 0.5;
        const cosA  = Math.cos(angle);
        const sinA  = Math.sin(angle);

        const sv = vBase + strip * (SEGS + 1) * 2;   // vertex start for this strip
        const si = iBase + strip * SEGS * 2 * 3;     // index  start for this strip

        for (let s = 0; s <= SEGS; s++) {
          const t  = s / SEGS;                        // 0 = base, 1 = tip
          const y  = t * h;
          const w  = BLADE_WIDTH * (1 - t * 0.88);   // tapers to a point
          const hw = w * 0.5;

          // Rotate the blade's local ±hw offset by strip angle around Y
          const lx = -hw * cosA,  lz = -hw * sinA;
          const rx =  hw * cosA,  rz =  hw * sinA;

          const li = sv + s * 2;       // left vertex index
          const ri = sv + s * 2 + 1;  // right vertex index

          positions[li * 3]     = bx + lx;
          positions[li * 3 + 1] = by + y;
          positions[li * 3 + 2] = bz + lz;

          positions[ri * 3]     = bx + rx;
          positions[ri * 3 + 1] = by + y;
          positions[ri * 3 + 2] = bz + rz;

          aHeight[li] = t;
          aHeight[ri] = t;
          aPhase[li]  = phase;
          aPhase[ri]  = phase;

          // Color gradient: lighter at base → brighter at tip
          const bright = 0.50 + t * 0.50;
          aColor[li * 3]     = rr * bright;
          aColor[li * 3 + 1] = gr * bright;
          aColor[li * 3 + 2] = bl * bright;
          aColor[ri * 3]     = rr * bright;
          aColor[ri * 3 + 1] = gr * bright;
          aColor[ri * 3 + 2] = bl * bright;

          if (s < SEGS) {
            const ii = si + s * 6;
            indices[ii]     = li;
            indices[ii + 1] = ri;
            indices[ii + 2] = li + 2;
            indices[ii + 3] = ri;
            indices[ii + 4] = ri + 2;
            indices[ii + 5] = li + 2;
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(aColor,    3));
    geo.setAttribute('aHeight',  new THREE.BufferAttribute(aHeight,   1));
    geo.setAttribute('aPhase',   new THREE.BufferAttribute(aPhase,    1));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    this.uniforms = {
      uTime:         { value: 0 },
      uWindDir:      { value: new THREE.Vector2(1, 0.15).normalize() },
      uWindStrength: { value: 0.55 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms:       this.uniforms,
      vertexShader:   VERT,
      fragmentShader: FRAG,
      side:           THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(dt, windDrift = 0) {
    this.uniforms.uTime.value += dt;

    // Wind strength: base 0.55, boosted by rain drift
    const strength = Math.min(0.55 + Math.abs(windDrift) * 0.12, 1.6);
    this.uniforms.uWindStrength.value = strength;

    // Wind direction follows rain drift (x) with a slight z component
    const dx = windDrift !== 0 ? Math.sign(windDrift) : 1;
    this.uniforms.uWindDir.value.set(dx, 0.15).normalize();
  }
}
