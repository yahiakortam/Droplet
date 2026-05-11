/**
 * multiplayer.js
 * Connects to the same host that served the page, syncs player
 * positions at ~20 Hz, and renders other players as mini-Celso
 * models with floating name labels.
 */

import * as THREE from 'three';

// ── Simplified remote-player model (recognisable Celso silhouette) ─────────
function buildRemoteCelso() {
  const root = new THREE.Group();

  function add(geo, color, x, y, z) {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    root.add(m);
  }

  add(new THREE.CylinderGeometry(0.11, 0.13, 0.48, 7), 0x1b5e20, -0.19, 0.40, 0); // left leg
  add(new THREE.CylinderGeometry(0.11, 0.13, 0.48, 7), 0x1b5e20,  0.19, 0.40, 0); // right leg
  add(new THREE.BoxGeometry(0.66, 0.72, 0.43),          0x2e8b2e,     0, 1.00, 0); // torso
  add(new THREE.SphereGeometry(0.31, 10, 10),            0xffcc99,     0, 1.80, 0); // head
  add(new THREE.CylinderGeometry(0.54, 0.57, 0.07, 14), 0x145214,     0, 2.145,0); // hat brim
  add(new THREE.CylinderGeometry(0.30, 0.33, 0.56, 10), 0x145214,     0, 2.46, 0); // hat crown

  return root;
}

// ── Floating canvas-texture name label ────────────────────────────────────────
function makeLabel(text) {
  const W = 140, H = 42;
  const canvas     = document.createElement('canvas');
  canvas.width  = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(0,0,0,0.58)';
  ctx.beginPath();
  ctx.moveTo(10, 0); ctx.lineTo(W - 10, 0);
  ctx.quadraticCurveTo(W, 0, W, 10);
  ctx.lineTo(W, H - 10);
  ctx.quadraticCurveTo(W, H, W - 10, H);
  ctx.lineTo(10, H);
  ctx.quadraticCurveTo(0, H, 0, H - 10);
  ctx.lineTo(0, 10);
  ctx.quadraticCurveTo(0, 0, 10, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle    = '#ffffff';
  ctx.font         = 'bold 18px sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2);

  const tex = new THREE.CanvasTexture(canvas);
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  spr.scale.set(1.6, 0.48, 1);
  spr.position.set(0, 3.3, 0);
  return spr;
}

// ── Multiplayer class ─────────────────────────────────────────────────────────
export class Multiplayer {
  constructor(scene) {
    this._scene      = scene;
    this._remotes    = new Map();   // id → { model, tx, ty, tz, tFacing }
    this._myId       = null;
    this._ws         = null;
    this._connected  = false;
    this._sendTick   = 0;

    this._connect();
  }

  // ── WebSocket lifecycle ─────────────────────────────────────────────────────
  _connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url   = `${proto}://${location.host}`;
    try {
      this._ws = new WebSocket(url);
    } catch (_) { return; }

    this._ws.addEventListener('open',    ()  => {
      this._connected = true;
      this._setStatus('connected');
    });
    this._ws.addEventListener('close',   ()  => {
      this._connected = false;
      this._setStatus('offline');
    });
    this._ws.addEventListener('error',   ()  => {
      this._connected = false;
      this._setStatus('offline');
    });
    this._ws.addEventListener('message', ev => {
      try { this._handle(JSON.parse(ev.data)); } catch (_) {}
    });
  }

  // ── Message handling ────────────────────────────────────────────────────────
  _handle(msg) {
    switch (msg.type) {
      case 'init':
        this._myId = msg.id;
        msg.players.forEach(p => this._add(p));
        this._setStatus('connected');
        break;
      case 'join':
        this._add(msg);
        this._setStatus('connected');
        break;
      case 'move':
        this._move(msg);
        break;
      case 'leave':
        this._remove(msg.id);
        this._setStatus('connected');
        break;
    }
  }

  // ── Remote player CRUD ──────────────────────────────────────────────────────
  _add({ id, x, y, z, facing, ry }) {
    if (this._remotes.has(id)) return;
    const model = buildRemoteCelso();
    model.add(makeLabel(`Player ${id}`));
    model.position.set(x, y, z);
    model.rotation.y = facing ?? ry ?? 0;
    this._scene.add(model);
    this._remotes.set(id, { model, tx: x, ty: y, tz: z, tFacing: facing ?? ry ?? 0 });
  }

  _move({ id, x, y, z, facing, ry }) {
    const r = this._remotes.get(id);
    if (!r) return;
    r.tx = x; r.ty = y; r.tz = z;
    r.tFacing = facing ?? ry ?? r.tFacing;
  }

  _remove(id) {
    const r = this._remotes.get(id);
    if (!r) return;
    this._scene.remove(r.model);
    this._remotes.delete(id);
  }

  // ── Per-frame update ────────────────────────────────────────────────────────
  update(dt, playerPos, playerFacing) {
    // Smooth-lerp all remote models toward their last known state
    this._remotes.forEach(r => {
      const { model } = r;
      model.position.x += (r.tx - model.position.x) * Math.min(1, dt * 12);
      model.position.y += (r.ty - model.position.y) * Math.min(1, dt * 12);
      model.position.z += (r.tz - model.position.z) * Math.min(1, dt * 12);

      const diff = ((r.tFacing - model.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      model.rotation.y += diff * Math.min(1, dt * 10);
    });

    // Send own position at ~20 Hz (every 3 frames at 60 fps)
    if (!this._connected) return;
    if (++this._sendTick % 3 !== 0) return;

    this._ws.send(JSON.stringify({
      type:   'move',
      x:      +playerPos.x.toFixed(2),
      y:      +playerPos.y.toFixed(2),
      z:      +playerPos.z.toFixed(2),
      ry:     +playerFacing.toFixed(3),
      facing: +playerFacing.toFixed(3),
    }));
  }

  // ── Status indicator ────────────────────────────────────────────────────────
  _setStatus(state) {
    const el = document.getElementById('mp-status');
    if (!el) return;
    const n = this._remotes.size;
    if (state === 'offline') {
      el.textContent = '';
      el.style.display = 'none';
    } else {
      el.style.display = 'block';
      el.textContent = n === 0
        ? '🌐 solo'
        : `🌐 ${n + 1} online`;
    }
  }
}
