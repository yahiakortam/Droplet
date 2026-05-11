/**
 * newton.js
 * "Newton Moment" hidden achievement.
 * Triggers once when the player walks under an apple tree:
 *   1. One instanced apple detaches and falls with gravity.
 *   2. On landing, a full-screen gold overlay floods in with
 *      falling 🍎 emoji rain for 10 seconds.
 */

import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

const TRIGGER_R  = 5;     // XZ proximity radius (units)
const GRAVITY    = 16;    // fall acceleration (units/s²)
const SHOW_MS    = 10000; // overlay duration (ms)
const APPLE_COUNT = 32;   // emoji apples on screen

export class Newton {
  constructor(scene, appleMesh, appleTreeData) {
    this._appleMesh = appleMesh;
    this._trees     = appleTreeData;
    this._done      = false;
    this._falling   = false;
    this._velY      = 0;
    this._groundY   = 0;
    this._dummy     = new THREE.Object3D();
    this._timer     = null;

    // Standalone 3-D apple shown only during the fall
    this._ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 7, 7),
      new THREE.MeshLambertMaterial({ color: 0xcc2200 }),
    );
    this._ball.visible = false;
    scene.add(this._ball);

    document.getElementById('newton-close')
      ?.addEventListener('click', () => this._hide());
  }

  update(dt, playerPos) {
    if (this._falling) { this._tickFall(dt); return; }
    if (this._done)    return;

    // Find closest apple tree within trigger radius
    let best = null, bestD = Infinity;
    for (const tree of this._trees) {
      const dx = playerPos.x - tree.x;
      const dz = playerPos.z - tree.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < TRIGGER_R * TRIGGER_R && d2 < bestD) { bestD = d2; best = tree; }
    }
    if (best) this._trigger(best);
  }

  // ── Trigger: detach one apple and start the fall ─────────────────────────

  _trigger(tree) {
    this._done    = true;
    this._falling = true;

    const apple = tree.apples[Math.floor(Math.random() * tree.apples.length)];

    // Hide the instanced copy (scale to near-zero)
    this._dummy.position.set(apple.x, apple.y, apple.z);
    this._dummy.scale.setScalar(0.0001);
    this._dummy.updateMatrix();
    this._appleMesh.setMatrixAt(apple.idx, this._dummy.matrix);
    this._appleMesh.instanceMatrix.needsUpdate = true;

    this._ball.position.set(apple.x, apple.y, apple.z);
    this._ball.visible = true;
    this._velY   = 0;
    this._groundY = terrainHeight(apple.x, apple.z) + 0.18;
  }

  _tickFall(dt) {
    this._velY -= GRAVITY * dt;
    this._ball.position.y += this._velY * dt;
    this._ball.rotation.z += dt * 3.5;

    if (this._ball.position.y <= this._groundY) {
      this._ball.position.y = this._groundY;
      this._ball.visible    = false;
      this._falling         = false;
      this._showOverlay();
    }
  }

  // ── Overlay ───────────────────────────────────────────────────────────────

  _showOverlay() {
    const overlay = document.getElementById('newton-overlay');
    if (!overlay) return;

    // Spawn falling emoji apples
    const rain = document.getElementById('newton-apples-rain');
    if (rain) {
      for (let i = 0; i < APPLE_COUNT; i++) {
        const el = document.createElement('span');
        el.className   = 'newton-apple';
        el.textContent = '🍎';
        const size     = 24 + Math.random() * 42;
        const duration = 2.2 + Math.random() * 3.5;
        const delay    = Math.random() * 6;
        el.style.cssText = `
          left: ${Math.random() * 100}%;
          font-size: ${size}px;
          animation-duration: ${duration}s;
          animation-delay: -${delay}s;
        `;
        rain.appendChild(el);
      }
    }

    overlay.classList.remove('newton-ov-hidden');
    this._timer = setTimeout(() => this._hide(), SHOW_MS);
  }

  _hide() {
    clearTimeout(this._timer);
    const overlay = document.getElementById('newton-overlay');
    if (overlay) overlay.classList.add('newton-ov-hidden');
    // Clean up emoji nodes after the fade-out transition
    setTimeout(() => {
      const rain = document.getElementById('newton-apples-rain');
      if (rain) rain.innerHTML = '';
    }, 700);
  }
}
