/*
 * Copyright (c) 2026 zc142365 <zc142365@gmail.com>
 * https://github.com/zc142365
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
// Randomness used by the simulation. The same seed means every participant sees
// exactly the same race. Purely visual code (particles) keeps using Math.random.
let state = 0;

export function seedRng(seed: number) {
  state = seed >>> 0;
}

// mulberry32
export function rand(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

seedRng(randomSeed());
