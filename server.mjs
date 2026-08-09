/*
 * Copyright (c) 2026 zc142365 <zc142365@gmail.com>
 * https://github.com/zc142365
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/**
 * Hosting server for Personal Marble Roulette.
 *
 * Serves dist/ as-is and relays the admin's race settings to spectators, per room.
 * The relay is nothing but state polling plus admin-only POSTs, so there are no
 * external dependencies.
 *
 *   node server.mjs           (a random ADMIN_KEY is generated and printed if unset)
 *   PORT=8080 ADMIN_KEY=mykey node server.js
 */
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
let ADMIN_KEY = process.env.ADMIN_KEY || randomBytes(16).toString('hex');
const DIST = new URL('./dist/', import.meta.url);

const START_LEAD = 3500; // ms for everyone to receive the signal; must exceed the poll interval
const SESSION_TTL = 120000; // races older than this are not replayed for newcomers
const MAX_NAMES = 300;
const MAX_BODY = 64 * 1024;
const MAX_ROOMS = 100;

let joinOrigin = ''; // address handed to participants; filled in by start()
let joinPending = false; // a tunnel is being created, so no address to hand out yet

/** Mark that a public address is on its way, so clients do not flash the LAN one */
export function setPublicPending() {
  joinPending = true;
}

/** Override the address handed to participants once a tunnel (cloudflared) is up */
export function setPublicOrigin(url) {
  joinOrigin = url.endsWith('/') ? url : `${url}/`;
  joinPending = false;
  return joinOrigin;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.map': 'application/json',
};

/** Reject any path that points outside dist/ */
export function resolveAsset(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const url = new URL(decoded.replace(/^\/+/, '') || 'index.html', DIST);
  return url.href.startsWith(DIST.href) ? url : null;
}

const rooms = new Map();

export function getRoom(name) {
  const key = String(name || 'main').slice(0, 64);
  const found = rooms.get(key);
  if (found) {
    found.touched = Date.now();
    return found;
  }

  // Once exposed to the internet, unlimited room creation must not eat memory.
  // Drop the least recently used rooms first.
  if (rooms.size >= MAX_ROOMS) {
    const oldest = [...rooms.entries()].sort((a, b) => a[1].touched - b[1].touched);
    for (const [name] of oldest.slice(0, Math.ceil(MAX_ROOMS / 2))) rooms.delete(name);
  }

  const created = { session: null, lobby: null, touched: Date.now() };
  rooms.set(key, created);
  return created;
}

const cleanNames = (value) =>
  (Array.isArray(value) ? value : [])
    .filter((name) => typeof name === 'string')
    .map((name) => name.slice(0, 100))
    .slice(0, MAX_NAMES);

const cleanInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || 0));

/**
 * Update room state and return what should be published. Anything from a
 * non-admin is ignored, so a spectator faking the start button stops here.
 */
export function applyMessage(room, isAdmin, msg, now = Date.now()) {
  if (!isAdmin || !msg || typeof msg !== 'object') return null;

  if (msg.type === 'lobby') {
    room.lobby = { type: 'lobby', names: cleanNames(msg.names), mapIndex: cleanInt(msg.mapIndex, 0, 99) };
    return room.lobby;
  }

  if (msg.type === 'session') {
    const names = cleanNames(msg.names);
    if (names.length === 0) return null;
    room.session = {
      type: 'session',
      seed: cleanInt(msg.seed, 0, 0xffffffff),
      names,
      mapIndex: cleanInt(msg.mapIndex, 0, 99),
      winningRank: cleanInt(msg.winningRank, 0, MAX_NAMES),
      useSkills: !!msg.useSkills,
      startAt: now + START_LEAD,
    };
    room.lobby = null;
    return room.session;
  }

  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const room = url.pathname.startsWith('/api/') ? getRoom(url.searchParams.get('room')) : null;

  if (url.pathname === '/api/state') {
    // Polling. SSE is unusable because proxies such as Cloudflare hold the body.
    // A race is handed out as a start *time*, so 1-2s of lag costs nothing: the
    // client simply catches up.
    const isAdmin = url.searchParams.get('key') === ADMIN_KEY;
    const fresh = room.session && Date.now() - room.session.startAt < SESSION_TTL;
    res.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    res.end(
      JSON.stringify({
        role: isAdmin ? 'admin' : 'viewer',
        now: Date.now(),
        joinOrigin,
        joinPending,
        lobby: room.lobby,
        session: fresh ? room.session : null,
      })
    );
    return;
  }

  if (url.pathname === '/api/lobby' || url.pathname === '/api/session') {
    if (req.method !== 'POST') return send(res, 405, 'method not allowed');
    let msg = null;
    try {
      msg = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, 'bad request');
    }
    const isAdmin = req.headers['x-admin-key'] === ADMIN_KEY;
    if (!isAdmin) return send(res, 403, 'admin only');
    const payload = applyMessage(room, isAdmin, { ...msg, type: url.pathname.slice(5) });
    return send(res, payload ? 200 : 400, payload ? 'ok' : 'bad request');
  }

  const asset = resolveAsset(url.pathname);
  if (!asset) return send(res, 403, 'forbidden');
  try {
    const file = await readFile(asset);
    res.writeHead(200, {
      'content-type': MIME[extname(asset.pathname)] || 'application/octet-stream',
      'cache-control': asset.pathname.endsWith('.html') ? 'no-cache' : 'max-age=3600',
    });
    res.end(file);
  } catch {
    send(res, 404, 'not found');
  }
}

function send(res, code, text) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function localAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

/** Start the server and return the addresses. The Electron app uses this too. */
export function start({ port = DEFAULT_PORT, adminKey = ADMIN_KEY } = {}) {
  ADMIN_KEY = adminKey;
  const server = createServer(handler);

  return new Promise((resolve) => {
    server.once('error', (err) => {
      if (err.code !== 'EADDRINUSE') throw err;
      console.warn(`${port} 포트가 사용중이라 빈 포트로 띄운다`);
      server.listen(0);
    });
    server.on('listening', () => {
      const port = server.address().port;
      // The admin is whoever started the server, so they get localhost: that works
      // even before the firewall prompt is accepted. Only the participant-facing
      // address uses the LAN IP.
      joinOrigin = process.env.PUBLIC_URL ? setPublicOrigin(process.env.PUBLIC_URL) : `http://${localAddress()}:${port}/`;
      resolve({
        server,
        port,
        joinUrl: joinOrigin,
        adminUrl: `http://localhost:${port}/?key=${ADMIN_KEY}`,
        adminKey: ADMIN_KEY,
      });
    });
    server.listen(port);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  readFile(new URL('index.html', DIST)).catch(() => {
    console.error('dist/ 가 없다. 먼저 `yarn build` 를 실행할 것.');
    process.exit(1);
  });
  start().then(({ joinUrl, adminUrl }) => {
    console.log(`관전자/참여자 : ${joinUrl}`);
    console.log(`관리자        : ${adminUrl}`);
    console.log(`방을 나누려면 URL 에 &room=이름 을 붙이면 된다.`);
  });
}
