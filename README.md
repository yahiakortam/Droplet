# Droplet

**Interactive Rainbow Physics Simulation**
Physics 7C Final Project — Yahia Kortam, Aayaan, Reese

---

## Overview

Droplet is a real-time 3D simulation that visualizes how a rainbow forms when sunlight interacts with falling raindrops. The simulation demonstrates the core optics concepts of **refraction**, **internal reflection**, and **dispersion** inside spherical water droplets, and shows how these effects produce a visible rainbow arc when the observer, light source, and droplets align at the correct geometry.

## Physics

White light enters a spherical raindrop and undergoes:

1. **Refraction** at the air-water boundary (Snell's Law, n ≈ 1.333)
2. **Internal reflection** off the back of the droplet
3. **Refraction again** as light exits back toward the observer

**Dispersion** — the refractive index of water varies slightly with wavelength — causes different colors to exit at slightly different angles, separating white light into the visible spectrum. The primary rainbow appears at ~42° from the anti-solar point.

## Features

- Gradient sky, ground plane, and atmospheric fog
- Movable Sun with azimuth and elevation controls
- GPU-efficient rain particle system (up to 25,000 droplets, smooth 60fps)
- Rainbow arc computed from geometric optics (Phase 2+)
- Full 3D camera: orbit, pan, zoom, and WASD free-fly
- Live control panel for all simulation parameters

## Controls

| Input | Action |
|---|---|
| Left drag | Orbit camera |
| Right drag | Pan camera |
| Scroll | Zoom |
| W A S D | Fly forward / left / back / right |
| Q / E | Fly down / up |

## Control Panel

| Parameter | Description |
|---|---|
| Sun Azimuth | Horizontal sun position (0–360°) |
| Sun Elevation | Height above horizon (0–90°) |
| Sun Intensity | Brightness of sunlight |
| Rain Density | Number of droplets (500–25,000) |
| Drop Size | Size multiplier for droplets |
| Fall Speed | Rain fall speed multiplier |
| Wind Drift | Horizontal drift of rainfall |
| Time Scale | Global simulation speed |
| FOV | Camera field of view |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server (opens browser automatically)
npm run dev
```

Requires Node.js 18+.

## Project Structure

```
src/
├── main.js       # Entry point, renderer, animation loop
├── config.js     # Central live configuration
├── scene.js      # Sky, ground, fog, ambient light
├── sun.js        # Sun light + visual sphere
├── rain.js       # GPU particle system
├── camera.js     # Orbit / pan / zoom / fly controller
├── ui.js         # Control panel wiring + stats
└── style.css     # UI styles
```

## Roadmap

- [x] Phase 1 — Scene, rain system, camera, sun controls
- [ ] Phase 2 — Rainbow physics (Snell's Law, dispersion, arc rendering)
- [ ] Phase 3 — Secondary rainbow, droplet detail view, polish
