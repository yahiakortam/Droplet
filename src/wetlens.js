/**
 * wetlens.js
 * Wet-glass raindrop post-processing effect.
 *
 * Architecture:
 *   1. Scene is rendered into a WebGLRenderTarget (offscreen).
 *   2. CPU simulation drives two kinds of drops:
 *        STATIC  — small beads that cling to the glass and slowly fade.
 *        SLIDERS — large teardrops that slide downward, leaving wet trails.
 *   3. Drop data (position, radius, opacity) is packed into a DataTexture
 *      that is sampled per-pixel in the GLSL lens shader.
 *   4. Slider trails are painted onto a CanvasTexture each frame and faded.
 *   5. A full-screen quad applies:
 *        • sphere-cap refraction  (lens distortion per drop)
 *        • chromatic aberration   (R/G/B channels slightly offset)
 *        • specular glints        (Blinn-Phong + soft secondary halo)
 *        • trail darkening        (wet-streak distortion)
 *        • vignette               (subtle corner darkening)
 */

import * as THREE from 'three';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_DROPS = 110;
const N_SLIDERS =  18;
const N_STATIC  = MAX_DROPS - N_SLIDERS;   // 92

// ── Drop simulation ──────────────────────────────────────────────────────────
class Drop {
  constructor(slider, randomStart = false) {
    this.slider = slider;
    this._spawn(randomStart);
  }

  _spawn(randomStart) {
    // Position
    this.x = Math.random();
    this.y = randomStart
      ? Math.random()
      : (this.slider ? 1.10 + Math.random() * 0.05 : Math.random());

    // Size — sliders are bigger teardrops
    this.r = this.slider
      ? 0.020 + Math.random() * 0.030
      : 0.004 + Math.random() * 0.015;

    // Physics
    this.vy   = this.slider ? 0.040 + Math.random() * 0.080 : 0;
    this.op   = 0;
    this.life = 0;
    this.maxLife = this.slider
      ? 2.5 + Math.random() * 3.5
      : 5.0 + Math.random() * 12.0;
    this.dead = false;

    // Subtle side-to-side wobble for sliders
    this.wobbleAmp  = this.slider ? 0.0015 + Math.random() * 0.004 : 0;
    this.wobbleFreq = 0.8 + Math.random() * 2.5;
    this.wobbleBase = Math.random() * Math.PI * 2;

    // Previous position (for trail painting)
    this.px = this.x;
    this.py = this.y;
  }

  update(dt) {
    this.px = this.x;
    this.py = this.y;

    this.life += dt;
    const t = this.life / this.maxLife;

    // Opacity envelope: fast fade-in, long hold, gentle fade-out
    if      (t < 0.10) this.op = t / 0.10;
    else if (t < 0.80) this.op = 1.0;
    else               this.op = 1.0 - (t - 0.80) / 0.20;
    this.op = Math.max(0, Math.min(1, this.op));

    // Movement
    if (this.slider) {
      this.y -= this.vy * dt;
      this.x += Math.sin(this.wobbleBase + this.life * this.wobbleFreq)
              * this.wobbleAmp;
      this.x  = Math.max(0.01, Math.min(0.99, this.x));
    }

    if (t >= 1.0 || this.y < -0.08) this.dead = true;
  }
}

// ── WetLens ──────────────────────────────────────────────────────────────────
export class WetLens {
  constructor(renderer) {
    this._renderer = renderer;
    this._drops    = [];
    this._time     = 0;
    this._enabled  = true;

    // Seed drops evenly across the screen on first load
    for (let i = 0; i < N_SLIDERS; i++) this._drops.push(new Drop(true,  true));
    for (let i = 0; i < N_STATIC;  i++) this._drops.push(new Drop(false, true));

    this._buildRT();
    this._buildTrailMap();
    this._buildDropTex();
    this._buildQuad();
  }

  // ── Construction helpers ─────────────────────────────────────────────────

  _buildRT() {
    const { width: w, height: h } = this._renderer.domElement;
    this._rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }

  _buildTrailMap() {
    // A canvas that sliders paint trails onto; faded toward neutral each frame.
    // Encodes a 2-channel normal map: (R=0.5, G=0.5) is neutral (no distortion).
    const W = 512, H = 1024;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#808080';   // neutral normal
    ctx.fillRect(0, 0, W, H);
    this._trailCanvas = c;
    this._trailCtx    = ctx;
    this._trailTex    = new THREE.CanvasTexture(c);
  }

  _buildDropTex() {
    // MAX_DROPS × 1 RGBA float texture
    // Each texel: (x, y, radius, opacity)
    this._dropData = new Float32Array(MAX_DROPS * 4);
    this._dropTex  = new THREE.DataTexture(
      this._dropData,
      MAX_DROPS, 1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this._dropTex.minFilter   = THREE.NearestFilter;
    this._dropTex.magFilter   = THREE.NearestFilter;
    this._dropTex.needsUpdate = true;
  }

  _buildQuad() {
    this._qScene  = new THREE.Scene();
    this._qCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ── Vertex shader ────────────────────────────────────────────────────────
    const VERT = /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    // ── Fragment shader ──────────────────────────────────────────────────────
    const FRAG = /* glsl */`
      precision highp float;
      #define N_DROPS ${MAX_DROPS}

      uniform sampler2D sceneTex;   // rendered scene
      uniform sampler2D dropTex;    // (x,y,r,op) per drop
      uniform sampler2D trailTex;   // painted trail normals
      uniform float     aspect;     // width / height
      uniform float     time;

      varying vec2 vUv;

      // A sun-like key light for specular highlights
      const vec3 LIGHT = normalize(vec3(0.30, 0.78, 0.55));
      const vec3 VIEW  = vec3(0.0, 0.0, 1.0);

      void main() {
        vec2  uv         = vUv;
        vec2  refOff     = vec2(0.0);
        float specAcc    = 0.0;
        float interiorAcc = 0.0;

        // ── Per-drop lens pass ──────────────────────────────────────────────
        for (int i = 0; i < N_DROPS; i++) {
          float tx = (float(i) + 0.5) / float(N_DROPS);
          vec4  d  = texture2D(dropTex, vec2(tx, 0.5));

          vec2  center = d.xy;
          float r      = d.z;
          float op     = d.w;
          if (op < 0.01 || r < 0.0001) continue;

          // Aspect-correct distance to drop center
          vec2  dv   = uv - center;
          dv.x      *= aspect;
          float dist = length(dv);
          if (dist >= r) continue;

          // Sphere-cap surface normal
          float n  = dist / r;          // normalised distance [0,1)
          float hz = sqrt(max(0.0, 1.0 - n * n));
          vec3  N  = normalize(vec3(dv / r, hz));

          // Refraction — peaks at mid-radius where the surface tilts most
          float lensProfile = smoothstep(0.0, 0.8, n) * smoothstep(1.0, 0.65, n);
          refOff += N.xy * 0.072 * op * lensProfile;

          // Specular: sharp primary glint + soft secondary halo
          vec3  H   = normalize(LIGHT + VIEW);
          float dp  = max(0.0, dot(N, H));
          float s1  = pow(dp, 140.0);           // tight glint
          float s2  = pow(dp,  18.0) * 0.10;    // soft halo
          specAcc  += (s1 + s2) * op;

          // Interior coverage (for tint)
          interiorAcc = max(interiorAcc, op * (1.0 - n));
        }

        // ── Chromatic aberration ────────────────────────────────────────────
        // R and B channels are displaced slightly more/less than G,
        // creating a natural colour-fringe at drop edges.
        vec2 uvR = clamp(uv + refOff * 1.06, 0.001, 0.999);
        vec2 uvG = clamp(uv + refOff,        0.001, 0.999);
        vec2 uvB = clamp(uv + refOff * 0.94, 0.001, 0.999);

        vec3 col = vec3(
          texture2D(sceneTex, uvR).r,
          texture2D(sceneTex, uvG).g,
          texture2D(sceneTex, uvB).b
        );

        // ── Trail streaks ───────────────────────────────────────────────────
        vec2  tn    = texture2D(trailTex, uv).rg;
        vec2  tOff  = (tn - 0.5) * 0.026;
        float tStr  = length(tOff) * 20.0;
        if (tStr > 0.003) {
          vec3 tScene = texture2D(sceneTex,
                          clamp(uv + tOff, 0.001, 0.999)).rgb;
          // Wet streaks: slightly darker and desaturated
          float lum   = dot(tScene, vec3(0.299, 0.587, 0.114));
          tScene      = mix(tScene, vec3(lum) * 0.65, 0.35);
          col         = mix(col, tScene, clamp(tStr, 0.0, 0.62));
        }

        // ── Interior tint ───────────────────────────────────────────────────
        // Inside a drop the glass is slightly cooler and brighter —
        // the water acts as a weak lens that concentrates light.
        vec3 tinted = mix(
          col,
          col * vec3(0.86, 0.95, 1.08) * 1.16,
          interiorAcc * 0.48
        );

        // ── Specular glint ──────────────────────────────────────────────────
        // Colour shifts from warm-white at centre to ice-blue toward rim.
        vec3 glintCol = mix(
          vec3(1.00, 0.96, 0.84),
          vec3(0.78, 0.92, 1.00),
          smoothstep(0.0, 1.0, specAcc)
        );
        tinted += glintCol * min(specAcc, 2.8) * 0.88;

        // ── Subtle overall wetness ──────────────────────────────────────────
        // The whole glass surface is faintly cooler / darker when wet.
        tinted = mix(tinted, tinted * vec3(0.96, 0.98, 1.01), 0.18);

        // ── Vignette ────────────────────────────────────────────────────────
        vec2  vp = (uv - 0.5) * vec2(0.88, 1.15);
        float v  = pow(clamp(1.0 - dot(vp, vp), 0.0, 1.0), 0.45);
        tinted  *= mix(0.84, 1.0, v);

        gl_FragColor = vec4(tinted, 1.0);
      }
    `;

    this._mat = new THREE.ShaderMaterial({
      uniforms: {
        sceneTex: { value: this._rt.texture },
        dropTex:  { value: this._dropTex },
        trailTex: { value: this._trailTex },
        aspect:   { value: this._renderer.domElement.width /
                           this._renderer.domElement.height },
        time:     { value: 0.0 },
      },
      vertexShader:   VERT,
      fragmentShader: FRAG,
      depthTest:  false,
      depthWrite: false,
    });

    this._qScene.add(
      new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._mat)
    );
  }

  // ── Per-frame helpers ────────────────────────────────────────────────────

  _updateDrops(dt) {
    for (const d of this._drops) d.update(dt);

    // Replace dead drops with fresh ones of the same type
    for (let i = this._drops.length - 1; i >= 0; i--) {
      if (this._drops[i].dead) {
        const wasSlider = this._drops[i].slider;
        this._drops.splice(i, 1);
        this._drops.push(new Drop(wasSlider, false));
      }
    }
  }

  _uploadDropTex() {
    let i = 0;
    for (const d of this._drops) {
      const b = i++ * 4;
      this._dropData[b    ] = d.x;
      this._dropData[b + 1] = d.y;
      this._dropData[b + 2] = d.r;
      this._dropData[b + 3] = d.op;
      if (i >= MAX_DROPS) break;
    }
    // Zero out any unused slots
    for (; i < MAX_DROPS; i++) this._dropData[i * 4 + 3] = 0;
    this._dropTex.needsUpdate = true;
  }

  _paintTrails() {
    const ctx = this._trailCtx;
    const W   = this._trailCanvas.width;
    const H   = this._trailCanvas.height;

    // Fade toward neutral — the fill converges to (128, 128) over time.
    // source-over with rgba(128,128,128, α) converges to 128 at equilibrium.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(128,128,128,0.055)';
    ctx.fillRect(0, 0, W, H);

    for (const d of this._drops) {
      if (!d.slider || d.op < 0.03) continue;

      const cx  = d.x  * W;
      const cy  = (1 - d.y)  * H;   // current position (canvas Y is flipped)
      const pcy = (1 - d.py) * H;   // previous position

      const tw = Math.max(1.2, d.r * W * 0.30);

      // Trail normal: slightly upward-pointing (G < 128) so the shader
      // displaces the sample downward, creating a wet-streak look.
      const alpha = d.op * 0.72;
      const grad  = ctx.createLinearGradient(cx, pcy, cx, cy);
      grad.addColorStop(0, `rgba(128, 78, 128, 0)`);
      grad.addColorStop(1, `rgba(128, 78, 128, ${alpha})`);

      ctx.lineWidth   = tw;
      ctx.lineCap     = 'round';
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, pcy);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }

    this._trailTex.needsUpdate = true;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  get enabled() { return this._enabled; }
  set enabled(v) { this._enabled = v; }

  /** Call on window resize. */
  resize() {
    const { width: w, height: h } = this._renderer.domElement;
    this._rt.setSize(w, h);
    this._mat.uniforms.aspect.value = w / h;
  }

  /**
   * Drop-in replacement for renderer.render(scene, camera).
   * When disabled, falls back to a direct render with no effect.
   */
  render(scene, camera, dt) {
    if (!this._enabled) {
      this._renderer.render(scene, camera);
      return;
    }

    this._time += dt;
    this._mat.uniforms.time.value   = this._time;
    this._mat.uniforms.aspect.value =
      this._renderer.domElement.width / this._renderer.domElement.height;

    this._updateDrops(dt);
    this._uploadDropTex();
    this._paintTrails();

    // Pass 1 — render scene into render target
    this._renderer.setRenderTarget(this._rt);
    this._renderer.render(scene, camera);

    // Pass 2 — composite wet-lens effect to screen
    this._renderer.setRenderTarget(null);
    this._renderer.render(this._qScene, this._qCamera);
  }
}
