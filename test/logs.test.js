// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle
// (the start, a portal lost and back), never one line per reading; a failure
// that repeats at every cycle is logged once, plus one line when it is over.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureLogs, create, createWorld, cycle, urlOf } from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');
const isWilson = (d) => d.name === 'Tours Métropole · Pont Wilson';

test('the start is one info line', async (t) => {
  const lines = captureLogs(t, 'info');
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(lines.map(strip), [
    '[INFO] [compteurs-velo] Started: 1 city(ies) chosen, 0 counter(s) added',
  ]);
});

test('a normal reading cycle writes nothing at info, one line at debug', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await create(world, isWilson);
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 5; i += 1) {
    await cycle(world);
  }
  assert.deepEqual(lines, []);
  const debug = captureLogs(t, 'debug');
  await cycle(world);
  assert.deepEqual(debug.map(strip), [
    '[DEBUG] [compteurs-velo] Tours Métropole: 42 counters read',
  ]);
});

test('a portal down at every cycle: one warning, then one line at recovery', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await create(world, isWilson);
  const url = urlOf('tours-days.json');
  const saved = world.network.routes[url];
  const lines = captureLogs(t, 'info');
  world.network.routes[url] = new TypeError('fetch failed');
  for (let i = 0; i < 4; i += 1) {
    await cycle(world);
  }
  world.network.routes[url] = saved;
  await cycle(world);
  assert.deepEqual(lines.map(strip), [
    '[WARN] [compteurs-velo] Tours Métropole: data unavailable: data.tours-metropole.fr: fetch failed',
    '[INFO] [compteurs-velo] Tours Métropole: data back',
  ]);
});
