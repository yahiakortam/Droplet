/**
 * sun.js
 * Physically-inspired sun rendering:
 *   • Limb-darkening disc with blazing bloom core
 *   • Five stacked additive glow halos (HDR feel)
 *   • Twelve slowly-rotating diffraction-spike rays
 *   • Five screen-space lens-flare artefacts
 *   • Elevation-driven directional + hemisphere light colour
 *   • PCF soft shadows from the directional light
 */

import * as THREE from 'three';
import { Config } from './config.js';

const DEG = Math.PI / 180;

// ── Shared vertex shader ──────────────────────────────────────────────────────
const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ── Sun disc: limb-darkening + bloom ─────────────────────────────────────────
const DISC_FRAG = /* glsl */`
  uniform vec3  uInner;
  uniform vec3  uOuter;
  uniform float uTime;
  varying vec2  vUv;

  void main() {
    vec2  c = vUv - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;

    // Physical limb-darkening: I(μ) ≈ 1 - u(1-μ),  u ≈ 0.6
    float mu   = sqrt(max(0.0, 1.0 - d * d));
    float limb = 1.0 - 0.62 * (1.0 - mu);

    // Colour ramp core → edge
    vec3 col = mix(uInner, uOuter, smoothstep(0.0, 0.88, d));

    // Blazing over-bright core
    col += vec3(1.0, 0.97, 0.88) * pow(1.0 - d, 5.5) * 7.0;

    // Subtle solar granulation shimmer
    float g = sin(uTime * 2.2 + d * 41.0) * cos(uTime * 1.1 + d * 27.0);
    col *= limb * (1.0 + g * 0.014);

    gl_FragColor = vec4(col, limb);
  }
`;

// ── Radial glow halo ──────────────────────────────────────────────────────────
const GLOW_FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uExp;
  varying vec2  vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float g = pow(1.0 - d, uExp);
    gl_FragColor = vec4(uColor * g, g * uOpacity);
  }
`;

// ── Diffraction-spike ray ─────────────────────────────────────────────────────
const RAY_FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform float uOpacity;
  varying vec2  vUv;

  void main() {
    float xf = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float yf = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 2.4);
    float a  = xf * xf * yf * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

// ── Lens-flare spot ───────────────────────────────────────────────────────────
const FLARE_FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform float uOpacity;
  varying vec2  vUv;

  void main() {
    float d    = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = pow(1.0 - d, 3.8) * uOpacity;
    float ring = smoothstep(0.62, 0.50, d) * smoothstep(0.92, 0.80, d) * uOpacity * 0.45;
    float a    = core + ring;
    gl_FragColor = vec4(uColor, a);
  }
`;

// ── Material factory ─────────────────────────────────────────────────────────
function mat(frag, uniforms, additive = false) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader:   VERT,
    fragmentShader: frag,
    transparent:    true,
    blending:       additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite:     false,
    depthTest:      false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
export class Sun {
  constructor(scene) {
    this.scene = scene;
    this._time = 0;
    this._pos  = new THREE.Vector3();
    this._sunV = new THREE.Vector3(); // sun in view-space (reused)
    this._tmp  = new THREE.Vector3(); // scratch

    // ── Directional light with PCF soft shadows ────────────────────────────
    this.light = new THREE.DirectionalLight(0xfffaed, Config.sun.intensity);
    this.light.castShadow               = true;
    this.light.shadow.mapSize.width     = 1024;
    this.light.shadow.mapSize.height    = 1024;
    this.light.shadow.camera.near       = 1;
    this.light.shadow.camera.far        = 800;
    this.light.shadow.camera.left       = -200;
    this.light.shadow.camera.right      =  200;
    this.light.shadow.camera.top        =  200;
    this.light.shadow.camera.bottom     = -200;
    this.light.shadow.bias              = -0.0018;
    this.light.shadow.normalBias        = 0.025;
    scene.add(this.light);

    // ── Hemisphere ambient ────────────────────────────────────────────────
    this.hemi = new THREE.HemisphereLight(0x88aacc, 0x334422, 0.45);
    scene.add(this.hemi);

    // ── Sun billboard group (quaternion-copies camera each frame) ─────────
    this.sunGroup = new THREE.Group();
    scene.add(this.sunGroup);

    // Disc
    this._discU = {
      uInner: { value: new THREE.Color(0xffffff) },
      uOuter: { value: new THREE.Color(0xffe050) },
      uTime:  { value: 0 },
    };
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(7, 64),
      mat(DISC_FRAG, this._discU)
    );
    disc.renderOrder = 12;
    this.sunGroup.add(disc);

    // Glow halos (additive, stacked for HDR-like overbright)
    [
      { r: 13,  col: 0xffffcc, op: 0.65, exp: 2.8 },
      { r: 25,  col: 0xffee88, op: 0.35, exp: 2.2 },
      { r: 45,  col: 0xff9933, op: 0.18, exp: 1.8 },
      { r: 80,  col: 0xff6600, op: 0.08, exp: 1.4 },
      { r: 130, col: 0xff8833, op: 0.028, exp: 1.1 },
    ].forEach(({ r, col, op, exp }) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(r * 2, r * 2),
        mat(GLOW_FRAG, {
          uColor:   { value: new THREE.Color(col) },
          uOpacity: { value: op },
          uExp:     { value: exp },
        }, true)
      );
      m.renderOrder = 10;
      this.sunGroup.add(m);
    });

    // Diffraction spikes (12 slowly counter-rotating pairs)
    const rayMat = mat(RAY_FRAG, {
      uColor:   { value: new THREE.Color(0xffffee) },
      uOpacity: { value: 0.22 },
    }, true);
    this._rays = [];
    for (let i = 0; i < 12; i++) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 100), rayMat);
      r.rotation.z = (i / 12) * Math.PI * 2;
      r.renderOrder = 10;
      this.sunGroup.add(r);
      this._rays.push(r);
    }

    // ── Lens-flare spots (positioned in world-space each frame) ───────────
    const FLARE_DEF = [
      { t: 0.30, r: 5,  col: 0x4466ff, op: 0.30 },
      { t: 0.60, r: 3,  col: 0xff8833, op: 0.38 },
      { t: 1.00, r: 9,  col: 0xaaccff, op: 0.20 },
      { t: 1.40, r: 4,  col: 0xff44cc, op: 0.22 },
      { t: 1.80, r: 12, col: 0xffffff, op: 0.10 },
    ];
    this._flares = FLARE_DEF.map(({ t, r, col, op }) => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(r, 32),
        mat(FLARE_FRAG, {
          uColor:   { value: new THREE.Color(col) },
          uOpacity: { value: op },
        }, true)
      );
      m.renderOrder = 11;
      m.visible       = false;
      m.userData.t    = t;
      m.userData.base = op;
      scene.add(m);
      return m;
    });

    this.update();
  }

  _computePosition() {
    const az = Config.sun.azimuth   * DEG;
    const el = Config.sun.elevation * DEG;
    const r  = Config.sun.distance;
    this._pos.set(
      r * Math.cos(el) * Math.sin(az),
      r * Math.sin(el),
      r * Math.cos(el) * Math.cos(az),
    );
    return this._pos;
  }

  /**
   * @param {THREE.Camera} [camera]  — required for billboard + lens flare
   * @param {number}       [dt]      — seconds since last frame
   */
  update(camera = null, dt = 0) {
    const pos  = this._computePosition();
    this._time += dt;

    // Position lights
    this.light.position.copy(pos);
    this.light.intensity = Config.sun.intensity;

    // Billboard sun group
    this.sunGroup.position.copy(pos);
    if (camera) this.sunGroup.quaternion.copy(camera.quaternion);

    // Shader time + slow ray rotation
    this._discU.uTime.value = this._time;
    if (dt > 0) {
      this._rays.forEach((r, i) =>
        r.rotation.z += (i % 2 === 0 ? 1 : -1) * dt * 0.055
      );
    }

    // ── Elevation-based lighting ──────────────────────────────────────────
    const elev  = Config.sun.elevation;
    const t     = Math.max(0, Math.min(1, elev / 90));   // 0=horizon, 1=zenith
    const low   = Math.max(0, 1 - elev / 30);            // 1 at horizon, 0 at 30°+

    // Directional: orange-gold at sunrise, bright warm white at noon
    this.light.color.setHSL(
      0.12 - low * 0.07,        // hue: 0.05 (orange) at horizon → 0.12 (yellow-white) at noon
      0.85 - t * 0.50,          // saturation drops as sun rises
      0.65 + t * 0.30           // brighter at zenith
    );

    // Disc outer colour: deep red-orange at dawn → golden at noon
    this._discU.uOuter.value.setHSL(
      0.10 - low * 0.10,
      0.98,
      0.50 + t * 0.12
    );

    // Hemisphere: warm pink-orange sky at sunrise → deep blue at noon
    this.hemi.color.setHSL(
      0.62 - low * 0.20,
      0.65 - low * 0.35,
      0.30 + t * 0.38
    );
    this.hemi.groundColor.setHSL(
      0.10 + low * 0.04,
      0.40,
      0.18 + t * 0.18
    );

    // ── Lens flare ────────────────────────────────────────────────────────
    if (!camera) return;

    // Sun in view space — negative z = in front of camera
    this._sunV.copy(pos).applyMatrix4(camera.matrixWorldInverse);
    const inFront = this._sunV.z < 0;
    const alpha   = inFront ? Math.min(1, Math.max(0, (elev - 2) / 8)) : 0;

    this._flares.forEach(fl => {
      if (alpha < 0.01) { fl.visible = false; return; }
      fl.visible = true;

      // Place along the view-space axis: sun → screen centre
      const vx = this._sunV.x + (-this._sunV.x) * fl.userData.t;
      const vy = this._sunV.y + (-this._sunV.y) * fl.userData.t;

      this._tmp.set(vx, vy, this._sunV.z).applyMatrix4(camera.matrixWorld);
      fl.position.copy(this._tmp);
      fl.quaternion.copy(camera.quaternion);
      fl.material.uniforms.uOpacity.value = fl.userData.base * alpha;
    });
  }
}
