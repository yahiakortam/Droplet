/**
 * celso.js
 * Celso — a Brazilian leprechaun physics guide who pops up to explain
 * the optics concepts playing out in the simulation.
 *
 * He reads the rainbow visibility and sun state each frame and rotates
 * through contextually relevant messages.
 */

import { Config } from './config.js';

// ── Message library ────────────────────────────────────────────────────────
const MSGS = {
  // Shown once on first load
  WELCOME: [
    {
      icon: '🌈',
      title: 'Olá! I\'m Celso!',
      text:  'Point the sun behind you and look toward the rain — I\'ll guide you through the physics of a rainbow!',
    },
  ],

  // Sun is too high for a rainbow
  SUN_HIGH: [
    {
      icon: '☀️',
      title: 'Sol muito alto!',
      text:  'Lower the sun! The primary rainbow disappears when the sun rises above ~42° — part of the geometry.',
    },
    {
      icon: '📐',
      title: 'Why 42°?',
      text:  'Light that enters a drop can only exit within a specific cone. The minimum deviation angle for red light is ~137.5°, so the bow appears at 180° − 137.5° = 42.5° from the anti-solar point.',
    },
  ],

  // Rainbow is forming — cycle through core physics tips
  VISIBLE: [
    {
      icon: '💧',
      title: 'Refração!',
      text:  'As sunlight enters the water droplet, it bends — Snell\'s Law: n₁ sin θ₁ = n₂ sin θ₂. Water has n ≈ 1.333 so light slows and bends inward.',
    },
    {
      icon: '🔮',
      title: 'Internal Reflection',
      text:  'Once inside, light hits the back surface and reflects internally. One reflection → primary rainbow. Two reflections → dimmer secondary arc at ~52°!',
    },
    {
      icon: '🌈',
      title: 'Dispersão!',
      text:  'The refractive index of water varies with wavelength. Violet light bends more (n ≈ 1.343) than red (n ≈ 1.331), so they exit at different angles — that\'s dispersion!',
    },
    {
      icon: '📐',
      title: 'The Magic Angle',
      text:  'The primary bow always sits ~42° from the anti-solar point — the spot directly opposite the sun from your eye. Move your camera; the rainbow follows you!',
    },
    {
      icon: '✨',
      title: 'Color Order',
      text:  'Red is always on the outside (~42.5°), violet on the inside (~40.6°). Try increasing Dispersion in the panel to exaggerate the separation!',
    },
  ],

  // Rainbow not yet visible — give the user a hint
  HINT: [
    {
      icon: '👀',
      title: 'Procurando o arco?',
      text:  'Keep the sun behind you and look into the rain. The rainbow forms at ~42° from the anti-solar point.',
    },
    {
      icon: '🌦️',
      title: 'Tip',
      text:  'Try: Sun elevation ~20–30°, then orbit the camera so you\'re looking away from the sun. The arc will appear!',
    },
  ],

  // Secondary rainbow just turned on
  SECONDARY: [
    {
      icon: '🌈🌈',
      title: 'Arco Duplo!',
      text:  'The secondary rainbow needs TWO internal reflections. Colors are reversed (violet outside, red inside) and it\'s ~50% dimmer — look for it just above the primary!',
    },
    {
      icon: '🌑',
      title: 'Alexander\'s Dark Band',
      text:  'Between the two arcs, the sky is noticeably darker — called Alexander\'s dark band. Light is deflected away from this region by both reflections!',
    },
  ],
};

// ── Celso class ────────────────────────────────────────────────────────────
export class Celso {
  constructor() {
    this._popup    = document.getElementById('celso-popup');
    this._msgTitle = document.getElementById('celso-msg-title');
    this._msgBody  = document.getElementById('celso-message');
    this._icon     = document.getElementById('celso-icon');
    this._dots     = [];

    this._visible      = false;
    this._dismissed    = false; // user closed it; re-open only on state change
    this._state        = 'IDLE';
    this._msgIndex     = 0;
    this._timer        = 0;
    this._stateTimer   = 0;
    this._msgInterval  = 9;    // seconds between tip rotations
    this._shown        = false; // has the welcome message been shown?
    this._prevSecondary = false;

    this._bindEvents();
    this._buildDots();

    // Show welcome after a short delay
    setTimeout(() => {
      if (Config.celso.enabled) this._showSet('WELCOME', 0);
    }, 2200);
  }

  _bindEvents() {
    document.getElementById('celso-close')?.addEventListener('click', () => {
      this._hide();
      this._dismissed = true;
    });

    document.getElementById('celso-prev')?.addEventListener('click', () => {
      const set = MSGS[this._state];
      if (!set || set.length <= 1) return;
      this._msgIndex = (this._msgIndex - 1 + set.length) % set.length;
      this._timer = 0; // reset auto-advance
      this._showSet(this._state, this._msgIndex);
    });

    document.getElementById('celso-next')?.addEventListener('click', () => {
      const set = MSGS[this._state];
      if (!set || set.length <= 1) return;
      this._msgIndex = (this._msgIndex + 1) % set.length;
      this._timer = 0; // reset auto-advance
      this._showSet(this._state, this._msgIndex);
    });
  }

  _buildDots() {
    const container = document.getElementById('celso-dots');
    if (!container) return;
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'celso-dot';
      d.style.cursor = 'pointer';
      d.addEventListener('click', () => {
        this._msgIndex = i;
        this._timer = 0;
        this._showSet(this._state, this._msgIndex);
      });
      container.appendChild(d);
      this._dots.push(d);
    }
  }

  _showSet(setKey, index) {
    const set = MSGS[setKey];
    if (!set) return;
    const msg = set[index % set.length];

    if (this._icon)     this._icon.textContent     = msg.icon;
    if (this._msgTitle) this._msgTitle.textContent  = msg.title;
    if (this._msgBody)  this._msgBody.textContent   = msg.text;

    // Update progress dots
    this._dots.forEach((d, i) => {
      d.classList.toggle('active', i === index % set.length);
      d.style.display = set.length > 1 ? 'block' : 'none';
    });

    this._show();
    this._dismissed = false;
  }

  _show() {
    if (!this._popup) return;
    this._visible = true;
    this._popup.classList.remove('celso-hidden');
  }

  _hide() {
    if (!this._popup) return;
    this._visible = false;
    this._popup.classList.add('celso-hidden');
  }

  /**
   * Called every frame with dt (seconds) and current rainbow visibility.
   */
  update(dt, rainbowVisibility) {
    if (!Config.celso.enabled) { this._hide(); return; }

    this._timer      += dt;
    this._stateTimer += dt;

    // Detect secondary toggle
    if (Config.rainbow.showSecondary && !this._prevSecondary) {
      this._showSet('SECONDARY', 0);
      this._msgIndex = 0;
      this._timer    = 0;
    }
    this._prevSecondary = Config.rainbow.showSecondary;

    // ── Determine current state ──────────────────────────────────────────
    const sunTooHigh = Config.sun.elevation > 42;
    const newState = sunTooHigh           ? 'SUN_HIGH'
                   : rainbowVisibility > 0.25 ? 'VISIBLE'
                   : 'HINT';

    // On state change: switch message set, reopen if dismissed
    if (newState !== this._state && this._stateTimer > 3) {
      this._state      = newState;
      this._msgIndex   = 0;
      this._timer      = 0;
      this._stateTimer = 0;
      if (!this._dismissed || newState === 'VISIBLE') {
        this._showSet(this._state, this._msgIndex);
      }
    }

    // Auto-advance messages while visible
    if (this._visible && this._timer > this._msgInterval) {
      this._timer = 0;
      this._msgIndex++;
      this._showSet(this._state, this._msgIndex);
    }
  }
}
