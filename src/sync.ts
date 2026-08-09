/*
 * Copyright (c) 2026 zc142365 <zc142365@gmail.com>
 * https://github.com/zc142365
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/**
 * Room sync client.
 *
 * Nothing is streamed. The admin publishes a single seed and every client runs the
 * same physics simulation from the start. The server just holds the room state and
 * clients poll it; only the admin may POST.
 */

export type Lobby = {
  names: string[];
  mapIndex: number;
};

export type Session = Lobby & {
  seed: number;
  winningRank: number;
  useSkills: boolean;
  startAt: number;
};

const params = new URLSearchParams(location.search);
const room = params.get('room') || localStorage.getItem('mbr_room') || 'main';

// Strip the admin key from the address bar as soon as we have it: an admin sharing
// their screen would otherwise expose it. sessionStorage clears when the tab closes.
const adminKey = params.get('key') || sessionStorage.getItem('mbr_key') || '';
if (params.get('key')) {
  sessionStorage.setItem('mbr_key', adminKey);
  params.delete('key');
  const rest = params.toString();
  history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}`);
}

localStorage.setItem('mbr_room', room);

const POLL_INTERVAL = 1500;

// Take the server clock straight from the poll response, with no round-trip
// compensation (tens of ms). If that ever visibly drifts, use a median of several.
let timeOffset = 0;

export function syncNow(): number {
  return Date.now() + timeOffset;
}

class Sync extends EventTarget {
  isConnected = false;
  isAdmin = false;
  /** Address to hand out to participants. The server supplies it because the admin
   *  usually opens the page on localhost. */
  joinOrigin = '';
  /** A public address is being created; do not show the LAN one in the meantime */
  joinPending = false;
  readonly room = room;
  private _lobbyTimer = 0;
  private _misses = 0;
  private _lastStartAt = 0;
  private _lastLobby = '';

  /**
   * Short polling. SSE and websockets are unusable here because proxies such as
   * Cloudflare buffer the response body. Since a race is distributed as a start
   * *time*, a signal arriving 1-2s late costs nothing: the client catches up.
   */
  connect() {
    const tick = async () => {
      try {
        const res = await fetch(`api/state?room=${encodeURIComponent(room)}&key=${encodeURIComponent(adminKey)}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(String(res.status));
        this.apply(await res.json());
        this._misses = 0;
      } catch {
        // On static hosting there is no relay server: try a few times, then stay solo
        if (++this._misses === 3 && !this.isConnected) return;
        if (this.isConnected) {
          this.isConnected = false;
          this.dispatchEvent(new CustomEvent('role'));
        }
      }
      setTimeout(tick, POLL_INTERVAL);
    };
    tick();
  }

  private apply(state: {
    role: string;
    now: number;
    joinOrigin?: string;
    joinPending?: boolean;
    lobby: Lobby | null;
    session: Session | null;
  }) {
    timeOffset = state.now - Date.now();
    const wasConnected = this.isConnected;
    this.isConnected = true;
    this.isAdmin = state.role === 'admin';

    // The join address can change while running (a tunnel comes up), so tell the UI
    // whenever it does instead of only on the first poll
    const changed = this.joinOrigin !== (state.joinOrigin || '') || this.joinPending !== !!state.joinPending;
    this.joinOrigin = state.joinOrigin || '';
    this.joinPending = !!state.joinPending;
    if (!wasConnected || changed) this.dispatchEvent(new CustomEvent('role'));

    // startAt identifies a race, so the same one is never started twice
    if (state.session && state.session.startAt !== this._lastStartAt) {
      this._lastStartAt = state.session.startAt;
      this.dispatchEvent(new CustomEvent('session', { detail: state.session }));
      return;
    }
    if (state.lobby) {
      const key = JSON.stringify(state.lobby);
      if (key !== this._lastLobby) {
        this._lastLobby = key;
        this.dispatchEvent(new CustomEvent('lobby', { detail: state.lobby }));
      }
    }
  }

  private post(path: string, body: unknown) {
    return fetch(`api/${path}?room=${encodeURIComponent(room)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(body),
    }).catch((err) => console.error('sync failed', err));
  }

  /** Show the pending names and map to spectators before the race starts */
  sendLobby(lobby: Lobby) {
    if (!this.isConnected || !this.isAdmin) return;
    clearTimeout(this._lobbyTimer);
    this._lobbyTimer = window.setTimeout(() => this.post('lobby', lobby), 300);
  }

  /** Start a race. The server stamps startAt. */
  sendStart(session: Omit<Session, 'startAt'>) {
    if (!this.isConnected || !this.isAdmin) return false;
    clearTimeout(this._lobbyTimer);
    this.post('session', session);
    return true;
  }
}

export const sync = new Sync();
sync.connect();
