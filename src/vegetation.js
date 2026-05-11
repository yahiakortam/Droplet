/**
 * vegetation.js
 * Instanced trees (trunk + 3 cone foliage layers), apples on ~1/3 of trees,
 * and bushes scattered across the terrain.
 */

import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

const TREE_COUNT = 220;
const BUSH_COUNT = 400;
const FIELD_HALF = 350;
const MIN_DIST   = 32;   // keep spawn zone clear

function rnd(a, b) { return a + Math.random() * (b - a); }

function randomXZ() {
  let x, z;
  do {
    x = rnd(-FIELD_HALF, FIELD_HALF);
    z = rnd(-FIELD_HALF, FIELD_HALF);
  } while (x * x + z * z < MIN_DIST * MIN_DIST);
  return [x, z];
}

export function createVegetation(scene) {
  const dummy = new THREE.Object3D();

  // ── Trunks ──────────────────────────────────────────────────────────────────
  const TRUNK_H   = 2.2;
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.20, 0.32, TRUNK_H, 7),
    new THREE.MeshLambertMaterial({ color: 0x6b4226 }),
    TREE_COUNT,
  );
  scene.add(trunkMesh);

  // ── Foliage cones (3 stacked layers per tree) ────────────────────────────────
  const LAYERS = [
    { r: 2.5, h: 3.2, base: 1.8 },   // bottom — widest
    { r: 2.0, h: 2.7, base: 3.6 },   // middle
    { r: 1.4, h: 2.2, base: 5.1 },   // top — narrowest
  ];
  const foliageMeshes = LAYERS.map(({ r, h }) => {
    const mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(r, h, 7),
      new THREE.MeshLambertMaterial({ color: 0x2d6a2d }),
      TREE_COUNT,
    );
    scene.add(mesh);
    return mesh;
  });

  // ── Apples (~1/3 of trees, 4 apples each) ───────────────────────────────────
  const APPLE_TREES = Math.floor(TREE_COUNT / 3);
  const APPLES_PER  = 4;
  const appleMesh   = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.18, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0xcc2200 }),
    APPLE_TREES * APPLES_PER,
  );
  scene.add(appleMesh);

  // ── Bushes ───────────────────────────────────────────────────────────────────
  const bushMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x2a5a1a }),
    BUSH_COUNT,
  );
  scene.add(bushMesh);

  // ── Place trees ──────────────────────────────────────────────────────────────
  const treeXYZ = new Float32Array(TREE_COUNT * 3);
  for (let i = 0; i < TREE_COUNT; i++) {
    const [tx, tz] = randomXZ();
    const ty = terrainHeight(tx, tz);
    treeXYZ[i * 3]     = tx;
    treeXYZ[i * 3 + 1] = ty;
    treeXYZ[i * 3 + 2] = tz;

    dummy.position.set(tx, ty + TRUNK_H * 0.5, tz);
    dummy.rotation.set(0, rnd(0, Math.PI * 2), 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);

    LAYERS.forEach(({ h, base }, li) => {
      dummy.position.set(tx, ty + base + h * 0.5, tz);
      dummy.rotation.y = 0;
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      foliageMeshes[li].setMatrixAt(i, dummy.matrix);
    });
  }

  // ── Place apples ─────────────────────────────────────────────────────────────
  let ai = 0;
  for (let i = 0; i < APPLE_TREES; i++) {
    const tx = treeXYZ[i * 3];
    const ty = treeXYZ[i * 3 + 1];
    const tz = treeXYZ[i * 3 + 2];
    for (let j = 0; j < APPLES_PER; j++) {
      const ang = rnd(0, Math.PI * 2);
      const rad = rnd(0.7, 1.9);
      dummy.position.set(
        tx + Math.cos(ang) * rad,
        ty + rnd(2.2, 4.8),
        tz + Math.sin(ang) * rad,
      );
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      appleMesh.setMatrixAt(ai++, dummy.matrix);
    }
  }

  // ── Place bushes ─────────────────────────────────────────────────────────────
  for (let i = 0; i < BUSH_COUNT; i++) {
    const [bx, bz] = randomXZ();
    const by = terrainHeight(bx, bz);
    const sx = rnd(0.9, 1.6);
    const sy = rnd(0.55, 0.80);
    dummy.position.set(bx, by + sy * 0.5, bz);
    dummy.rotation.set(0, rnd(0, Math.PI * 2), 0);
    dummy.scale.set(sx, sy, sx * rnd(0.85, 1.15));
    dummy.updateMatrix();
    bushMesh.setMatrixAt(i, dummy.matrix);
  }

  trunkMesh.instanceMatrix.needsUpdate = true;
  foliageMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
  appleMesh.instanceMatrix.needsUpdate = true;
  bushMesh.instanceMatrix.needsUpdate  = true;
}
