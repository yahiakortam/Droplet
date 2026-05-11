/**
 * clouds.js
 * Fluffy volumetric clouds built from sphere-blob clusters.
 * Each cloud drifts slowly across the sky; Lambert material lets
 * the sun colour them orange at sunset and bright white at noon.
 */

import * as THREE from 'three';

const CLOUD_COUNT = 26;
const BLOBS_PER   = 7;
const FIELD       = 370;

function rnd(a, b) { return a + Math.random() * (b - a); }

// Relative offsets of each blob inside one cloud (unitless — scaled at runtime)
const SHAPE = [
  { dx:  0,    dy:  0,   dz:  0,   r: 1.00 },  // core
  { dx: -10,   dy: -1,   dz:  1,   r: 0.82 },  // left lobe
  { dx:  10,   dy: -1,   dz: -1,   r: 0.80 },  // right lobe
  { dx:  5,    dy:  4,   dz:  2,   r: 0.65 },  // top right puff
  { dx: -5,    dy:  4,   dz: -2,   r: 0.63 },  // top left puff
  { dx: -6,    dy: -4,   dz: -4,   r: 0.52 },  // bottom left wisp
  { dx:  6,    dy: -4,   dz:  4,   r: 0.50 },  // bottom right wisp
];

export class Clouds {
  constructor(scene) {
    this._dummy  = new THREE.Object3D();
    this._clouds = [];

    const mat = new THREE.MeshLambertMaterial({
      color:       0xfafafa,
      transparent: true,
      opacity:     0.91,
      depthWrite:  false,
    });

    this._mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(7, 7, 6),
      mat,
      CLOUD_COUNT * BLOBS_PER,
    );
    this._mesh.castShadow    = false;
    this._mesh.receiveShadow = false;
    scene.add(this._mesh);

    for (let i = 0; i < CLOUD_COUNT; i++) {
      this._clouds.push({
        x:      rnd(-FIELD, FIELD),
        y:      rnd(150, 240),
        z:      rnd(-FIELD, FIELD),
        scale:  rnd(1.0, 2.0),
        speedX: rnd(1.8, 4.5) * (Math.random() < 0.5 ? 1 : -1),
        speedZ: rnd(-1.2, 1.2),
      });
    }

    this._write();
  }

  _write() {
    const d = this._dummy;
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const c = this._clouds[i];
      for (let j = 0; j < BLOBS_PER; j++) {
        const b = SHAPE[j];
        d.position.set(
          c.x + b.dx * c.scale,
          c.y + b.dy * c.scale,
          c.z + b.dz * c.scale,
        );
        d.scale.setScalar(b.r * c.scale);
        d.updateMatrix();
        this._mesh.setMatrixAt(i * BLOBS_PER + j, d.matrix);
      }
    }
    this._mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    const wrap = FIELD + 80;
    for (const c of this._clouds) {
      c.x += c.speedX * dt;
      c.z += c.speedZ * dt;
      if (c.x >  wrap) c.x = -wrap;
      if (c.x < -wrap) c.x =  wrap;
      if (c.z >  wrap) c.z = -wrap;
      if (c.z < -wrap) c.z =  wrap;
    }
    this._write();
  }
}
