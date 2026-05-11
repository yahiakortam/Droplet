/**
 * character.js
 * Procedural 3-D Celso leprechaun model + third-person character controller.
 * WASD / arrows = walk  |  mouse drag = orbit camera  |  scroll = zoom
 */

import * as THREE from 'three';
import { Config } from './config.js';
import { terrainHeight } from './terrain.js';

// ── Tuning ───────────────────────────────────────────────────────────────────
const WALK_SPEED  = 13;
const RUN_SPEED   = 26;
const WALK_FREQ   = 6;      // limb swing frequency (rad / walk-unit)
const CAM_RADIUS  = 9;
const CAM_PITCH   = 0.30;   // radians ≈ 17° looking down
const GRAVITY     = 38;     // units / s²
const JUMP_VEL    = 15;     // initial upward velocity on jump
const FLAP_VEL    = 13;     // upward boost per wing flap while airborne
const LAND_DUR    = 0.14;   // seconds for landing squish

// ── Camera presets (orbit around Celso) ─────────────────────────────────────
export const PRESETS = {
  'Rainbow View': { yaw: Math.PI,       pitch: 0.28, radius: 9  },
  'Side View':    { yaw: Math.PI / 2,   pitch: 0.35, radius: 11 },
  'Aerial':       { yaw: Math.PI,       pitch: 1.10, radius: 20 },
  'Drop Close-Up':{ yaw: Math.PI,       pitch: 0.15, radius: 3  },
};

// ── Palette ──────────────────────────────────────────────────────────────────
const G_BRIGHT = 0x2e8b2e;
const G_DARK   = 0x1b5e20;
const G_HAT    = 0x145214;
const SKIN     = 0xffcc99;
const ORANGE   = 0xe05500;
const BLACK    = 0x0d0d0d;
const GOLD     = 0xffd700;

// ── Tiny geometry helpers ────────────────────────────────────────────────────
function lam(color) { return new THREE.MeshLambertMaterial({ color }); }

function addBox(parent, w, h, d, color, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  m.castShadow = true;
  parent.add(m);
  return m;
}

function addCyl(parent, rT, rB, h, segs, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, segs), lam(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function addSph(parent, r, segs, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, segs, segs), lam(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// ── Build procedural Celso model ─────────────────────────────────────────────
//
//  Y layout (bottom = 0, all in root-local space):
//   0.00 → 0.16  shoes
//   0.16 → 0.64  legs
//   0.64 → 1.36  torso / belt
//   1.36 → 1.49  neck
//   1.49 → 2.11  head sphere (r = 0.31, center y = 1.80)
//   2.11 → 2.18  hat brim
//   2.18 → 2.73  hat crown
//
function buildCelso() {
  const root = new THREE.Group();

  // ── Leg groups (pivot at HIP – top of leg) ──────────────────────────────
  const HIP_Y   = 0.64;
  const LEG_H   = 0.48;
  const SHOE_FW = 0.05;   // shoe sticks out slightly forward

  const legL = new THREE.Group(); legL.position.set(-0.19, HIP_Y, 0); root.add(legL);
  const legR = new THREE.Group(); legR.position.set( 0.19, HIP_Y, 0); root.add(legR);

  for (const grp of [legL, legR]) {
    addCyl(grp, 0.10, 0.13, LEG_H, 8, G_DARK,  0, -LEG_H / 2,        0);
    addBox(grp, 0.26, 0.16, 0.44,     BLACK,   0, -LEG_H - 0.08, SHOE_FW);
    // buckle on shoe
    addBox(grp, 0.08, 0.07, 0.05,     GOLD,    0, -LEG_H - 0.04, SHOE_FW + 0.22);
  }

  // ── Torso ───────────────────────────────────────────────────────────────
  const TORSO_CY = HIP_Y + 0.36;       // 1.00
  addBox(root, 0.66, 0.72, 0.43, G_BRIGHT, 0, TORSO_CY, 0);

  // Belt + buckle
  addBox(root, 0.70, 0.11, 0.45, BLACK, 0, HIP_Y + 0.04, 0);
  addBox(root, 0.19, 0.14, 0.46, GOLD,  0, HIP_Y + 0.04, 0);

  // Coat lapels
  addBox(root, 0.16, 0.22, 0.44, G_DARK, -0.17, TORSO_CY + 0.22, 0);
  addBox(root, 0.16, 0.22, 0.44, G_DARK,  0.17, TORSO_CY + 0.22, 0);

  // ── Arm groups (pivot at SHOULDER – top of arm) ──────────────────────────
  const SHLD_Y = TORSO_CY + 0.28;      // 1.28
  const ARM_H  = 0.52;

  const armL = new THREE.Group(); armL.position.set(-0.44, SHLD_Y, 0); root.add(armL);
  const armR = new THREE.Group(); armR.position.set( 0.44, SHLD_Y, 0); root.add(armR);

  for (const grp of [armL, armR]) {
    addCyl(grp, 0.09, 0.11, ARM_H, 7, G_BRIGHT, 0, -ARM_H / 2, 0);
    addSph(grp, 0.11, 8,    SKIN,              0, -ARM_H - 0.07, 0);   // hand
  }

  // ── Neck ────────────────────────────────────────────────────────────────
  addCyl(root, 0.10, 0.12, 0.13, 7, SKIN, 0, TORSO_CY + 0.425, 0);

  // ── Head ────────────────────────────────────────────────────────────────
  const HEAD_Y = 1.80;
  const HEAD_R = 0.31;
  addSph(root, HEAD_R, 14, SKIN, 0, HEAD_Y, 0);

  // Eyes (dark pupil + white highlight)
  addSph(root, 0.058, 8, 0x1a1a1a,  -0.11, HEAD_Y + 0.07, 0.26);
  addSph(root, 0.058, 8, 0x1a1a1a,   0.11, HEAD_Y + 0.07, 0.26);
  addSph(root, 0.03,  6, 0xffffff,  -0.10, HEAD_Y + 0.09, 0.30);
  addSph(root, 0.03,  6, 0xffffff,   0.12, HEAD_Y + 0.09, 0.30);

  // Rosy cheeks
  addSph(root, 0.07, 8, 0xff8877, -0.22, HEAD_Y - 0.04, 0.23);
  addSph(root, 0.07, 8, 0xff8877,  0.22, HEAD_Y - 0.04, 0.23);

  // Eyebrows
  addBox(root, 0.14, 0.045, 0.06, ORANGE, -0.11, HEAD_Y + 0.19, 0.27);
  addBox(root, 0.14, 0.045, 0.06, ORANGE,  0.11, HEAD_Y + 0.19, 0.27);

  // Mustache
  addSph(root, 0.09, 8, ORANGE, -0.10, HEAD_Y - 0.02, 0.29);
  addSph(root, 0.09, 8, ORANGE,  0.10, HEAD_Y - 0.02, 0.29);

  // Beard clump
  addSph(root, 0.17, 9, ORANGE,  0.00, HEAD_Y - 0.14, 0.26);
  addSph(root, 0.12, 8, ORANGE, -0.15, HEAD_Y - 0.18, 0.21);
  addSph(root, 0.12, 8, ORANGE,  0.15, HEAD_Y - 0.18, 0.21);
  addSph(root, 0.09, 7, ORANGE,  0.00, HEAD_Y - 0.28, 0.19);

  // ── Hat ─────────────────────────────────────────────────────────────────
  const BRIM_Y  = HEAD_Y + HEAD_R + 0.035;   // 2.145
  const CROWN_H = 0.56;

  addCyl(root, 0.54, 0.57, 0.07, 16, G_HAT,  0, BRIM_Y,                    0);  // brim
  addCyl(root, 0.30, 0.33, CROWN_H, 12, G_HAT,  0, BRIM_Y + CROWN_H / 2 + 0.035, 0);  // crown
  addCyl(root, 0.33, 0.33, 0.10, 12, BLACK, 0, BRIM_Y + 0.07,              0);  // band
  addBox(root, 0.15, 0.11, 0.34,     GOLD,  0, BRIM_Y + 0.07,              0);  // buckle

  // ── Wings (retracted by default — scale driven at runtime) ───────────────
  // Pivot at back of upper torso, one per side, behind the lapel boxes
  const WING_Z   = -0.22;              // flush with torso back face
  const WING_Y   = TORSO_CY + 0.18;   // upper-torso / shoulder height
  const W_MAT    = () => new THREE.MeshLambertMaterial({
    color: 0x77ffcc, transparent: true, opacity: 0.82, side: THREE.DoubleSide,
  });

  // Left wing group
  const wingL = new THREE.Group();
  wingL.position.set(-0.30, WING_Y, WING_Z);
  // Upper blade — larger, angled up
  const wLU = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.58, 0.03), W_MAT());
  wLU.position.set(-0.78, 0.34, 0);
  wingL.add(wLU);
  // Lower blade — smaller, angled slightly down
  const wLL = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.42, 0.03), W_MAT());
  wLL.position.set(-0.58, -0.24, 0);
  wingL.add(wLL);
  root.add(wingL);

  // Right wing group (mirror)
  const wingR = new THREE.Group();
  wingR.position.set( 0.30, WING_Y, WING_Z);
  const wRU = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.58, 0.03), W_MAT());
  wRU.position.set( 0.78, 0.34, 0);
  wingR.add(wRU);
  const wRL = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.42, 0.03), W_MAT());
  wRL.position.set( 0.58, -0.24, 0);
  wingR.add(wRL);
  root.add(wingR);

  return { root, legL, legR, armL, armR, wingL, wingR };
}

// ── CharacterController ──────────────────────────────────────────────────────
export class CharacterController {
  constructor(camera, scene) {
    this.camera = camera;

    // World position (always on ground, y=0)
    this._pos         = new THREE.Vector3(0, 0, 35);
    this._facing      = Math.PI;        // initially faces –Z (into scene)
    this._targetFacing = Math.PI;
    this._walkCycle   = 0;
    this._idleTimer   = 0;
    this._moving      = false;

    // Vertical physics
    this._velY      = 0;
    this._onGround  = true;
    this._landTimer = 0;     // > 0 while playing landing squish

    // Camera orbit
    this._camYaw    = Math.PI;          // directly behind character
    this._camPitch  = CAM_PITCH;
    this._camRadius = CAM_RADIUS;

    // Smooth camera tween target
    this._tweenYaw    = null;
    this._tweenPitch  = null;
    this._tweenRadius = null;

    // Fly / wing state
    this._flyMode   = false;
    this._wingOpen  = 0;     // 0 = retracted, 1 = fully spread
    this._flapAngle = 0;     // current flap angle (rad); + = wings up
    this._flapVelAng= 0;     // angular velocity for spring physics
    this._prevSpace = false; // previous-frame space state (edge detection)

    // Build & place model
    const { root, legL, legR, armL, armR, wingL, wingR } = buildCelso();
    this._model = root;
    this._legL  = legL;
    this._legR  = legR;
    this._armL  = armL;
    this._armR  = armR;
    this._wingL = wingL;
    this._wingR = wingR;
    root.position.copy(this._pos);
    scene.add(root);

    // Input
    this._keys  = {};
    this._drag  = { active: false, x: 0, y: 0 };

    this._bindEvents();
    this._applyCamera();
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  _bindEvents() {
    window.addEventListener('keydown', e => {
      this._keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup',   e => { this._keys[e.code] = false; });

    window.addEventListener('mousedown', e => {
      // Ignore clicks on UI elements
      if (e.target.closest('#control-panel, #celso-popup')) return;
      this._drag.active = true;
      this._drag.x = e.clientX;
      this._drag.y = e.clientY;
    });
    window.addEventListener('mouseup',   () => { this._drag.active = false; });
    window.addEventListener('mousemove', e => {
      if (!this._drag.active) return;
      const dx = e.clientX - this._drag.x;
      const dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX;
      this._drag.y = e.clientY;
      this._camYaw   -= dx * 0.005;
      this._camPitch  = Math.max(-0.55, Math.min(1.45, this._camPitch + dy * 0.004));
      this._tweenYaw = this._tweenPitch = this._tweenRadius = null; // cancel tween
    });
    window.addEventListener('wheel', e => {
      e.preventDefault();
      this._camRadius = Math.max(2.5, Math.min(30, this._camRadius * (e.deltaY > 0 ? 1.1 : 0.91)));
      this._tweenRadius = null;
    }, { passive: false });
  }

  // ── Camera presets ────────────────────────────────────────────────────────
  tweenTo(presetName) {
    const p = typeof presetName === 'string' ? PRESETS[presetName] : presetName;
    if (!p) return;
    this._tweenYaw    = p.yaw    ?? this._camYaw;
    this._tweenPitch  = p.pitch  ?? this._camPitch;
    this._tweenRadius = p.radius ?? this._camRadius;
  }

  resetToDefault() { this.tweenTo('Rainbow View'); }

  // ── Camera update ─────────────────────────────────────────────────────────
  _applyCamera() {
    const lx    = this._pos.x;
    const lz    = this._pos.z;
    const lookY = this._model.position.y + 1.62;   // head height

    const camX = lx + Math.sin(this._camYaw) * this._camRadius * Math.cos(this._camPitch);
    const camZ = lz + Math.cos(this._camYaw) * this._camRadius * Math.cos(this._camPitch);
    const camY = lookY + Math.sin(this._camPitch) * this._camRadius;

    // Never clip below terrain surface
    const minY = terrainHeight(camX, camZ) + 0.5;

    this.camera.position.set(camX, Math.max(camY, minY), camZ);
    this.camera.lookAt(lx, lookY, lz);
  }

  // ── Main update ───────────────────────────────────────────────────────────
  update(dt) {
    // Smooth camera preset tweens
    if (this._tweenYaw !== null) {
      let diff = ((this._tweenYaw - this._camYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this._camYaw += diff * Math.min(1, dt * 5);
      if (Math.abs(diff) < 0.001) this._tweenYaw = null;
    }
    if (this._tweenPitch !== null) {
      this._camPitch += (this._tweenPitch - this._camPitch) * Math.min(1, dt * 5);
      if (Math.abs(this._tweenPitch - this._camPitch) < 0.001) this._tweenPitch = null;
    }
    if (this._tweenRadius !== null) {
      this._camRadius += (this._tweenRadius - this._camRadius) * Math.min(1, dt * 5);
      if (Math.abs(this._tweenRadius - this._camRadius) < 0.01) this._tweenRadius = null;
    }

    // ── Movement ────────────────────────────────────────────────────────────
    const k     = this._keys;
    const shift = k['ShiftLeft'] || k['ShiftRight'];
    const speed = shift ? RUN_SPEED : WALK_SPEED;

    // Camera-relative XZ movement vectors
    const fwdX = -Math.sin(this._camYaw);
    const fwdZ = -Math.cos(this._camYaw);
    const rgtX =  Math.cos(this._camYaw);
    const rgtZ = -Math.sin(this._camYaw);

    let mx = 0, mz = 0;
    if (k['KeyW'] || k['ArrowUp'])    { mx += fwdX; mz += fwdZ; }
    if (k['KeyS'] || k['ArrowDown'])  { mx -= fwdX; mz -= fwdZ; }
    if (k['KeyA'] || k['ArrowLeft'])  { mx -= rgtX; mz -= rgtZ; }
    if (k['KeyD'] || k['ArrowRight']) { mx += rgtX; mz += rgtZ; }

    this._moving = (mx !== 0 || mz !== 0);

    if (this._moving) {
      const len = Math.sqrt(mx * mx + mz * mz);
      mx /= len; mz /= len;
      this._pos.x = Math.max(-210, Math.min(210, this._pos.x + mx * speed * dt));
      this._pos.z = Math.max(-210, Math.min(210, this._pos.z + mz * speed * dt));
      this._targetFacing = Math.atan2(mx, mz);
      this._walkCycle   += dt * WALK_FREQ * (speed / WALK_SPEED);
      this._idleTimer    = 0;
    } else {
      this._idleTimer += dt;
    }

    // ── Vertical physics (jump + gravity + fly) ──────────────────────────────
    const spaceJustPressed = !!k['Space'] && !this._prevSpace;
    this._prevSpace = !!k['Space'];

    if (spaceJustPressed) {
      if (this._onGround) {
        // Normal jump — launch upward
        this._velY     = JUMP_VEL;
        this._onGround = false;
      } else {
        // Airborne — flap! Deploy wings and boost upward
        this._flyMode    = true;
        this._velY       = FLAP_VEL;
        this._flapVelAng = -9;   // sharp angular impulse: wings snap DOWN (power stroke)
      }
    }

    const groundY = terrainHeight(this._pos.x, this._pos.z);

    if (!this._onGround) {
      this._velY  -= GRAVITY * dt;
      this._pos.y += this._velY * dt;

      if (this._pos.y <= groundY) {
        this._pos.y     = groundY;
        this._velY      = 0;
        this._onGround  = true;
        this._flyMode   = false;   // landing retracts wings
        this._landTimer = LAND_DUR;
      }
    } else {
      this._pos.y = groundY;
    }

    // Smooth character rotation toward movement direction
    let faceDiff = ((this._targetFacing - this._facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this._facing += faceDiff * Math.min(1, dt * 10);

    // ── Model animation ──────────────────────────────────────────────────────
    const wc = this._walkCycle;
    const inAir = !this._onGround;

    // Ground bob (suppressed while airborne)
    let bobY = 0;
    if (!inAir) {
      bobY = this._moving
        ? Math.abs(Math.sin(wc * 2)) * 0.07
        : Math.sin(this._idleTimer * 1.3) * 0.018;
    }

    this._model.position.set(this._pos.x, this._pos.y + bobY, this._pos.z);
    this._model.rotation.y = this._facing;

    // Landing squish: briefly flatten vertically and widen horizontally
    if (this._landTimer > 0) {
      this._landTimer -= dt;
      const t      = Math.max(0, this._landTimer / LAND_DUR);
      const squish = 1 - Math.sin(Math.PI * t) * 0.28;
      this._model.scale.set(1 / squish, squish, 1 / squish);
    } else {
      this._model.scale.set(1, 1, 1);
    }

    if (inAir) {
      // In-air pose: legs tuck back, arms out for balance
      const rising = this._velY > 0;
      const tuck   = rising ? -0.55 : 0.35;     // legs angled differently going up vs down
      this._legL.rotation.x += (tuck - this._legL.rotation.x) * Math.min(1, dt * 14);
      this._legR.rotation.x += (tuck - this._legR.rotation.x) * Math.min(1, dt * 14);
      this._armL.rotation.x += (-0.7 - this._armL.rotation.x) * Math.min(1, dt * 14);
      this._armR.rotation.x += (-0.7 - this._armR.rotation.x) * Math.min(1, dt * 14);
    } else if (this._moving) {
      const swing = Math.sin(wc) * 0.52;
      this._legL.rotation.x  =  swing;
      this._legR.rotation.x  = -swing;
      this._armL.rotation.x  = -swing * 0.65;
      this._armR.rotation.x  =  swing * 0.65;
    } else {
      // Settle back to rest pose
      this._legL.rotation.x *= 0.82;
      this._legR.rotation.x *= 0.82;
      this._armL.rotation.x  = this._armL.rotation.x * 0.82
                              + Math.sin(this._idleTimer * 0.7) * 0.025;
      this._armR.rotation.x  = this._armR.rotation.x * 0.82
                              + Math.sin(this._idleTimer * 0.7 + Math.PI) * 0.025;
    }

    // ── Wing animation ────────────────────────────────────────────────────────
    // Smoothly open / close wings based on fly mode
    const wingTarget = this._flyMode ? 1 : 0;
    this._wingOpen  += (wingTarget - this._wingOpen) * Math.min(1, dt * 9);

    if (this._wingOpen < 0.02) {
      // Fully retracted — reset spring so wings don't thrash when re-deployed
      this._flapAngle  = 0;
      this._flapVelAng = 0;
    } else {
      // Wing flap spring: rest angle = slight upward tilt + gentle hover flutter
      const REST = 0.20 + Math.sin(this._idleTimer * 4.8) * 0.04;
      this._flapVelAng += (-24 * (this._flapAngle - REST) - 7 * this._flapVelAng) * dt;
      this._flapAngle  += this._flapVelAng * dt;
    }

    const wo = this._wingOpen;
    this._wingL.scale.set(wo, wo, 1);
    this._wingR.scale.set(wo, wo, 1);
    // Left wing: negative Z rotation = tip up; Right wing: positive = tip up
    this._wingL.rotation.z = -this._flapAngle * wo;
    this._wingR.rotation.z =  this._flapAngle * wo;

    // ── Camera & FOV ─────────────────────────────────────────────────────────
    this._applyCamera();

    if (this.camera.fov !== Config.camera.fov) {
      this.camera.fov = Config.camera.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
