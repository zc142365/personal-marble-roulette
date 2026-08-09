/*
 * Copyright (c) 2026 zc142365 <zc142365@gmail.com>
 * https://github.com/zc142365
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
// node test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyMessage, resolveAsset } from './server.mjs';

// Must not escape dist/
assert.ok(resolveAsset('/index.html'));
assert.ok(resolveAsset('/').href.endsWith('/dist/index.html'));
assert.equal(resolveAsset('/../server.js'), null);
assert.equal(resolveAsset('/%2e%2e/%2e%2e/etc/passwd'), null);
assert.equal(resolveAsset('/a%00b'), null);

const room = () => ({ session: null, lobby: null, touched: Date.now() });
const config = { type: 'session', seed: 7, names: ['a', 'b'], mapIndex: 1, winningRank: 0, useSkills: true };

// A spectator can change nothing
const viewerRoom = room();
assert.equal(applyMessage(viewerRoom, false, config), null);
assert.equal(applyMessage(viewerRoom, false, { type: 'lobby', names: ['a'] }), null);
assert.equal(viewerRoom.session, null);

// An admin can start, and the start time must be in the future
const adminRoom = room();
const started = applyMessage(adminRoom, true, config, 1000);
assert.ok(started.startAt > 1000);
assert.equal(adminRoom.session, started);
assert.deepEqual(started.names, ['a', 'b']);

// Input is clamped
const big = applyMessage(room(), true, { ...config, names: Array(500).fill('x'), mapIndex: -3 });
assert.equal(big.names.length, 300);
assert.equal(big.mapIndex, 0);
assert.equal(applyMessage(room(), true, { ...config, names: [] }), null);

// Unlimited room creation must not eat memory once exposed
const { getRoom } = await import('./server.mjs');
for (let i = 0; i < 500; i++) assert.ok(getRoom(`r${i}`), '방은 항상 받아야 한다');
const rooms = new Set();
for (let i = 0; i < 500; i++) rooms.add(getRoom(`q${i}`));
assert.ok(rooms.size === 500, '매번 새 방');

// A recently used room survives; the oldest are dropped first
const fresh = getRoom('fresh');
for (let i = 0; i < 40; i++) getRoom(`pad${i}`);
assert.equal(getRoom('fresh'), fresh, '최근에 쓴 방은 유지되어야 한다');

// A spectator's local setup must never touch the race it received. getReady() calls
// setMarbles() (which resets the world) and setWinnerRank() (which changes the
// physics step size through _timeScale), so running it after a session was applied
// makes that client diverge from everyone else.
const guard = (s) => {
  if (s.sessionApplied) return 'skipped';
  if (s.connected && !s.isAdmin) return 'skipped';
  return 'local-setup';
};
assert.equal(guard({ sessionApplied: true, connected: true, isAdmin: false }), 'skipped');
assert.equal(guard({ sessionApplied: true, connected: false, isAdmin: false }), 'skipped', 'role not resolved yet');
assert.equal(guard({ sessionApplied: false, connected: true, isAdmin: false }), 'skipped');
assert.equal(guard({ sessionApplied: false, connected: true, isAdmin: true }), 'local-setup', 'admin may edit');
assert.equal(guard({ sessionApplied: false, connected: false, isAdmin: false }), 'local-setup', 'solo mode');

// the shipped page must carry both guards, before it touches the marbles
const page = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const ready = page.slice(page.indexOf('function getReady()'));
const iSession = ready.indexOf('__sessionApplied');
const iViewer = ready.indexOf('!window.sync.isAdmin');
const iMarbles = ready.indexOf('roulette.setMarbles');
assert.ok(iSession > -1 && iSession < iMarbles, 'session guard must precede setMarbles');
assert.ok(iViewer > -1 && iViewer < iMarbles, 'spectator guard must precede setMarbles');

console.log('ok');
