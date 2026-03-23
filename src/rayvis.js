/**
 * rayvis.js
 * Educational ray-path visualization through a highlighted water droplet.
 *
 * Traces three rays (Red, Green, Blue) with wavelength-dependent refractive
 * indices to show dispersion.  Each ray follows:
 *   1. Incoming sunlight  →  entry surface
 *   2. Refraction at entry  (Snell's Law, air → water)
 *   3. Internal travel  →  back surface
 *   4. Internal reflection
 *   5. Exit travel  →  front surface
 *   6. Refraction at exit  (Snell's Law, water → air)
 *
 * Impact parameter b/R ≈ 0.86 — the value that produces minimum deviation
 * (~42°) and therefore the primary rainbow for red light.
 */

import * as THREE from 'three';
import { Config } from './config.js';

const DEG = Math.PI / 180;

// Wavelength-dependent refractive indices of water
// (values from standard dispersion tables)
const CHANNELS = [
  { key: 'r', n: 1.3311, color: new THREE.Color(1.00, 0.18, 0.10), label: 'Red   642 nm' },
  { key: 'g', n: 1.3350, color: new THREE.Color(0.10, 0.92, 0.20), label: 'Green 532 nm' },
  { key: 'b', n: 1.3406, color: new THREE.Color(0.15, 0.45, 1.00), label: 'Blue  460 nm' },
];

const DROP_RADIUS      = 5;
const DROP_CENTER      = new THREE.Vector3(0, 28, -18);
const IMPACT_RATIO     = 0.862; // b/R at minimum deviation for n≈1.333
const INCOMING_EXTEND  = 60;    // how far upstream the incoming ray is drawn
const OUTGOING_EXTEND  = 55;    // how far downstream the exit ray is drawn

// ── Geometry math ─────────────────────────────────────────────────────────

function refractDir(I, N, eta) {
  // I: normalized incident direction (pointing toward surface)
  // N: normalized surface normal pointing INTO the incident medium
  // eta: n_incident / n_transmitted
  const cosI = -I.dot(N);                         // = cos(θ_i), must be > 0
  const k    = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;                          // total internal reflection
  return I.clone()
    .multiplyScalar(eta)
    .addScaledVector(N, eta * cosI - Math.sqrt(k))
    .normalize();
}

function reflectDir(I, N_outward) {
  // Reflects I off a surface whose outward normal is N_outward.
  // Works for both external and internal reflection.
  const d = I.dot(N_outward);
  return I.clone().addScaledVector(N_outward, -2 * d).normalize();
}

function sphereHit(ro, rd, center, r) {
  // Returns [t_near, t_far] or null.
  const oc  = ro.clone().sub(center);
  const b   = oc.dot(rd);
  const c   = oc.dot(oc) - r * r;
  const dis = b * b - c;
  if (dis < 0) return null;
  const sq = Math.sqrt(dis);
  return [-b - sq, -b + sq];
}

/**
 * Trace one wavelength through the droplet.
 * Returns { pts: [P0,P_entry,P_back,P_exit,P5], exitAngle }
 * or null if the ray misses or undergoes TIR.
 */
function traceRay(sunDir, n_water) {
  const rayDir = sunDir.clone().negate().normalize();   // sun → droplet

  // Build the impact-parameter offset perpendicular to the ray
  let perp = new THREE.Vector3().crossVectors(rayDir, new THREE.Vector3(0, 1, 0)).normalize();
  if (perp.lengthSq() < 0.01) perp.set(1, 0, 0);

  const b         = DROP_RADIUS * IMPACT_RATIO;
  const rayOrigin = DROP_CENTER.clone()
    .addScaledVector(perp, b)
    .sub(rayDir.clone().multiplyScalar(DROP_RADIUS * 4));

  // ── Entry ──
  const ts_e = sphereHit(rayOrigin, rayDir, DROP_CENTER, DROP_RADIUS);
  if (!ts_e || ts_e[0] < 0) return null;
  const P_e  = rayOrigin.clone().addScaledVector(rayDir, ts_e[0]);
  const N_e  = P_e.clone().sub(DROP_CENTER).normalize();          // outward

  const D_r = refractDir(rayDir, N_e, 1.0 / n_water);             // air→water
  if (!D_r) return null;

  // ── Internal reflection ──
  const ts_b = sphereHit(P_e, D_r, DROP_CENTER, DROP_RADIUS);
  if (!ts_b) return null;
  const t_b  = Math.max(ts_b[0], ts_b[1]);
  if (t_b < 0.001) return null;
  const P_b  = P_e.clone().addScaledVector(D_r, t_b);
  const N_b  = P_b.clone().sub(DROP_CENTER).normalize();
  const D_refl = reflectDir(D_r, N_b);

  // ── Exit ──
  const ts_x = sphereHit(P_b, D_refl, DROP_CENTER, DROP_RADIUS);
  if (!ts_x) return null;
  const t_x  = Math.max(ts_x[0], ts_x[1]);
  if (t_x < 0.001) return null;
  const P_x  = P_b.clone().addScaledVector(D_refl, t_x);
  const N_x  = P_x.clone().sub(DROP_CENTER).normalize();

  // water→air: N pointing INTO water = -N_x
  const D_exit = refractDir(D_refl, N_x.clone().negate(), n_water / 1.0);
  if (!D_exit) return null;

  const P0 = P_e.clone().sub(rayDir.clone().multiplyScalar(INCOMING_EXTEND));
  const P5 = P_x.clone().addScaledVector(D_exit, OUTGOING_EXTEND);

  // Exit angle relative to original ray (deviation from forward direction)
  const exitAngle = Math.acos(
    Math.max(-1, Math.min(1, D_exit.dot(rayDir.clone().negate())))
  ) * (180 / Math.PI);

  return { pts: [P0, P_e, P_b, P_x, P5], exitAngle, D_exit: D_exit.clone() };
}

// ── RayVis class ───────────────────────────────────────────────────────────

export class RayVis {
  constructor(scene) {
    this.scene = scene;

    // ── Demo droplet sphere ──
    const dropGeo = new THREE.SphereGeometry(DROP_RADIUS, 40, 28);
    const dropMat = new THREE.MeshPhongMaterial({
      color:       0x88ccff,
      emissive:    0x112233,
      transparent: true,
      opacity:     0.22,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    this._dropMesh = new THREE.Mesh(dropGeo, dropMat);
    this._dropMesh.position.copy(DROP_CENTER);
    this._dropMesh.renderOrder = 2;
    scene.add(this._dropMesh);

    // Droplet wireframe outline for clarity
    const wireGeo = new THREE.SphereGeometry(DROP_RADIUS, 20, 14);
    const wireMat = new THREE.MeshBasicMaterial({
      color:       0x4499cc,
      wireframe:   true,
      transparent: true,
      opacity:     0.08,
    });
    this._dropWire = new THREE.Mesh(wireGeo, wireMat);
    this._dropWire.position.copy(DROP_CENTER);
    scene.add(this._dropWire);

    // ── Incoming ray (single white line, shared) ──
    this._incomingLine = this._makeLine(0xfffde0, 2);
    scene.add(this._incomingLine);

    // ── Per-channel lines ── (inside segments + outgoing)
    this._channelLines = CHANNELS.map(ch => {
      const inside  = this._makeLine(ch.color.getHex(), 1.5);
      const outgoing = this._makeLine(ch.color.getHex(), 2.5);
      scene.add(inside);
      scene.add(outgoing);
      return { inside, outgoing };
    });

    // ── Marker spheres at key physics points ──
    // entry, 3× back-surface, 3× exit-surface
    this._entryMarker = this._makeMarker(0xffffff, 0.45);
    scene.add(this._entryMarker);

    this._channelMarkers = CHANNELS.map(ch => {
      const back = this._makeMarker(ch.color.getHex(), 0.4);
      const exit = this._makeMarker(ch.color.getHex(), 0.4);
      scene.add(back);
      scene.add(exit);
      return { back, exit };
    });

    // ── Normal indicator lines ──
    this._normalLines = [];
    for (let i = 0; i < 4; i++) {
      const l = this._makeLine(0x888888, 0.8);
      l.material.transparent = true;
      l.material.opacity = 0.5;
      scene.add(l);
      this._normalLines.push(l);
    }

    // Store last traced results for the info panel
    this.lastExitAngles = [null, null, null];

    this._setVisible(false);
  }

  _makeLine(color, linewidth = 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color, linewidth });
    return new THREE.Line(geo, mat);
  }

  _makeMarker(color, r) {
    const geo = new THREE.SphereGeometry(r, 12, 8);
    const mat = new THREE.MeshBasicMaterial({ color });
    return new THREE.Mesh(geo, mat);
  }

  _setLine(line, A, B) {
    const arr = line.geometry.attributes.position.array;
    arr[0] = A.x; arr[1] = A.y; arr[2] = A.z;
    arr[3] = B.x; arr[4] = B.y; arr[5] = B.z;
    line.geometry.attributes.position.needsUpdate = true;
  }

  _setVisible(v) {
    this._dropMesh.visible  = v;
    this._dropWire.visible  = v;
    this._incomingLine.visible = v;
    this._channelLines.forEach(c => { c.inside.visible = v; c.outgoing.visible = v; });
    this._channelMarkers.forEach(c => { c.back.visible = v; c.exit.visible = v; });
    this._entryMarker.visible = v;
    this._normalLines.forEach(l => l.visible = v);
  }

  update(sunDir) {
    const on = Config.overlays.rayPaths;
    this._setVisible(on);
    if (!on) return;

    const results = CHANNELS.map(ch => traceRay(sunDir, ch.n));

    // If any trace failed (e.g. sun is below horizon), hide
    if (results.some(r => r === null)) {
      this._setVisible(false);
      return;
    }

    // ── Incoming ray (all channels share the same entry point — use red) ──
    const r0 = results[0];
    this._setLine(this._incomingLine, r0.pts[0], r0.pts[1]);
    this._entryMarker.position.copy(r0.pts[1]);

    // ── Normal at entry ──
    const N_e = r0.pts[1].clone().sub(DROP_CENTER).normalize();
    this._setLine(this._normalLines[0],
      r0.pts[1].clone().addScaledVector(N_e, -DROP_RADIUS * 0.6),
      r0.pts[1].clone().addScaledVector(N_e,  DROP_RADIUS * 0.6));

    results.forEach((res, i) => {
      const [, P_e, P_b, P_x, P5] = res.pts;
      const cl = this._channelLines[i];
      const cm = this._channelMarkers[i];

      // Inside: entry → back
      this._setLine(cl.inside, P_e, P_b);
      cm.back.position.copy(P_b);

      // Outgoing: exit → far
      this._setLine(cl.outgoing, P_x, P5);
      cm.exit.position.copy(P_x);

      this.lastExitAngles[i] = res.exitAngle;
    });

    // ── Normal at first back surface (red channel) ──
    const N_b0 = results[0].pts[2].clone().sub(DROP_CENTER).normalize();
    this._setLine(this._normalLines[1],
      results[0].pts[2].clone().addScaledVector(N_b0, -DROP_RADIUS * 0.6),
      results[0].pts[2].clone().addScaledVector(N_b0,  DROP_RADIUS * 0.6));

    // Normal at exit (red)
    const N_x0 = results[0].pts[3].clone().sub(DROP_CENTER).normalize();
    this._setLine(this._normalLines[2],
      results[0].pts[3].clone().addScaledVector(N_x0, -DROP_RADIUS * 0.5),
      results[0].pts[3].clone().addScaledVector(N_x0,  DROP_RADIUS * 0.5));
  }
}
