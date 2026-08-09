# Personal Marble Roulette

[한국어](./README.md) | **English**

A lucky draw made by dropping marbles. **One admin runs it, and participants and
spectators all watch the same screen.**

> ## Upstream (Fork)
>
> **This repository is a fork of the repository below.**
>
> | | |
> |---|---|
> | Upstream repository | **https://github.com/lazygyu/roulette** |
> | Upstream project | Marble Roulette |
> | Original author | **LazyGyu** (https://lazygyu.net) |
> | Upstream demo | https://lazygyu.github.io/roulette |
> | Upstream license | MIT, (c) 2023 LazyGyu |
>
> The physics simulation, map data, renderer, skills, camera and images - **the whole
> game itself** - are the original author's work. All this repository did was add
> rooms, role separation, hosting and app packaging on top of it.
>
> License: the upstream part stays MIT; only what this repository added or modified is
> MPL-2.0. No rights whatsoever are claimed over the original code. See
> [License](#license).

## Why this exists

**It was built because it was needed.**

Upstream runs in a single browser tab, so watching one draw together meant crowding
around a single screen or sharing it. The wish was simple: everyone watches the same
race on their own device, and only the host can start it. Nothing like that existed,
so it was built. It turned out useful enough to clean up and publish.

## No revenue, in any form

This repository **does not pursue revenue in any way.**

- No donation or sponsorship links
- No ads
- No payments, paid features or subscriptions
- No shop integration
- Not sold
- **No user tracking or analytics** (not a single outbound request)

The shop button, the paid-product notice, the Buy-me-a-coffee code and the shop API
integration that came from upstream were **all removed** (see [what was
removed](#scope-of-changes)). It was built for personal use and there is no intention
to make money from it.

If you feel like supporting someone, support the **original author,
[LazyGyu](https://lazygyu.net)**, not this repository. He built the actual thing.

## What changed

Upstream is a single-tab, single-player app. This is what was added:

1. **A host-anywhere server** - `node server.mjs` serves the static files and relays
   room state. No external dependencies (Node built-ins only).
2. **Admin vs participant/spectator** - only the admin sets names, map and winning
   rank, and only the admin can start. The server verifies the admin key, so a
   spectator opening the browser console cannot touch anyone else's screen.
3. **Everyone sees the same screen** - nothing is streamed. The admin publishes a
   **single seed** and every client runs the same physics simulation locally. Traffic
   is near zero regardless of headcount, and everyone watches at their own resolution.
4. **PWA and exe** - use it in a browser, install it as an app on a phone or desktop,
   or run a single portable exe that carries the server with it.

### How "the same screen" is guaranteed

| | Common approach | Used here |
|---|---|---|
| What is sent | Coordinates or video, every frame | One seed plus settings, once |
| Server load | Scales with headcount | Independent of headcount |
| Quality | Stream quality | Native quality for everyone |

That requires the simulation to be **fully deterministic**, so:

- Simulation randomness moved to a seeded PRNG (`src/rng.ts`): marble order, density,
  skills, shake impulses. Purely visual randomness (particles) still uses `Math.random`.
- Physics advances against a **shared clock** rather than per frame, so 60fps and 30fps
  run the same steps.
- Step size and marble sorting moved inside the step loop, so device speed cannot leak
  into the result.
- Removing a finished marble is scheduled on simulation time, not `setTimeout`.
- Joining late catches up on the spot, within a per-frame step budget.

The transport is **1.5s polling**. It was SSE first, until a Cloudflare tunnel was
found to swallow the response body entirely. Because a race is distributed as a start
*time*, a late signal costs nothing - each client catches up to that point and the
result is identical. As a bonus it works behind any proxy or CDN, and the server-side
broadcast code disappeared.

### Scope of changes

This is also the list of files covered by MPL-2.0.

**New files**

| File | Contents |
|---|---|
| `server.mjs` | Static serving, room state, admin auth. No dependencies |
| `test.mjs` | Server checks: path traversal, non-admin rejection, input limits |
| `electron/main.cjs` | Admin desktop app with the server embedded |
| `src/sync.ts` | Room state polling, admin POST, server clock sync |
| `src/rng.ts` | Seeded randomness (mulberry32) |

**Modified files**

| File | Contents |
|---|---|
| `src/roulette.ts` | Shared-clock stepping, step-based marble removal, `start(startAt)` |
| `src/index.ts` | Room events to roulette, role-based UI, PWA install button |
| `src/rouletteRenderer.ts` | Removed the shop API integration (keywordService) |
| `src/marble.ts`, `src/physics-box2d.ts`, `src/utils/utils.ts` | Simulation randomness moved to the seeded PRNG |
| `src/registerServiceWorker.ts` | Fixed `/roulette/` path to a deployment-relative one (not registered in dev) |
| `index.html` | Start publishes to the room, lobby sharing, join address copy, spectator badge, shop/notice/donation/tracking removed |
| `assets/style.scss` | Spectator UI cleanup, join address row, install button, shop/notice/donation styles removed |
| `assets/manifest.json` | Relative `start_url`/`scope` so it installs wherever it is hosted |
| `src/data/languages.ts` | Strings added, donation strings removed |
| `package.json` | Server and electron scripts, relative build path, `untun` dependency |

**Removed (everything payment or revenue related)**

| Removed | Contents |
|---|---|
| Shop button | `marblerouletteshop.com` link and icon |
| Notice popup | Paid custom-roulette "extension" promo modal and its megaphone button |
| Donations | Buy me a coffee code, styles and strings |
| `src/keywordService.ts` | Fetched paid keywords and sprites from the shop API every 60s. Removing it also removed an external dependency and a startup delay |
| Assets | `marblerouletteshop.png`, `sale.jpg` |

**External tracking was removed too**

| Removed | Contents |
|---|---|
| umami | Script reporting launches and starts to `umami.lazygyu.net` |
| Google Analytics | `G-5899C1DJM0` bootstrap |
| Event calls | Code that sent marble counts, map names and **each participant's name** outside |

Locally bundled marble skins (chamru, kubin and friends) are unrelated to the shop and
were kept. The author attribution link in the footer (`lazygyu.net`) stays, since it is
an attribution notice.

**Upstream bug fixed along the way**: a `TypeError` on start and finish caused by
referencing a `#donate` element that does not exist.

---

## Running it

### 1. On the web, anywhere

```shell
yarn            # once
yarn start      # build and serve (= yarn build && node server.mjs)
```

Two addresses are printed:

```
Spectators/participants : http://192.168.0.10:3000/
Admin                   : http://localhost:3000/?key=3f9ac21b
```

- Only the **admin address** can open settings and start a race. Do not share it.
  (It is localhost because the admin is whoever started the server.)
- Windows will ask to allow the firewall on first run. **Allow it, or nobody else can
  connect.**
- Participants and spectators use the first address, and the race starts for them the
  moment the admin starts it.
- Click the **join address** field or the `Copy` button on the admin screen to copy the
  shareable address.

Options

```shell
PORT=8080 ADMIN_KEY=our-secret node server.mjs    # fixed port and key
```

- Separate rooms: append `?room=name` (admins use `?room=name&key=...`). Each room runs
  its own race.

### Letting people join from outside the local network

A LAN address (`192.168.x.x`) only works on the same network. Going public needs a
tunnel. **With the exe this is one click in the menu.** From the CLI, use the npm
package:

```shell
npx untun tunnel http://localhost:3000    # -> https://xxx.trycloudflare.com
```

Then tell the app which address to hand out:

```shell
PUBLIC_URL=https://xxx.trycloudflare.com node server.mjs
```

- No account and no domain needed (Cloudflare Quick Tunnel). The address changes on
  every restart.
- **HTTPS is what makes PWA install and clipboard copy work properly on phones.**
- ngrok, tailscale funnel or a normal server all work as well; just set `PUBLIC_URL`.
- For a fixed domain, use a Cloudflare account and a named tunnel.

### 2. Admin exe (nothing to install)

```shell
yarn dist:exe        # portable exe in release/
```

Running the exe starts the server and opens the admin screen. On first run Windows
asks about the firewall - **allow it**, or participants cannot connect.

It then **asks once how participants should join:**

| Choice | Join address | Reach |
|---|---|---|
| Expose to the internet (domain) | `https://xxx.trycloudflare.com/` | Anywhere, phone install (PWA) works |
| Same Wi-Fi only (IP) | `http://192.168.x.x:3000/` | Same network only, no external exposure |

A LAN has no domain, which is why an IP is shown; a domain only exists once a tunnel is
open. It can also be switched later from the `Join address > Expose to the internet`
menu, and the on-screen join address updates automatically.

Copy the participant address from the **Join address** menu (`Ctrl+Shift+C`) or the
on-screen field.

macOS (dmg) and Linux (AppImage) use `yarn dist:app`, built on each OS.

### 3. Installing as an app (participants and spectators)

If the server is on HTTPS, visiting it is enough to install.

- Android (Chrome) and desktop (Chrome/Edge): the **Install app** button at the top
  left, or the install icon in the address bar
- iOS (Safari): Share -> Add to Home Screen

To ship a real `.apk` or `.msix`, host it somewhere and feed the address to
[PWABuilder](https://www.pwabuilder.com); the manifest and service worker are ready.

### Security when public

Exposing it means **anyone with the address can spectate.** On that basis:

| Area | Handling |
|---|---|
| Start and settings | Verified server-side with the admin key; keyless requests get 403. Hiding the spectator UI is only cosmetic |
| Admin key | 128-bit random (`ADMIN_KEY` can override). Never part of the join link |
| Screen sharing | The `?key=` in the address bar is stripped on load and moved to sessionStorage, which clears with the tab |
| CSRF | Admin APIs require an `x-admin-key` header. Not cookie auth, so other sites cannot forge requests |
| File access | Paths outside `dist/` are rejected, no directory listing |
| Resource exhaustion | 100 rooms, 64KB bodies; unused rooms are recycled |
| Desktop app | `contextIsolation` on, Node integration off, external links open in the system browser |

Be aware

- **Participant names are visible to anyone with the link.** Use the LAN address rather
  than a public link if real names are involved.
- **Never share the admin address (`?key=`).** The shareable one is in the
  `Join address` menu or the on-screen field.
- A temporary tunnel address disappears when the app closes. For something permanent,
  use a fixed domain with its own authentication.

### Development

```shell
yarn dev        # parcel dev server (solo mode; rooms need server.mjs)
yarn test       # server logic checks
yarn lint
```

## Requirements

- Node 20+
- TypeScript / Parcel / box2d-wasm

## Thanks

Above all, thank you to **[LazyGyu](https://lazygyu.net)** for building the original
**[Marble Roulette](https://github.com/lazygyu/roulette)** and for releasing it under
MIT so it could be used and modified freely.

The delightful idea of marbles tumbling down, and the physics, maps and presentation
polished over years, are entirely his. This repository only added one feature - "many
people watch the same screen" - on top of that work, and could not exist without it.

Please give the upstream project some attention, and support the original author if you
can.

- Upstream repository: https://github.com/lazygyu/roulette
- Upstream demo: https://lazygyu.github.io/roulette

Thanks as well to the authors of [box2d-wasm](https://github.com/Birch-san/box2d-wasm)
for the physics engine and [untun](https://github.com/unjs/untun) for the tunnelling.

## License

- Upstream [lazygyu/roulette](https://github.com/lazygyu/roulette) portion: **MIT**,
  (c) 2023 LazyGyu ([LICENSE-MIT](./LICENSE-MIT))
- **Only what this repository added or modified**: **MPL-2.0**,
  (c) 2026 zc142365 <zc142365@gmail.com> (https://github.com/zc142365)

> **Scope of copyright** - the notice above applies only to the additions and
> modifications listed under [Scope of changes](#scope-of-changes). Where an upstream
> file was edited, it covers only the edited parts. Only the five new files
> (`server.mjs`, `test.mjs`, `electron/main.cjs`, `src/sync.ts`, `src/rng.ts`) are
> covered in full.
>
> **No rights asserted over the original** - for everything derived from upstream
> (physics integration, map data, renderer, skills, images), **no copyright or any
> other right is held, claimed or exercised.** Those rights belong entirely to the
> original author, LazyGyu. The upstream portion remains under MIT, and the MPL-2.0
> applied here neither restricts nor replaces those MIT terms. Where the boundary is
> unclear, it is read in the original author's favour, i.e. as MIT.

Both license texts and their scope are in [LICENSE](./LICENSE).
`SPDX-License-Identifier: MIT AND MPL-2.0`
