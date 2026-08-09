import './localization';
import options from './options';
import { registerServiceWorker } from './registerServiceWorker';
import { seedRng } from './rng';
import { Roulette } from './roulette';
import { type Lobby, type Session, sync } from './sync';

registerServiceWorker();

const roulette = new Roulette();

(window as any).roulette = roulette;
(window as any).options = options;
(window as any).sync = sync;

function whenReady(fn: () => void) {
  if (roulette.isReady) fn();
  else setTimeout(() => whenReady(fn), 100);
}

// The map count can differ between client versions. Never blow up on an unknown map.
function setMap(index: number) {
  roulette.setMap(index >= 0 && index < roulette.getMaps().length ? index : 0);
}

// Hide the settings UI from spectators. The server rejects their requests anyway,
// so this is only about keeping the screen clean.
sync.addEventListener('role', () => {
  const spectating = sync.isConnected && !sync.isAdmin;
  document.body.classList.toggle('viewer', spectating);
  // A spectator opening the link before the race starts would otherwise just see a
  // roulette full of placeholder names and assume the link is broken
  document.body.classList.toggle('waiting', spectating && !started);
});

// Lobby: spectators see the names and map the admin is typing in, before the start
sync.addEventListener('lobby', (e) => {
  if (sync.isAdmin) return;
  const lobby = (e as CustomEvent<Lobby>).detail;
  whenReady(() => {
    setMap(lobby.mapIndex);
    roulette.setMarbles(lobby.names);
  });
});

// Race start. Everyone runs the same simulation from the same seed, so everyone
// sees the same screen.
let started = false;

sync.addEventListener('session', (e) => {
  const session = (e as CustomEvent<Session>).detail;
  started = true;
  document.body.classList.remove('waiting');
  // Tell the page-level setup to stop touching the marbles (see getReady in index.html)
  (window as any).__sessionApplied = true;
  whenReady(() => {
    setMap(session.mapIndex);
    seedRng(session.seed);
    options.useSkills = session.useSkills;
    options.winningRank = session.winningRank;
    roulette.setMarbles(session.names);
    roulette.setWinningRank(session.winningRank);
    roulette.start(session.startAt);
    document.querySelector('#settings')?.classList.add('hide');
  });
});

// Once the race is over the admin may edit the list again
roulette.addEventListener('goal', () => {
  if (!sync.isConnected || sync.isAdmin) (window as any).__sessionApplied = false;
});

// PWA install button (Chromium browsers). See the README for building exe/apk files.
let installPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  document.querySelector('#btnInstall')?.classList.add('show');
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#btnInstall')?.addEventListener('click', () => {
    installPrompt?.prompt();
    installPrompt = null;
    document.querySelector('#btnInstall')?.classList.remove('show');
  });
});
