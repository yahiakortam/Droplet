/**
 * camera.js
 * Full camera controller:
 *   - Orbit (left mouse drag)
 *   - Pan   (right / middle drag)
 *   - Zoom  (scroll wheel)
 *   - WASD + Q/E free-fly
 *   - Smooth tweened transitions to named presets
 */

import * as THREE from 'three';
import { Config } from './config.js';

const DEG = Math.PI / 180;

function smoothstep(t) { return t * t * (3 - 2 * t); }

// ── Named presets ──────────────────────────────────────────────────────────
export const PRESETS = {
  'Rainbow View': {
    theta:  Math.PI,        // facing -Z (into the scene, sun behind)
    phi:    72 * DEG,
    radius: 90,
    target: { x: 0, y: 20, z: 0 },
  },
  'Side View': {
    theta:  Math.PI / 2,
    phi:    72 * DEG,
    radius: 130,
    target: { x: 0, y: 20, z: -20 },
  },
  'Aerial': {
    theta:  Math.PI,
    phi:    25 * DEG,
    radius: 180,
    target: { x: 0, y: 10, z: 0 },
  },
  'Drop Close-Up': {
    theta:  Math.PI * 1.05,
    phi:    80 * DEG,
    radius: 22,
    target: { x: 0, y: 28, z: -18 },
  },
};

export class CameraController {
  constructor(camera, domElement) {
    this.camera     = camera;
    this.domElement = domElement;

    this.target = new THREE.Vector3(
      Config.camera.initialTarget.x,
      Config.camera.initialTarget.y,
      Config.camera.initialTarget.z,
    );
    this.theta  = Math.PI;
    this.phi    = 75 * DEG;
    this.radius = 90;

    this._keys      = {};
    this._flySpeed  = 30;
    this._mouse     = { x: 0, y: 0, buttons: 0 };
    this._dragging  = false;
    this._tween     = null;

    this._bindEvents();
    this._applySpherical();
  }

  _bindEvents() {
    const el = this.domElement;
    el.addEventListener('mousedown',   this._onMouseDown.bind(this));
    el.addEventListener('mousemove',   this._onMouseMove.bind(this));
    el.addEventListener('mouseup',     this._onMouseUp.bind(this));
    el.addEventListener('wheel',       this._onWheel.bind(this), { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', e => { this._keys[e.code] = true; });
    window.addEventListener('keyup',   e => { this._keys[e.code] = false; });
  }

  _onMouseDown(e) {
    this._dragging = true;
    this._mouse.x  = e.clientX;
    this._mouse.y  = e.clientY;
    this._mouse.buttons = e.buttons;
    this._tween    = null;  // cancel any active tween on user interaction
  }

  _onMouseUp()  { this._dragging = false; }

  _onMouseMove(e) {
    if (!this._dragging) return;
    const dx = e.clientX - this._mouse.x;
    const dy = e.clientY - this._mouse.y;
    this._mouse.x = e.clientX;
    this._mouse.y = e.clientY;

    if (this._mouse.buttons === 1) {
      this.theta -= dx * 0.005;
      this.phi    = Math.max(2 * DEG, Math.min(178 * DEG, this.phi + dy * 0.005));
    } else if (this._mouse.buttons === 2 || this._mouse.buttons === 4) {
      const dir   = new THREE.Vector3();
      const right = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      right.crossVectors(dir, this.camera.up).normalize();
      const s = this.radius * 0.001;
      this.target.addScaledVector(right,        -dx * s);
      this.target.addScaledVector(this.camera.up, dy * s);
    }
  }

  _onWheel(e) {
    e.preventDefault();
    this._tween = null;
    const delta = e.deltaY > 0 ? 1.08 : 0.92;
    this.radius = Math.max(5, Math.min(600, this.radius * delta));
  }

  _applySpherical() {
    const sp = Math.sin(this.phi);
    const cp = Math.cos(this.phi);
    this.camera.position.copy(this.target).add(new THREE.Vector3(
      this.radius * sp * Math.sin(this.theta),
      this.radius * cp,
      this.radius * sp * Math.cos(this.theta),
    ));
    this.camera.lookAt(this.target);
  }

  _processKeys(dt) {
    const k   = this._keys;
    const spd = this._flySpeed * dt;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const right = new THREE.Vector3().crossVectors(dir, this.camera.up).normalize();

    if (k['KeyW'] || k['ArrowUp'])    { this.target.addScaledVector(dir,    spd); this._tween = null; }
    if (k['KeyS'] || k['ArrowDown'])  { this.target.addScaledVector(dir,   -spd); this._tween = null; }
    if (k['KeyA'] || k['ArrowLeft'])  { this.target.addScaledVector(right, -spd); this._tween = null; }
    if (k['KeyD'] || k['ArrowRight']) { this.target.addScaledVector(right,  spd); this._tween = null; }
    if (k['KeyQ'])                    { this.target.y -= spd;                      this._tween = null; }
    if (k['KeyE'])                    { this.target.y += spd;                      this._tween = null; }
  }

  /** Smoothly transition to a named preset or arbitrary state. */
  tweenTo(preset, duration = 1.6) {
    const p = typeof preset === 'string' ? PRESETS[preset] : preset;
    if (!p) return;
    this._tween = {
      startTheta:  this.theta,
      startPhi:    this.phi,
      startRadius: this.radius,
      startTarget: this.target.clone(),
      endTheta:    p.theta  ?? this.theta,
      endPhi:      p.phi    ?? this.phi,
      endRadius:   p.radius ?? this.radius,
      endTarget:   new THREE.Vector3(
        p.target?.x ?? this.target.x,
        p.target?.y ?? this.target.y,
        p.target?.z ?? this.target.z,
      ),
      duration,
      elapsed: 0,
    };
  }

  _processTween(dt) {
    const tw = this._tween;
    if (!tw) return;

    tw.elapsed += dt;
    const raw = Math.min(1, tw.elapsed / tw.duration);
    const t   = smoothstep(raw);

    // Angle interpolation — handle wrap-around for theta
    let dTheta = tw.endTheta - tw.startTheta;
    if (dTheta >  Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;

    this.theta  = tw.startTheta  + dTheta * t;
    this.phi    = tw.startPhi    + (tw.endPhi    - tw.startPhi)    * t;
    this.radius = tw.startRadius + (tw.endRadius - tw.startRadius) * t;
    this.target.lerpVectors(tw.startTarget, tw.endTarget, t);

    if (raw >= 1) this._tween = null;
  }

  update(dt) {
    this._processKeys(dt);
    this._processTween(dt);
    this._applySpherical();

    if (this.camera.fov !== Config.camera.fov) {
      this.camera.fov = Config.camera.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  resetToDefault() {
    this.tweenTo('Rainbow View');
  }
}
