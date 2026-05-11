/**
 * terrain.js
 * Shared terrain height function + mesh builder.
 * Imported by scene.js, grass.js, character.js, and vegetation.js.
 */

import * as THREE from 'three';

/**
 * Returns the world-Y of the terrain at a given XZ position.
 * Multi-octave sine waves give smooth rolling hills.
 * The area within ~50 units of the origin is flattened so Celso
 * starts on level ground.
 */
export function terrainHeight(x, z) {
  let h = 0;
  h += Math.sin(x * 0.011 + 0.40) * Math.cos(z * 0.013 + 0.25) * 5.0;
  h += Math.sin(x * 0.024 + 1.10) * Math.sin(z * 0.020 + 0.90) * 2.5;
  h += Math.sin(x * 0.047 + 2.30) * Math.cos(z * 0.040 + 1.60) * 1.2;
  h += Math.sin(x * 0.091)        * Math.sin(z * 0.077)         * 0.5;

  // Flatten starting zone
  const d2   = (x * x + z * z) / (52 * 52);
  const flat = Math.max(0, 1 - d2);
  return h * (1 - flat);
}

/**
 * Builds a terrain mesh ready to drop into the scene.
 * @param {number} segments  Subdivisions along each axis (higher = smoother)
 */
export function buildTerrainMesh(segments = 80) {
  const SIZE = 800;
  const N    = segments;
  const HALF = SIZE / 2;
  const step = SIZE / N;

  const vCount  = (N + 1) * (N + 1);
  const positions = new Float32Array(vCount * 3);
  const uvs       = new Float32Array(vCount * 2);
  const indices   = [];

  for (let iz = 0; iz <= N; iz++) {
    for (let ix = 0; ix <= N; ix++) {
      const x   = ix * step - HALF;
      const z   = iz * step - HALF;
      const idx = iz * (N + 1) + ix;

      positions[idx * 3]     = x;
      positions[idx * 3 + 1] = terrainHeight(x, z);
      positions[idx * 3 + 2] = z;

      uvs[idx * 2]     = ix / N;
      uvs[idx * 2 + 1] = iz / N;
    }
  }

  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const a = iz * (N + 1) + ix;
      const b = a + 1;
      const c = a + (N + 1);
      const d = c + 1;
      indices.push(a, c, b,  b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs,       2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat  = new THREE.MeshLambertMaterial({ color: 0x3e7c22 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  return mesh;
}
