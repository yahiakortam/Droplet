/**
 * camera.js
 * Full camera controller supporting:
 *   - Orbit (left mouse drag)
 *   - Pan (right mouse drag / middle drag)
 *   - Zoom (scroll wheel)
 *   - WASD + Q/E free-fly
 * Implemented without Three.js OrbitControls so we can extend it later.
 */

import * as THREE from 'three';
import { Config } from './config.js';

const DEG = Math.PI / 180;

export class CameraController {
  constructor(camera, domElement) {
    this.camera     = camera;
    this.domElement = domElement;

    // Spherical coords around target
    this.target  = new THREE.Vector3(
      Config.camera.initialTarget.x,
      Config.camera.initialTarget.y,
      Config.camera.initialTarget.z,
    );
    this.theta   = Math.PI;   // horizontal angle
    this.phi     = 75 * DEG;  // vertical angle (from top)
    this.radius  = 90;

    // Fly mode state
    this._keys   = {};
    this._flySpeed = 30; // units/s

    // Mouse state
    this._mouse  = { x: 0, y: 0, buttons: 0 };
    this._dragging = false;

    this._bindEvents();
    this._applySpherical();
  }

  _bindEvents() {
    const el = this.domElement;
    el.addEventListener('mousedown', this._onMouseDown.bind(this));
    el.addEventListener('mousemove', this._onMouseMove.bind(this));
    el.addEventListener('mouseup',   this._onMouseUp.bind(this));
    el.addEventListener('wheel',     this._onWheel.bind(this), { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', e => { this._keys[e.code] = true; });
    window.addEventListener('keyup',   e => { this._keys[e.code] = false; });
  }

  _onMouseDown(e) {
    this._dragging = true;
    this._mouse.x = e.clientX;
    this._mouse.y = e.clientY;
    this._mouse.buttons = e.buttons;
  }

  _onMouseUp() {
    this._dragging = false;
  }

  _onMouseMove(e) {
    if (!this._dragging) return;
    const dx = e.clientX - this._mouse.x;
    const dy = e.clientY - this._mouse.y;
    this._mouse.x = e.clientX;
    this._mouse.y = e.clientY;

    if (this._mouse.buttons === 1) {
      // Left drag = orbit
      this.theta -= dx * 0.005;
      this.phi    = Math.max(2 * DEG, Math.min(178 * DEG, this.phi + dy * 0.005));
    } else if (this._mouse.buttons === 2 || this._mouse.buttons === 4) {
      // Right / middle drag = pan
      const right = new THREE.Vector3();
      const up    = new THREE.Vector3();
      this.camera.getWorldDirection(new THREE.Vector3()); // ensure matrix fresh
      right.crossVectors(
        this.camera.getWorldDirection(new THREE.Vector3()),
        this.camera.up
      ).normalize();
      up.copy(this.camera.up);

      const panSpeed = this.radius * 0.001;
      this.target.addScaledVector(right, -dx * panSpeed);
      this.target.addScaledVector(up,     dy * panSpeed);
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.08 : 0.92;
    this.radius = Math.max(5, Math.min(600, this.radius * delta));
  }

  _applySpherical() {
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);
    const offset = new THREE.Vector3(
      this.radius * sinPhi * Math.sin(this.theta),
      this.radius * cosPhi,
      this.radius * sinPhi * Math.cos(this.theta),
    );
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  _processKeys(dt) {
    const k   = this._keys;
    const spd = this._flySpeed * dt;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const right = new THREE.Vector3().crossVectors(dir, this.camera.up).normalize();

    let moved = false;
    if (k['KeyW'] || k['ArrowUp'])    { this.target.addScaledVector(dir,   spd); moved = true; }
    if (k['KeyS'] || k['ArrowDown'])  { this.target.addScaledVector(dir,  -spd); moved = true; }
    if (k['KeyA'] || k['ArrowLeft'])  { this.target.addScaledVector(right, -spd); moved = true; }
    if (k['KeyD'] || k['ArrowRight']) { this.target.addScaledVector(right,  spd); moved = true; }
    if (k['KeyQ'])                    { this.target.y -= spd; moved = true; }
    if (k['KeyE'])                    { this.target.y += spd; moved = true; }
    return moved;
  }

  update(dt) {
    this._processKeys(dt);
    this._applySpherical();

    // Apply FOV from config
    if (this.camera.fov !== Config.camera.fov) {
      this.camera.fov = Config.camera.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  resetToDefault() {
    this.target.set(
      Config.camera.initialTarget.x,
      Config.camera.initialTarget.y,
      Config.camera.initialTarget.z,
    );
    this.theta  = Math.PI;
    this.phi    = 75 * DEG;
    this.radius = 90;
  }
}
