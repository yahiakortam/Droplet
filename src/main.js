/**
 * main.js
 * Application entry point. Sets up Three.js renderer, wires all modules,
 * and runs the main animation loop.
 */

import * as THREE from 'three';
import { Config }           from './config.js';
import { createScene }      from './scene.js';
import { Sun }              from './sun.js';
import { Rain }             from './rain.js';
import { CameraController } from './camera.js';
import { initUI, updateStats } from './ui.js';

// ── Renderer ──
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping    = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// ── Camera ──
const camera = new THREE.PerspectiveCamera(
  Config.camera.fov,
  window.innerWidth / window.innerHeight,
  Config.camera.near,
  Config.camera.far,
);
camera.position.set(
  Config.camera.initialPosition.x,
  Config.camera.initialPosition.y,
  Config.camera.initialPosition.z,
);

// ── Scene & systems ──
const scene  = createScene();
const sun    = new Sun(scene);
const rain   = new Rain(scene);
const camCtrl = new CameraController(camera, renderer.domElement);

// ── UI ──
initUI({ sun, rain, cameraController: camCtrl });

// ── Resize ──
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Main loop ──
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const rawDt = Math.min(clock.getDelta(), 0.05); // cap at 50ms
  const dt    = rawDt; // timeScale applied inside systems

  camCtrl.update(rawDt);
  rain.update(rawDt);

  renderer.render(scene, camera);
  updateStats(rawDt, rain.dropCount);
}

animate();
