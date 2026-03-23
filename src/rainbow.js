/**
 * rainbow.js
 * Renders the primary (and optional secondary) rainbow using a full-screen
 * sphere whose fragment shader computes per-pixel angle from the anti-solar
 * direction and maps it to a physically motivated RGB spectrum.
 *
 * Physics:
 *   - Primary rainbow: minimum deviation for red ~42.5°, violet ~40.6°
 *     (one internal reflection inside the droplet)
 *   - Secondary rainbow: red ~51°, violet ~54.5° — colors reversed, dimmer
 *     (two internal reflections)
 *   - Dispersion: each RGB channel peaks at its own characteristic angle;
 *     the separation comes from wavelength-dependent refractive index of water.
 */

import * as THREE from 'three';
import { Config } from './config.js';

const DEG = Math.PI / 180;

// ── Vertex shader ──────────────────────────────────────────────────────────
const VERT = /* glsl */`
  varying vec3 vLocalPos;
  void main() {
    // Pass raw local position; normalize in frag to get view direction.
    // The mesh is translated to camera position each frame, so local space
    // IS camera-relative — exactly what we need for angle computation.
    vLocalPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ── Fragment shader ────────────────────────────────────────────────────────
const FRAG = /* glsl */`
  precision highp float;

  uniform vec3  sunDir;         // normalized direction toward the sun (world)
  uniform float intensity;      // overall brightness
  uniform float dispersion;     // angular spread multiplier
  uniform float showSecondary;  // 0 or 1
  uniform float sunElevSin;     // sin(sun elevation) — used to fade when sun too high
  uniform float rainDensity;    // 0..1 normalized droplet density

  varying vec3 vLocalPos;

  // Gaussian bell centered at 'center' with half-width 'sigma'
  float gauss(float x, float center, float sigma) {
    float d = (x - center) / sigma;
    return exp(-0.5 * d * d);
  }

  void main() {
    vec3 dir = normalize(vLocalPos);

    // Anti-solar direction: the point in the sky directly opposite the sun
    vec3 antiSolar = -sunDir;

    // Angle between view direction and anti-solar direction (degrees)
    float cosA  = clamp(dot(dir, antiSolar), -1.0, 1.0);
    float angle = degrees(acos(cosA));

    // ── Primary rainbow ──────────────────────────────────────────────────
    // Peak angles for R, G, B channels (physically based on water dispersion)
    // Red: 42.5°  Green: 41.5°  Blue: 40.6°
    float sigma_p = 0.38 * dispersion;
    float r_p = gauss(angle, 42.5, sigma_p);
    float g_p = gauss(angle, 41.5, sigma_p);
    float b_p = gauss(angle, 40.6, sigma_p);
    float bright_p = max(max(r_p, g_p), b_p);

    // ── Secondary rainbow ────────────────────────────────────────────────
    // Colors reversed: Red inner (~51°), Violet outer (~54.5°)
    float sigma_s = 0.6 * dispersion;
    float r_s = gauss(angle, 51.0, sigma_s);
    float g_s = gauss(angle, 52.5, sigma_s);
    float b_s = gauss(angle, 54.5, sigma_s);
    float bright_s = max(max(r_s, g_s), b_s);

    // ── Fade conditions ──────────────────────────────────────────────────
    // Rainbow vanishes when sun is above ~42° elevation
    float sunFade = smoothstep(0.72, 0.18, sunElevSin);

    // Only render above the observer's horizon
    float skyFade = smoothstep(0.0, 0.12, dir.y);

    // Scale with rain density (more drops = brighter rainbow)
    float densityBoost = 0.35 + 0.65 * rainDensity;

    float base = intensity * sunFade * skyFade * densityBoost;

    float alpha_p = bright_p * base;
    float alpha_s = bright_s * base * 0.38 * showSecondary;

    float totalAlpha = clamp(alpha_p + alpha_s, 0.0, 1.0);
    if (totalAlpha < 0.003) discard;

    // Final color: additive blend of both arcs
    vec3 color = vec3(r_p, g_p, b_p) * alpha_p
               + vec3(r_s, g_s, b_s) * alpha_s;

    gl_FragColor = vec4(color, totalAlpha);
  }
`;

// ── Rainbow class ──────────────────────────────────────────────────────────
export class Rainbow {
  constructor(scene) {
    this.scene = scene;

    const geo = new THREE.SphereGeometry(500, 64, 32);
    this._mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      side:           THREE.BackSide,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      uniforms: {
        sunDir:        { value: new THREE.Vector3(0, 0.42, -0.91) },
        intensity:     { value: Config.rainbow.intensity },
        dispersion:    { value: Config.rainbow.dispersion },
        showSecondary: { value: 0.0 },
        sunElevSin:    { value: 0.42 },
        rainDensity:   { value: 0.5 },
      },
    });

    this._mesh = new THREE.Mesh(geo, this._mat);
    this._mesh.frustumCulled = false;
    this._mesh.renderOrder   = 1;
    this._mesh.visible       = Config.rainbow.enabled;
    scene.add(this._mesh);

    this._sunDir  = new THREE.Vector3();
    this._camDir  = new THREE.Vector3();
    this._visibility = 0;
  }

  update(camera) {
    this._mesh.visible = Config.rainbow.enabled;
    if (!Config.rainbow.enabled) { this._visibility = 0; return; }

    // Compute sun world direction from azimuth + elevation
    const az = Config.sun.azimuth   * DEG;
    const el = Config.sun.elevation * DEG;
    const sx =  Math.cos(el) * Math.sin(az);
    const sy =  Math.sin(el);
    const sz =  Math.cos(el) * Math.cos(az);
    this._sunDir.set(sx, sy, sz).normalize();

    // Update shader uniforms
    const u = this._mat.uniforms;
    u.sunDir.value.copy(this._sunDir);
    u.intensity.value     = Config.rainbow.intensity;
    u.dispersion.value    = Config.rainbow.dispersion;
    u.showSecondary.value = Config.rainbow.showSecondary ? 1.0 : 0.0;
    u.sunElevSin.value    = sy;
    u.rainDensity.value   = Math.min(1, Config.rain.count / 15000);

    // The sphere must be centered on the camera so angular relationships
    // are always computed relative to the observer.
    this._mesh.position.copy(camera.position);

    // ── Compute visibility score (used by Celso) ──
    camera.getWorldDirection(this._camDir);
    const antiSolar  = this._sunDir.clone().negate();
    const cosA       = Math.max(-1, Math.min(1, this._camDir.dot(antiSolar)));
    const angleDeg   = Math.acos(cosA) * (180 / Math.PI);

    // Good visibility: looking within ~50° of anti-solar, sun below 42°
    const lookFactor = Math.max(0, 1 - angleDeg / 50);
    const sunFactor  = Math.max(0, 1 - sy / 0.68);
    this._visibility = lookFactor * sunFactor * Config.rainbow.intensity
                     * Math.min(1, Config.rain.count / 8000);
  }

  /** 0 = invisible, 1 = fully visible from current viewpoint */
  get visibility() { return this._visibility; }
}
