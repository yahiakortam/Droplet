/**
 * server.js — Droplet multiplayer server
 *
 * Serves the built client (dist/) over HTTP and syncs player
 * positions over WebSocket — all on one port so ngrok only needs
 * to tunnel a single URL.
 *
 * Quickstart:
 *   npm install          # install ws
 *   npm run build        # build the client
 *   node server.js       # start on :3001
 *   npx ngrok http 3001  # expose to internet → share that URL
 */

import http              from 'http';
import fs                from 'fs';
import path              from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.PORT || 3001;
const DIST      = path.join(__dirname, 'dist');

// ── MIME map ──────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.mp3':  'audio/mpeg',
  '.json': 'application/json',
  '.map':  'application/json',
  '.ico':  'image/x-icon',
};

// ── Static file server ────────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(DIST, urlPath));

  if (!filePath.startsWith(DIST)) {           // prevent path traversal
    res.writeHead(403); res.end(); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(DIST, 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(d2);
      });
      return;
    }
    const ct = MIME[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ── WebSocket player sync ─────────────────────────────────────────────────────
const wss     = new WebSocketServer({ server: httpServer });
const players = new Map();   // id → { ws, x, y, z, ry, facing }
let   seq     = 1;

function broadcast(msg, excludeId) {
  const str = JSON.stringify(msg);
  players.forEach(({ ws }, id) => {
    if (id !== excludeId && ws.readyState === 1 /* OPEN */) ws.send(str);
  });
}

wss.on('connection', ws => {
  const id    = String(seq++);
  const state = { ws, x: 0, y: 0, z: 35, ry: Math.PI, facing: Math.PI };
  players.set(id, state);

  // Tell new client its own ID + snapshot of everyone else
  ws.send(JSON.stringify({
    type: 'init',
    id,
    players: [...players.entries()]
      .filter(([pid]) => pid !== id)
      .map(([pid, p]) => ({
        id: pid, x: p.x, y: p.y, z: p.z, ry: p.ry, facing: p.facing,
      })),
  }));

  // Tell everyone else about the new arrival
  broadcast({ type: 'join', id, x: state.x, y: state.y, z: state.z,
               ry: state.ry, facing: state.facing }, id);

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type !== 'move') return;
      const p = players.get(id);
      if (!p) return;
      p.x = msg.x; p.y = msg.y; p.z = msg.z;
      p.ry = msg.ry; p.facing = msg.facing;
      broadcast({ type: 'move', id, x: p.x, y: p.y, z: p.z,
                  ry: p.ry, facing: p.facing }, id);
    } catch (_) {}
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({ type: 'leave', id });
    console.log(`[-] Player ${id} left   — ${players.size} online`);
  });

  console.log(`[+] Player ${id} joined — ${players.size} online`);
});

httpServer.listen(PORT, () => {
  console.log(`\n🌈  Droplet server → http://localhost:${PORT}`);
  console.log(`    To invite others: npx ngrok http ${PORT}\n`);
});
