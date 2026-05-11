/**
 * newton.js
 * "Newton Moment" hidden achievement.
 * Triggers once per session when the player walks under an apple tree:
 * one apple falls with gravity, hits the ground, then a popup appears.
 */

import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

const TRIGGER_R = 5;      // XZ radius to trigger (units)
const GRAVITY   = 16;     // downward acceleration (units/s²)
const SHOW_MS   = 6000;   // popup visible duration

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

    // Standalone sphere shown only while the apple is mid-fall
    this._ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 7, 7),
      new THREE.MeshLambertMaterial({ color: 0xcc2200 }),
    );
    this._ball.visible = false;
    scene.add(this._ball);

    document.getElementById('newton-close')
      ?.addEventListener('click', () => this._hidePopup());
  }

  // Called every rendered frame; playerPos = character XZ world position
  update(dt, playerPos) {
    if (this._falling) {
      this._tickFall(dt);
      return;
    }
    if (this._done) return;

    // Find the nearest apple tree within trigger radius
    let closest  = null;
    let closestD = Infinity;
    for (const tree of this._trees) {
      const dx = playerPos.x - tree.x;
      const dz = playerPos.z - tree.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < TRIGGER_R * TRIGGER_R && d2 < closestD) {
        closestD = d2;
        closest  = tree;
      }
    }
    if (closest) this._trigger(closest);
  }

  _trigger(tree) {
    this._done    = true;
    this._falling = true;

    // Pick a random apple on this tree
    const apple = tree.apples[Math.floor(Math.random() * tree.apples.length)];

    // Hide the instanced copy (scale to near-zero)
    this._dummy.position.set(apple.x, apple.y, apple.z);
    this._dummy.scale.setScalar(0.0001);
    this._dummy.updateMatrix();
    this._appleMesh.setMatrixAt(apple.idx, this._dummy.matrix);
    this._appleMesh.instanceMatrix.needsUpdate = true;

    // Start the falling standalone apple from the same position
    this._ball.position.set(apple.x, apple.y, apple.z);
    this._ball.visible = true;
    this._velY   = 0;
    this._groundY = terrainHeight(apple.x, apple.z) + 0.18;
  }

  _tickFall(dt) {
    this._velY -= GRAVITY * dt;
    this._ball.position.y += this._velY * dt;

    // Tiny spin while falling
    this._ball.rotation.z += dt * 3.5;

    if (this._ball.position.y <= this._groundY) {
      this._ball.position.y = this._groundY;
      this._ball.visible    = false;
      this._falling         = false;
      this._showPopup();
    }
  }

  _showPopup() {
    const el = document.getElementById('newton-popup');
    if (!el) return;
    el.classList.remove('newton-hidden');
    this._timer = setTimeout(() => this._hidePopup(), SHOW_MS);
  }

  _hidePopup() {
    clearTimeout(this._timer);
    document.getElementById('newton-popup')?.classList.add('newton-hidden');
  }
}
