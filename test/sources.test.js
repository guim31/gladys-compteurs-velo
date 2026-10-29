// -----------------------------------------------------------------------------
// The adapters of the five portals, on their real answers of 2026-10-29: the
// queries sent, and the rows they turn into.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, SOURCE_KEYS, int, nextDay, quote, time } from '../src/sources.js';
import { createFetch } from './helpers/world.js';

const SINCE = '2026-10-12';

test('five sources, each with its own portal', () => {
  assert.deepEqual(SOURCE_KEYS, ['paris', 'nantes', 'tours', 'saint_nazaire', 'hauts_de_seine']);
  for (const source of Object.values(SOURCES)) {
    assert.match(source.base, /^https:\/\//);
    assert.match(source.dataset, /^https:\/\//);
    assert.ok(['hour', 'day'].includes(source.step));
    assert.ok(source.usualAgeHours > 0);
  }
});

test('every portal: one row per counter and French day, read from the real answer', async () => {
  const expected = {
    paris: { counters: 108, lastDay: '2026-10-27' },
    nantes: { counters: 68, lastDay: '2026-10-26' },
    tours: { counters: 42, lastDay: '2026-10-28' },
    saint_nazaire: { counters: 9, lastDay: '2026-10-28' },
    hauts_de_seine: { counters: 115, lastDay: '2026-10-28' },
  };
  for (const key of SOURCE_KEYS) {
    const { fetch, calls } = createFetch();
    const rows = await SOURCES[key].days(fetch, SINCE);
    const ids = new Set(rows.map((row) => row.id));
    assert.equal(ids.size, expected[key].counters, key);
    assert.equal(
      rows
        .map((row) => row.day)
        .sort()
        .at(-1),
      expected[key].lastDay,
      key,
    );
    const keys = new Set(rows.map((row) => `${row.id}/${row.day}`));
    assert.equal(keys.size, rows.length, `${key}: one row per counter and day`);
    for (const row of rows) {
      assert.match(row.day, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(Number.isInteger(row.count) && row.count >= 0, key);
      assert.ok(row.name.length > 0, key);
      assert.ok(Number.isFinite(row.last), key);
    }
    const url = new URL(calls[0].url);
    assert.equal(url.searchParams.get('timezone'), 'Europe/Paris');
    assert.match(url.searchParams.get('where'), new RegExp(`>= date'${SINCE}'`));
  }
});

test('Paris: one counter per direction, 24 hourly slots a day', async () => {
  const rows = await SOURCES.paris.days(createFetch().fetch, SINCE);
  const bridge = rows.filter((row) => row.name === 'Pont Charles De Gaulle NE-SO');
  assert.equal(bridge[0].id, '100056329-104056329');
  const last = bridge.find((row) => row.day === '2026-10-27');
  assert.deepEqual([last.count, last.slots], [1208, 24]);
  // 23:00 in Paris, the last slot of the day.
  assert.equal(new Date(last.last).toISOString(), '2026-10-27T22:00:00.000Z');
});

test('Nantes: the anomaly flag of the source comes along', async () => {
  const rows = await SOURCES.nantes.days(createFetch().fetch, SINCE);
  const flags = new Set(rows.map((row) => row.anomaly));
  assert.deepEqual([...flags].sort(), ['Faible', 'Forte', null].sort());
});

test('Saint-Nazaire: bikes alone, the walkers counters are left out', async () => {
  const { fetch, calls } = createFetch();
  await SOURCES.saint_nazaire.days(fetch, SINCE);
  assert.match(new URL(calls[0].url).searchParams.get('where'), /travel_modes = "vélo"/);
});

test('Hauts-de-Seine: the commune comes before the cryptic name of the counter', async () => {
  const rows = await SOURCES.hauts_de_seine.days(createFetch().fetch, SINCE);
  assert.ok(rows.some((row) => row.name === 'Issy-les-Moulineaux · ILM-RD2-Rodin-Nord'));
});

test('the last hour of the watched counters of an hourly source', async () => {
  const { fetch, calls } = createFetch();
  const hours = await SOURCES.paris.lastHours(fetch, [
    { id: '100056329-104056329', last: Date.parse('2026-10-27T22:00:00Z') },
  ]);
  assert.deepEqual(hours.get('100056329-104056329'), {
    at: Date.parse('2026-10-27T22:00:00Z'),
    count: 29,
  });
  assert.match(
    new URL(calls[0].url).searchParams.get('where'),
    /id_compteur = "100056329-104056329" and date = date'2026-10-27T22:00:00.000Z'/,
  );
  assert.deepEqual(await SOURCES.paris.lastHours(fetch, []), new Map());
  assert.equal(calls.length, 1, 'nothing asked, no request');
});

test('the record of a counter: its best day up to a day, doubtful days left out in Nantes', async () => {
  const { fetch, calls } = createFetch();
  assert.deepEqual(await SOURCES.tours.record(fetch, '100030431', '2026-10-27'), {
    day: '2021-10-10',
    count: 4845,
  });
  const tours = new URL(calls[0].url).searchParams;
  assert.match(tours.get('where'), /id = "100030431"/);
  assert.match(tours.get('where'), /date < date'2026-10-28'/);
  assert.equal(tours.get('order_by'), 'count desc');
  assert.equal(tours.get('limit'), '1');
  await SOURCES.nantes.record(fetch, '787', '2026-10-26');
  assert.match(
    new URL(calls[1].url).searchParams.get('where'),
    /probabilite_presence_anomalie is null or probabilite_presence_anomalie != "Forte"/,
  );
});

test('a portal error is an error with the host, never the query', async () => {
  const { fetch } = createFetch({});
  const failing = async () => new Response('busy', { status: 503 });
  await assert.rejects(
    SOURCES.paris.days(failing, SINCE),
    /^Error: opendata\.paris\.fr: HTTP 503$/,
  );
  await assert.rejects(
    SOURCES.tours.days(async () => new Response('<html>', { status: 200 }), SINCE),
    /data\.tours-metropole\.fr: invalid JSON/,
  );
  assert.ok(fetch);
});

test('helpers: numbers, dates, quoting, next day', () => {
  assert.equal(int('12.6'), 13);
  assert.equal(int(-3), 0);
  assert.equal(int(null), null);
  assert.equal(int('x'), null);
  assert.equal(time('2026-10-27T23:00:00+01:00'), Date.parse('2026-10-27T22:00:00Z'));
  assert.equal(time(''), null);
  assert.equal(quote('a"b\\c'), '"a\\"b\\\\c"');
  assert.equal(nextDay('2026-10-31'), '2026-11-01');
  assert.equal(nextDay('2028-02-28'), '2028-02-29');
});
