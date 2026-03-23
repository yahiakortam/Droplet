/**
 * overlays.js
 * Educational overlays:
 *
 *   AngleOverlay — A rainbow-colored ring at exactly 42° from the anti-solar
 *   point as seen from the camera.  Shows the geometric "cone" of directions
 *   from which primary rainbow light reaches the observer.  The ring is
 *   a large circle in 3D that always follows the camera position.
 */

import * as THREE from 'three';
import { Config } from './config.js';

const DEG  = Math.PI / 180;
const SEGS = 180;         // line segments in the ring
const RING_DIST = 280;    // distance to the ring center from camera (units)
const RING_ANGLE = 42.0;  // primary rainbow angle (degrees from anti-solar)

// Smooth spectrum from violet (t=0) to red (t=1)
function spectrumColor(t) {
  t = Math.max(0, Math.min(1, t));
  const idx = t * 6;
  const f   = idx % 1;
  const s   = Math.floor(idx);
  const STOPS = [
    [0.56, 0.00, 1.00],  // violet
    [0.00, 0.00, 1.00],  // blue
    [0.00, 0.70, 1.00],  // cyan
    [0.00, 1.00, 0.00],  // green
    [1.00, 1.00, 0.00],  // yellow
    [1.00, 0.45, 0.00],  // orange
    [1.00, 0.00, 0.00],  // red
  ];
  const a = STOPS[Math.min(s,     6)];
  const b = STOPS[Math.min(s + 1, 6)];
  return new THREE.Color(
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  );
}

// ── AngleOverlay ───────────────────────────────────────────────────────────

export class AngleOverlay {
  constructor(scene) {
    this.scene = scene;

    // Build a LineLoop geometry with per-vertex colors
    const pts    = new Float32Array(SEGS * 3);
    const colors = new Float32Array(SEGS * 3);

    // Fill temporary placeholder positions (updated each frame)
    for (let i = 0; i < SEGS; i++) {
      const col = spectrumColor(i / SEGS);  // violet → red around the ring
      colors[i * 3]     = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    this._geo = new THREE.BufferGeometry();
    this._geo.setAttribute('position', new THREE.BufferAttribute(pts,    3));
    this._geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent:  true,
      opacity:      0.75,
      depthWrite:   false,
      linewidth:    1,  // WebGL1 linewidth capped at 1 on most systems
    });

    this._ring = new THREE.LineLoop(this._geo, mat);
    this._ring.frustumCulled = false;
    this._ring.renderOrder   = 2;
    scene.add(this._ring);

    // Anti-solar axis marker: small cross at the anti-solar direction
    this._axisMesh = this._buildAxisMarker();
    scene.add(this._axisMesh);

    // Dashed line from camera toward anti-solar
    const axGeo = new THREE.BufferGeometry();
    axGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this._axisLine = new THREE.Line(axGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
    this._axisLine.frustumCulled = false;
    scene.add(this._axisLine);

    this._u = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._antiSolar = new THREE.Vector3();
  }

  _buildAxisMarker() {
    // Small star shape at anti-solar point
    const pts  = [];
    const size = 5;
    for (let i = 0; i < 6; i++) {
      const a = (i * 60) * DEG;
      pts.push(0, 0, 0);
      pts.push(Math.cos(a) * size, Math.sin(a) * size, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    return new THREE.LineSegments(geo,
      new THREE.LineBasicMaterial({ color: 0xffeebb, transparent: true, opacity: 0.5 }));
  }

  _setAxisLine(A, B) {
    const arr = this._axisLine.geometry.attributes.position.array;
    arr[0]=A.x; arr[1]=A.y; arr[2]=A.z;
    arr[3]=B.x; arr[4]=B.y; arr[5]=B.z;
    this._axisLine.geometry.attributes.position.needsUpdate = true;
  }

  update(camera) {
    const on = Config.overlays.angleRing;
    this._ring.visible     = on;
    this._axisMesh.visible = on;
    this._axisLine.visible = on;
    if (!on) return;

    // Sun direction
    const az = Config.sun.azimuth   * DEG;
    const el = Config.sun.elevation * DEG;
    this._antiSolar.set(
      -Math.cos(el) * Math.sin(az),
      -Math.sin(el),
      -Math.cos(el) * Math.cos(az),
    ).normalize();

    // Build orthonormal basis perpendicular to anti-solar direction
    const worldUp = new THREE.Vector3(0, 1, 0);
    this._u.crossVectors(this._antiSolar, worldUp).normalize();
    if (this._u.lengthSq() < 0.01) {
      this._u.set(1, 0, 0);
    }
    this._v.crossVectors(this._u, this._antiSolar).normalize();

    // Ring center and radius in 3D
    const cosA = Math.cos(RING_ANGLE * DEG);
    const sinA = Math.sin(RING_ANGLE * DEG);
    const center3 = camera.position.clone().addScaledVector(this._antiSolar, RING_DIST * cosA);
    const ringR   = RING_DIST * sinA;

    // Build ring vertices
    const posArr = this._geo.attributes.position.array;
    for (let i = 0; i < SEGS; i++) {
      const a   = (i / SEGS) * Math.PI * 2;
      const pt  = center3.clone()
        .addScaledVector(this._u, Math.cos(a) * ringR)
        .addScaledVector(this._v, Math.sin(a) * ringR);
      posArr[i * 3]     = pt.x;
      posArr[i * 3 + 1] = pt.y;
      posArr[i * 3 + 2] = pt.z;
    }
    this._geo.attributes.position.needsUpdate = true;

    // Axis marker: place at anti-solar point on the ring sphere
    const axisPt = camera.position.clone().addScaledVector(this._antiSolar, RING_DIST);
    this._axisMesh.position.copy(axisPt);
    // Orient the marker to face camera
    this._axisMesh.lookAt(camera.position);

    // Axis line: from camera slightly toward anti-solar
    this._setAxisLine(
      camera.position.clone().addScaledVector(this._antiSolar, 15),
      camera.position.clone().addScaledVector(this._antiSolar, RING_DIST * 0.92),
    );

    // Fade ring below horizon
    const opacity = Config.sun.elevation < 42 ? 0.75 : 0.2;
    this._ring.material.opacity = opacity;
  }
}
