/**
 * sun.js
 * Creates and manages the Sun: a directional light plus a visible glowing sphere.
 * Position is driven by azimuth + elevation angles from Config.
 */

import * as THREE from 'three';
import { Config } from './config.js';

const DEG = Math.PI / 180;

export class Sun {
  constructor(scene) {
    this.scene = scene;

    // Directional light representing sunlight
    this.light = new THREE.DirectionalLight(0xfff5e0, Config.sun.intensity);
    this.light.castShadow = false; // disabled for performance at this stage
    scene.add(this.light);

    // Hemisphere light for sky/ground ambient bounce
    this.hemi = new THREE.HemisphereLight(0x6699cc, 0x334422, 0.4);
    scene.add(this.hemi);

    // Visual sun disc — a glowing sphere sprite
    const sunGeo = new THREE.SphereGeometry(6, 16, 12);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
    this.mesh = new THREE.Mesh(sunGeo, sunMat);
    scene.add(this.mesh);

    // Corona / glow — larger transparent sphere around the sun
    const coronaGeo = new THREE.SphereGeometry(10, 16, 12);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xffe080,
      transparent: true,
      opacity: 0.15,
    });
    this.corona = new THREE.Mesh(coronaGeo, coronaMat);
    scene.add(this.corona);

    // Lens flare alternative: a point light near the sun for bloom-like effect
    this.pointLight = new THREE.PointLight(0xfffacd, 0.8, 800);
    scene.add(this.pointLight);

    this._position = new THREE.Vector3();
    this.update();
  }

  /**
   * Computes world-space sun position from azimuth + elevation.
   * Azimuth: 0=north (+z), 90=east (+x), 180=south (-z), 270=west (-x)
   * Elevation: 0=horizon, 90=zenith
   */
  _computePosition() {
    const az  = Config.sun.azimuth  * DEG;
    const el  = Config.sun.elevation * DEG;
    const r   = Config.sun.distance;

    const x = r * Math.cos(el) * Math.sin(az);
    const y = r * Math.sin(el);
    const z = r * Math.cos(el) * Math.cos(az);

    this._position.set(x, y, z);
    return this._position;
  }

  update() {
    const pos = this._computePosition();

    this.light.position.copy(pos);
    this.light.intensity = Config.sun.intensity;

    this.mesh.position.copy(pos);
    this.corona.position.copy(pos);
    this.pointLight.position.copy(pos);
    this.pointLight.intensity = Config.sun.intensity * 0.5;

    // Tint the sky hemisphere slightly by sun elevation
    const t = Math.max(0, Math.sin(Config.sun.elevation * DEG));
    this.hemi.color.setHSL(0.6 - t * 0.05, 0.6, 0.3 + t * 0.3);
  }
}
