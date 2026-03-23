/**
 * config.js
 * Central configuration and live state for the Droplet simulation.
 * All modules read from here; the UI writes to here.
 */

export const Config = {
  // Sun
  sun: {
    azimuth: 180,      // degrees (0 = north, 180 = south)
    elevation: 25,     // degrees above horizon
    intensity: 1.5,
    distance: 400,     // distance for the visual sun sphere
  },

  // Rain
  rain: {
    count: 8000,       // number of droplets
    size: 1.0,         // relative size multiplier
    speed: 1.0,        // fall speed multiplier
    drift: 0.0,        // horizontal wind drift (x axis)
    spawnWidth: 200,   // half-width of spawn volume (x)
    spawnDepth: 200,   // half-depth of spawn volume (z)
    spawnHeight: 120,  // total height of spawn column
    groundY: 0,        // y level at which drops are recycled
  },

  // Camera defaults
  camera: {
    fov: 60,
    near: 0.1,
    far: 2000,
    initialPosition: { x: 0, y: 15, z: 80 },
    initialTarget:   { x: 0, y: 20, z: 0 },
  },

  // Simulation
  simulation: {
    timeScale: 1.0,
    paused: false,
  },
};
