/**
 * main.js
 * Application entry point. Sets up Three.js renderer, wires all modules,
 * and runs the main animation loop.
 */

import * as THREE from 'three';
import { Config }            from './config.js';
import { createScene }       from './scene.js';
import { Sun }               from './sun.js';
import { Rain }              from './rain.js';
import { Rainbow }           from './rainbow.js';
import { Celso }             from './celso.js';
import { RayVis }            from './rayvis.js';
import { AngleOverlay }      from './overlays.js';
import { CharacterController } from './character.js';
import { Grass }               from './grass.js';
import { Clouds }              from './clouds.js';
import { createVegetation }    from './vegetation.js';
import { Newton }              from './newton.js';
import { Multiplayer }         from './multiplayer.js';
import { initUI, updateStats } from './ui.js';
import './audio.js';

// ── Renderer ──────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace    = THREE.SRGBColorSpace;
renderer.shadowMap.enabled   = true;
renderer.shadowMap.type      = THREE.PCFShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// ── Camera ────────────────────────────────────────────────────────────────
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

// ── Scene & systems ───────────────────────────────────────────────────────
const scene        = createScene();
const { appleMesh, appleTreeData } = createVegetation(scene);
const grass        = new Grass(scene);
const clouds       = new Clouds(scene);
const sun          = new Sun(scene);
const rain         = new Rain(scene);
const rainbow      = new Rainbow(scene);
const celso        = new Celso();
const rayVis       = new RayVis(scene);
const angleOverlay = new AngleOverlay(scene);
const camCtrl      = new CharacterController(camera, scene);
const newton       = new Newton(scene, appleMesh, appleTreeData);
const multiplayer  = new Multiplayer(scene);

// ── Sun direction helper (shared across systems) ──────────────────────────
const _sunDir = new THREE.Vector3();
function getSunDir() {
  const az = Config.sun.azimuth   * (Math.PI / 180);
  const el = Config.sun.elevation * (Math.PI / 180);
  _sunDir.set(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  ).normalize();
  return _sunDir;
}

// ── UI ────────────────────────────────────────────────────────────────────
initUI({ sun, rain, rainbow, cameraController: camCtrl });

// ── Resize ────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => { // listens for browser resize and updates the camera's aspect ratio and calls updateProjectionMatrix to update the change
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Main loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock(); // measures time between frames (dt)
let _lastFrameTime = 0;

function animate(now = performance.now()) {
  requestAnimationFrame(animate);

  // Hard 60 fps cap
  if (now - _lastFrameTime < 16.5) return;
  _lastFrameTime += 16.667;
  if (now - _lastFrameTime > 16.667) _lastFrameTime = now;

  const rawDt = Math.min(clock.getDelta(), 0.05);
  const sunDir = getSunDir(); // compute the direction of the sun

  // update everything on the scene
  sun.update(camera, rawDt);
  clouds.update(rawDt);
  newton.update(rawDt, camCtrl._pos);
  multiplayer.update(rawDt, camCtrl.pos, camCtrl.facing);
  camCtrl.update(rawDt);
  grass.update(rawDt, Config.rain.drift);
  rain.update(rawDt);
  rainbow.update(camera);
  rayVis.update(sunDir);
  angleOverlay.update(camera);
  celso.update(rawDt, rainbow.visibility);

  renderer.render(scene, camera); // render the scene
  updateStats(rawDt, rain.dropCount, rainbow.visibility, rayVis.lastExitAngles); // update ui
}

requestAnimationFrame(animate);
