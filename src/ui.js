/**
 * ui.js
 * Wires all control panel inputs to Config, and updates display labels.
 * Phase 3: adds time buttons, camera presets, overlay toggles, info panel.
 */

import { Config } from './config.js';
import { PRESETS } from './camera.js';

export function initUI({ sun, rain, rainbow, cameraController }) {

  // ── Generic slider binder ──────────────────────────────────────────────
  function bind(id, obj, key, display, fmt = v => v) {
    const el  = document.getElementById(id);
    const lbl = document.getElementById(display);
    if (!el) return;

    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      obj[key] = v;
      if (lbl) lbl.textContent = fmt(v);
      if (obj === Config.sun)  sun.update();
      if (obj === Config.rain && key === 'size') rain.refreshSizes();
    });
    if (lbl) lbl.textContent = fmt(parseFloat(el.value));
  }

  function deg(v)    { return Math.round(v) + '°'; }
  function fixed1(v) { return v.toFixed(1); }
  function round(v)  { return Math.round(v); }

  // Sun
  bind('sun-azimuth',   Config.sun, 'azimuth',   'sun-azimuth-val',   deg);
  bind('sun-elevation', Config.sun, 'elevation', 'sun-elevation-val', deg);
  bind('sun-intensity', Config.sun, 'intensity', 'sun-intensity-val', fixed1);

  // Rain
  bind('rain-density', Config.rain, 'count',  'rain-density-val', round);
  bind('rain-size',    Config.rain, 'size',   'rain-size-val',    fixed1);
  bind('rain-speed',   Config.rain, 'speed',  'rain-speed-val',   fixed1);
  bind('rain-drift',   Config.rain, 'drift',  'rain-drift-val',   fixed1);

  // Rainbow
  bind('rainbow-intensity',  Config.rainbow, 'intensity',  'rainbow-intensity-val',  fixed1);
  bind('rainbow-dispersion', Config.rainbow, 'dispersion', 'rainbow-dispersion-val', fixed1);

  const secCheck = document.getElementById('rainbow-secondary');
  if (secCheck) secCheck.addEventListener('change', () => {
    Config.rainbow.showSecondary = secCheck.checked;
  });

  const rbToggle = document.getElementById('rainbow-toggle');
  if (rbToggle) rbToggle.addEventListener('change', () => {
    Config.rainbow.enabled = rbToggle.checked;
  });

  // Camera FOV
  const fovEl  = document.getElementById('camera-fov');
  const fovLbl = document.getElementById('camera-fov-val');
  if (fovEl) {
    fovEl.addEventListener('input', () => {
      Config.camera.fov = parseFloat(fovEl.value);
      if (fovLbl) fovLbl.textContent = Math.round(fovEl.value) + '°';
    });
    if (fovLbl) fovLbl.textContent = Math.round(fovEl.value) + '°';
  }

  // ── Time scale: slider + quick buttons ──────────────────────────────────
  const tsEl  = document.getElementById('time-scale');
  const tsLbl = document.getElementById('time-scale-val');
  function applyTimeScale(v) {
    Config.simulation.timeScale = v;
    if (tsEl)  tsEl.value = v;
    if (tsLbl) tsLbl.textContent = v.toFixed(2);
    // highlight active quick button
    document.querySelectorAll('.speed-btn').forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.speed) === v);
    });
  }
  if (tsEl) {
    tsEl.addEventListener('input', () => applyTimeScale(parseFloat(tsEl.value)));
    if (tsLbl) tsLbl.textContent = parseFloat(tsEl.value).toFixed(2);
  }
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTimeScale(parseFloat(btn.dataset.speed)));
  });

  // Pause / resume
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      Config.simulation.paused = !Config.simulation.paused;
      pauseBtn.textContent = Config.simulation.paused ? 'Resume' : 'Pause';
      pauseBtn.classList.toggle('active', Config.simulation.paused);
    });
  }

  // ── Camera presets ───────────────────────────────────────────────────────
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      cameraController.tweenTo(btn.dataset.preset);
    });
  });

  document.getElementById('reset-btn')?.addEventListener('click', () => {
    cameraController.tweenTo('Rainbow View');
  });

  // ── Overlay toggles ──────────────────────────────────────────────────────
  function bindOverlay(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => { Config.overlays[key] = el.checked; });
  }
  bindOverlay('overlay-rays',  'rayPaths');
  bindOverlay('overlay-ring',  'angleRing');
  bindOverlay('overlay-info',  'infoPanel');

  // ── Celso toggle ─────────────────────────────────────────────────────────
  const celsoBtn = document.getElementById('celso-toggle-btn');
  if (celsoBtn) {
    celsoBtn.addEventListener('click', () => {
      Config.celso.enabled = !Config.celso.enabled;
      celsoBtn.textContent = Config.celso.enabled ? 'Hide Celso' : 'Show Celso';
    });
  }
}

// ── Stats + live info panel ────────────────────────────────────────────────
let _frames  = 0;
let _elapsed = 0;

export function updateStats(dt, dropCount, rainbowVis, exitAngles) {
  _frames++;
  _elapsed += dt;
  if (_elapsed < 0.25) return;

  const fps = Math.round(_frames / _elapsed);
  _frames  = 0;
  _elapsed = 0;

  document.getElementById('fps-display').textContent        = `${fps} fps`;
  document.getElementById('drop-count-display').textContent = `${dropCount.toLocaleString()} drops`;

  const vis = document.getElementById('rainbow-vis-display');
  if (vis) {
    const pct = Math.round(rainbowVis * 100);
    vis.textContent = `🌈 ${pct}%`;
    vis.style.color = rainbowVis > 0.5
      ? `hsl(${280 + rainbowVis * 80}, 90%, 70%)`
      : 'rgba(255,255,255,0.35)';
  }

  // Physics info panel
  if (!Config.overlays.infoPanel) {
    document.getElementById('info-panel')?.classList.add('info-hidden');
    return;
  }
  document.getElementById('info-panel')?.classList.remove('info-hidden');

  const sunEl = document.getElementById('info-sun-el');
  const rbVis = document.getElementById('info-rb-vis');
  const rExit = document.getElementById('info-exit-r');
  const gExit = document.getElementById('info-exit-g');
  const bExit = document.getElementById('info-exit-b');

  if (sunEl) sunEl.textContent = Config.sun.elevation.toFixed(1) + '°';
  if (rbVis) rbVis.textContent = (rainbowVis * 100).toFixed(0) + '%';

  if (exitAngles) {
    if (rExit && exitAngles[0] != null) rExit.textContent = exitAngles[0].toFixed(2) + '°';
    if (gExit && exitAngles[1] != null) gExit.textContent = exitAngles[1].toFixed(2) + '°';
    if (bExit && exitAngles[2] != null) bExit.textContent = exitAngles[2].toFixed(2) + '°';
  }
}
