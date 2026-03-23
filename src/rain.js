/**
 * rain.js
 * GPU-efficient rain particle system using a single BufferGeometry
 * and Points primitive. All droplet state lives in typed arrays.
 */

import * as THREE from 'three';
import { Config } from './config.js';

// Raindrop vertex shader — stretches points along fall velocity
const VERT = `
  attribute float size;
  attribute float alpha;
  varying float vAlpha;
  void main() {
    vAlpha = alpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Raindrop fragment shader — soft circular drop
const FRAG = `
  varying float vAlpha;
  void main() {
    // elongated teardrop shape
    vec2 uv = gl_PointCoord - 0.5;
    // squish vertically to make streak-like drop
    float d = length(vec2(uv.x * 1.0, uv.y * 0.35));
    float a = 1.0 - smoothstep(0.1, 0.5, d);
    if (a < 0.01) discard;
    vec3 col = mix(vec3(0.55, 0.72, 0.9), vec3(0.85, 0.92, 1.0), a);
    gl_FragColor = vec4(col, a * vAlpha * 0.55);
  }
`;

export class Rain {
  constructor(scene) {
    this.scene = scene;
    this._count = 0;
    this._geometry = null;
    this._points = null;
    this._mat = null;

    // Per-particle state (not in GPU buffer — CPU side velocity etc.)
    this._vy   = null; // fall speed per drop
    this._life = null; // 0..1 normalised lifetime

    this._build(Config.rain.count);
  }

  _build(count) {
    if (this._points) {
      this.scene.remove(this._points);
      this._geometry.dispose();
    }

    this._count = count;

    const positions = new Float32Array(count * 3);
    const sizes     = new Float32Array(count);
    const alphas    = new Float32Array(count);

    this._vy   = new Float32Array(count);
    this._life = new Float32Array(count);

    const C = Config.rain;

    for (let i = 0; i < count; i++) {
      this._reset(i, positions, sizes, alphas, true);
    }

    this._geometry = new THREE.BufferGeometry();
    this._geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._geometry.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));
    this._geometry.setAttribute('alpha',    new THREE.BufferAttribute(alphas, 1));

    this._mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.NormalBlending,
    });

    this._points = new THREE.Points(this._geometry, this._mat);
    this._points.frustumCulled = false;
    this.scene.add(this._points);
  }

  /** Reset a single drop to a random position at the top of the spawn volume */
  _reset(i, positions, sizes, alphas, randomY = false) {
    const C   = Config.rain;
    const i3  = i * 3;

    positions[i3]     = (Math.random() - 0.5) * C.spawnWidth * 2;
    positions[i3 + 2] = (Math.random() - 0.5) * C.spawnDepth * 2;
    positions[i3 + 1] = randomY
      ? C.groundY + Math.random() * C.spawnHeight
      : C.groundY + C.spawnHeight;

    const baseSpeed = 18 + Math.random() * 12;
    this._vy[i]   = baseSpeed;
    this._life[i] = randomY ? Math.random() : 1.0;

    sizes[i]  = (0.6 + Math.random() * 0.8) * C.size;
    alphas[i] = 0.4 + Math.random() * 0.6;
  }

  update(dt) {
    if (Config.simulation.paused) return;

    const scale = Config.simulation.timeScale;
    const eff   = dt * scale;
    const C     = Config.rain;

    // If count changed, rebuild geometry
    if (C.count !== this._count) {
      this._build(C.count);
      return;
    }

    const pos    = this._geometry.attributes.position.array;
    const sizes  = this._geometry.attributes.size.array;
    const alphas = this._geometry.attributes.alpha.array;

    const fallMult  = C.speed;
    const driftX    = C.drift;
    const groundY   = C.groundY;
    const spawnH    = C.spawnHeight;

    for (let i = 0; i < this._count; i++) {
      const i3 = i * 3;
      pos[i3]     += driftX * eff;
      pos[i3 + 1] -= this._vy[i] * fallMult * eff;

      if (pos[i3 + 1] < groundY) {
        this._reset(i, pos, sizes, alphas, false);
      }
    }

    this._geometry.attributes.position.needsUpdate = true;
    this._geometry.attributes.size.needsUpdate     = true;
  }

  /** Update droplet size multiplier when Config.rain.size changes */
  refreshSizes() {
    const sizes = this._geometry.attributes.size.array;
    const C     = Config.rain;
    for (let i = 0; i < this._count; i++) {
      sizes[i] = (0.6 + Math.random() * 0.8) * C.size;
    }
    this._geometry.attributes.size.needsUpdate = true;
  }

  get dropCount() { return this._count; }
}
