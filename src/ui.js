/**
 * ui.js
 * Wires all control panel inputs to Config, and updates display labels.
 */

import { Config } from './config.js';

export function initUI({ sun, rain, cameraController }) {

  // ── Helpers ──
  function bind(id, obj, key, display, fmt = v => v) {
    const el  = document.getElementById(id);
    const lbl = document.getElementById(display);
    if (!el) return;

    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      obj[key] = v;
      if (lbl) lbl.textContent = fmt(v);
      // Notify specific systems
      if (obj === Config.sun)  sun.update();
      if (obj === Config.rain && key === 'size') rain.refreshSizes();
    });

    // Init label
    if (lbl) lbl.textContent = fmt(parseFloat(el.value));
  }

  function deg(v)   { return Math.round(v) + '°'; }
  function fixed1(v){ return v.toFixed(1); }
  function round(v) { return Math.round(v); }

  // Sun
  bind('sun-azimuth',   Config.sun, 'azimuth',   'sun-azimuth-val',   deg);
  bind('sun-elevation', Config.sun, 'elevation', 'sun-elevation-val', deg);
  bind('sun-intensity', Config.sun, 'intensity', 'sun-intensity-val', fixed1);

  // Rain
  bind('rain-density', Config.rain, 'count',  'rain-density-val',  round);
  bind('rain-size',    Config.rain, 'size',   'rain-size-val',     fixed1);
  bind('rain-speed',   Config.rain, 'speed',  'rain-speed-val',    fixed1);
  bind('rain-drift',   Config.rain, 'drift',  'rain-drift-val',    fixed1);

  // Camera
  const fovEl  = document.getElementById('camera-fov');
  const fovLbl = document.getElementById('camera-fov-val');
  if (fovEl) {
    fovEl.addEventListener('input', () => {
      Config.camera.fov = parseFloat(fovEl.value);
      if (fovLbl) fovLbl.textContent = Math.round(fovEl.value) + '°';
    });
    if (fovLbl) fovLbl.textContent = Math.round(fovEl.value) + '°';
  }

  // Time scale
  const tsEl  = document.getElementById('time-scale');
  const tsLbl = document.getElementById('time-scale-val');
  if (tsEl) {
    tsEl.addEventListener('input', () => {
      Config.simulation.timeScale = parseFloat(tsEl.value);
      if (tsLbl) tsLbl.textContent = parseFloat(tsEl.value).toFixed(2);
    });
    if (tsLbl) tsLbl.textContent = parseFloat(tsEl.value).toFixed(2);
  }

  // Pause / resume
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      Config.simulation.paused = !Config.simulation.paused;
      pauseBtn.textContent = Config.simulation.paused ? 'Resume' : 'Pause';
    });
  }

  // Reset camera
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      cameraController.resetToDefault();
    });
  }
}

// ── Stats display ──
let _lastFPS = 0;
let _frames  = 0;
let _elapsed = 0;

export function updateStats(dt, dropCount) {
  _frames++;
  _elapsed += dt;
  if (_elapsed >= 0.5) {
    _lastFPS = Math.round(_frames / _elapsed);
    _frames  = 0;
    _elapsed = 0;
    document.getElementById('fps-display').textContent       = `${_lastFPS} fps`;
    document.getElementById('drop-count-display').textContent = `${dropCount.toLocaleString()} drops`;
  }
}
