// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the real
// answers of the portals: discovery, states, today at midnight, records,
// late data, widget, scene action, saved records.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WIDGET_COLORS, validateWidgetContent } from '@gladysassistant/integration-sdk';
import { TRIGGERS } from '../src/service.js';
import {
  DAY,
  HOUR,
  action,
  create,
  createWorld,
  cycle,
  discovered,
  editRows,
  featureId,
  urlOf,
} from './helpers/world.js';

const WILSON = 'Tours Métropole · Pont Wilson';
const isWilson = (d) => d.name === WILSON;

/** Tours: Pont Wilson gets a row for `day` (local midnight, like the source). */
const addToursDay = (world, day, count) =>
  editRows(world, 'tours-days.json', (rows) => [
    ...rows.filter((r) => !(r.id === '100030431' && r.day === day)),
    { id: '100030431', name: 'Pont Wilson', day, count, slots: 1, last: `${day}T00:00:00+01:00` },
  ]);

test('the counters of the cities ticked are offered, the others are not read', async (t) => {
  const world = await createWorld({ config: { cities: ['tours'] } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 42);
  const wilson = discovered(world, isWilson);
  assert.equal(wilson.should_poll, false);
  assert.equal(wilson.poll_frequency, undefined);
  assert.deepEqual(
    wilson.features.map((f) => f.name),
    ["Aujourd'hui jusqu'ici", 'Dernière journée complète', '7 derniers jours', 'Âge de la donnée'],
  );
  assert.ok(world.network.calls.every((call) => call.url.includes('tours-metropole')));
  assert.equal(world.network.calls.length, 1);
});

test('no city ticked: nothing read, an empty discovery, the status says what to do', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.equal(world.network.calls.length, 0);
  const message = await action(world, 'status');
  assert.match(message.fr, /Aucune ville choisie/);
});

test('a counter added gets all its states at once, then only the changes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, isWilson);
  const last = (key) => world.fake.lastState(featureId(device, key));
  // 2026-10-29 01:53: the 28th is still being delivered, the 27th is the last complete day.
  assert.equal(last('last_day'), 1934);
  assert.equal(last('week'), 11915);
  assert.equal(last('today'), 0);
  assert.equal(last('age'), 25);
  assert.deepEqual(world.fake.widgetRefreshes, ['counters']);

  const before = world.fake.states.length;
  await cycle(world, HOUR);
  const sent = world.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.deepEqual(sent, [featureId(device, 'age')]);
  assert.equal(last('age'), 26);
});

test('the morning publication: today so far, then a new complete day', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, isWilson);
  const last = (key) => world.fake.lastState(featureId(device, key));
  addToursDay(world, '2026-10-29', 640);
  await cycle(world, 10 * HOUR);
  assert.equal(last('today'), 640);
  // The 28th is followed by the 29th: complete now.
  assert.equal(last('last_day'), 779);
  assert.equal(last('week'), 11915 - 2149 + 779);
  // At midnight, "today" starts again, before any new data.
  await cycle(world, 14 * HOUR);
  assert.equal(last('today'), 0);
});

test('an hourly source: the last hour delivered, today and the complete days', async (t) => {
  const world = await createWorld({ config: { cities: ['paris', 'saint_nazaire'] } });
  t.after(() => world.app.stop());
  const bridge = await create(world, 'Pont Charles De Gaulle NE-SO');
  const leferme = await create(world, 'Bld Leferme');
  assert.equal(leferme.name, 'Saint-Nazaire agglo · Bld Leferme (Ville Halluard)');
  await cycle(world, 60 * 1000);
  const last = (device, key) => world.fake.lastState(featureId(device, key));
  assert.equal(last(bridge, 'last_hour'), 29);
  assert.equal(last(bridge, 'last_day'), 1208);
  assert.equal(featureId(bridge, 'today'), undefined);
  assert.equal(last(leferme, 'last_hour'), 39);
  // The 28th stops at 09:00: the 27th is the last complete day.
  assert.equal(last(leferme, 'last_day'), 1128);
  assert.equal(last(leferme, 'age'), 15);
  // The last hours are asked once, not at every cycle.
  const asked = world.network.calls.filter((c) => c.url.includes('+as+at')).length;
  await cycle(world);
  assert.equal(world.network.calls.filter((c) => c.url.includes('+as+at')).length, asked);
});

test('a daily record: the history is read once, then a better day fires the trigger', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, isWilson);
  await cycle(world, 60 * 1000);
  assert.ok(world.network.calls.some((c) => c.url.includes('order_by=count+desc')));
  assert.deepEqual(world.fake.sceneEvents, []);

  // The 28th turns out to be the best day ever (4845 on 2021-10-10 so far).
  addToursDay(world, '2026-10-28', 5000);
  addToursDay(world, '2026-10-29', 10);
  await cycle(world, 10 * HOUR);
  const events = world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.DAILY_RECORD);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, {
    counter: device.external_id,
    counter_name: 'Pont Wilson',
    city: 'Tours Métropole',
    count: 5000,
    day: '2026-10-28',
    previous_record: 4845,
    previous_record_day: '2021-10-10',
  });
  // Not twice.
  await cycle(world);
  assert.equal(world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.DAILY_RECORD).length, 1);
});

test('Nantes: a day the source flags as doubtful is never a record', async (t) => {
  const world = await createWorld({ config: { cities: ['nantes'] } });
  t.after(() => world.app.stop());
  await create(world, '785 - 50 Otages Vers Sud');
  await cycle(world, 60 * 1000);
  const add = (day, anomaly) =>
    editRows(world, 'nantes-days.json', (rows) => [
      ...rows,
      {
        id: 785,
        name: '785 - 50 Otages Vers Sud',
        anomaly,
        day,
        count: 99999,
        slots: 1,
        last: `${day}T00:00:00+00:00`,
      },
    ]);
  add('2026-10-27', 'Forte');
  await cycle(world, DAY);
  assert.deepEqual(world.fake.sceneEvents, []);
  add('2026-10-28', null);
  await cycle(world, DAY);
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => [e.key, e.data.day, e.data.previous_record]),
    [[TRIGGERS.DAILY_RECORD, '2026-10-28', 4695]],
  );
});

test('late data: the trigger fires once per delay crossed, past the usual delay', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = await create(world, isWilson);
  // Age 26 h, Tours usually goes up to 40 h: on time (the first cycle sets the baseline).
  await cycle(world);
  await cycle(world, 26 * HOUR); // age 52 h: 12 h late
  const late = () => world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.COUNTER_LATE);
  assert.deepEqual(
    late().map((e) => e.data.hours),
    ['12'],
  );
  assert.equal(late()[0].data.counter, device.external_id);
  assert.equal(late()[0].data.age_hours, 52);
  await cycle(world, HOUR);
  assert.equal(late().length, 1);
  await cycle(world, 60 * HOUR); // 113 h: 73 h late, 24 and 72 crossed at once
  assert.deepEqual(
    late().map((e) => e.data.hours),
    ['12', '24', '72'],
  );
});

test('the widget: one row per counter, the 7-day chart, valid for the core', async (t) => {
  const world = await createWorld({ config: { cities: ['tours', 'nantes'] } });
  t.after(() => world.app.stop());
  const wilson = await create(world, isWilson);
  await create(world, '785 - 50 Otages Vers Sud');
  const ack = await world.fake.widgetGet('counters', { settings: {}, language: 'fr' });
  assert.equal(ack.success, true);
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  const [status, chart] = content.components;
  assert.equal(status.type, 'status');
  assert.deepEqual(
    status.items.map((item) => item.label),
    ['Pont Wilson', '785 - 50 Otages Vers Sud'],
  );
  assert.match(status.items[0].value, /^1\u202f934 · le 27 oct\. · ↘ 29 %$/);
  assert.equal(status.items[0].color, WIDGET_COLORS.PRIMARY);
  assert.equal(chart.type, 'chart');
  assert.equal(chart.series.length, 2);
  assert.equal(chart.series[0].points.length, 7);
  assert.deepEqual(chart.series[0].points.at(-1), { t: '2026-10-26T23:00:00.000Z', v: 1934 });

  const hidden = await world.fake.widgetGet('counters', {
    settings: { counters: [wilson.external_id], hide_chart: true },
    language: 'en',
  });
  assert.deepEqual(
    hidden.data.content.components.map((c) => c.type),
    ['status'],
  );
  assert.match(hidden.data.content.components[0].items[0].value, /^1,934 · on 27 Oct · ↘ 29 %$/);
});

test('the widget without a counter says what to do', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet('counters', { settings: {}, language: 'de' });
  assert.match(ack.data.content.components[0].text, /Entdecken/);
  const gone = await world.fake.widgetGet('counters', {
    settings: { counters: ['x'] },
    language: 'es',
  });
  assert.match(gone.data.content.components[0].text, /ya no está vigilado/);
});

test('the scene action: the figures of a counter and a sentence', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const wilson = await create(world, isWilson);
  const ack = await world.fake.sceneAction('get_counts', { counter: wilson.external_id });
  assert.equal(ack.success, true);
  assert.deepEqual(ack.data.outputs, {
    found: 1,
    sentence: 'Pont Wilson : 1 934 passages à vélo le 27 oct., 11 915 sur 7 jours.',
    counter_name: 'Pont Wilson',
    city: 'Tours Métropole',
    last_day: 1934,
    last_day_date: '2026-10-27',
    week: 11915,
    trend: -29,
    trend_known: 1,
    hours_late: 0,
  });
  const unknown = await world.fake.sceneAction('get_counts', { counter: 'nope' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /n'est plus suivi/);
});

test('the records are saved in /data: a restart asks the history no more', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'compteurs-velo-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const world = await createWorld({ dataDir: dir });
  const device = await create(world, isWilson);
  await cycle(world, 60 * 1000);
  await world.app.stop();
  const saved = JSON.parse(await readFile(path.join(dir, 'records.json'), 'utf8'));
  assert.deepEqual(saved, {
    [device.external_id]: { day: '2021-10-10', count: 4845, upTo: '2026-10-27' },
  });

  const again = await createWorld({ dataDir: dir, devices: [device] });
  t.after(() => again.app.stop());
  await cycle(again, 60 * 1000);
  assert.ok(!again.network.calls.some((c) => c.url.includes('order_by=count+desc')));
});

test('Paris without a whole week: no 7-day total, the sentence says the day alone', async (t) => {
  const world = await createWorld({ config: { cities: ['paris'] } });
  t.after(() => world.app.stop());
  const bridge = await create(world, 'Pont Charles De Gaulle NE-SO');
  // No 2026-10-25 in the source: the week is not published.
  assert.equal(world.fake.lastState(featureId(bridge, 'week')), undefined);
  assert.equal(world.fake.lastState(featureId(bridge, 'last_day')), 1208);
  const ack = await world.fake.sceneAction('get_counts', { counter: bridge.external_id });
  assert.equal(ack.data.outputs.week, 0);
  assert.equal(ack.data.outputs.trend_known, 0);
  assert.equal(
    ack.data.outputs.sentence,
    'Pont Charles De Gaulle NE-SO : 1 208 passages à vélo le 27 oct.',
  );
});

test('the widget tells the two directions of a counter apart', async (t) => {
  const world = await createWorld({ config: { cities: ['paris'] } });
  t.after(() => world.app.stop());
  await create(world, (d) => d.name === 'Paris · Pont Charles De Gaulle NE-SO');
  await create(world, (d) => d.name === 'Paris · Pont Charles De Gaulle SO-NE');
  const ack = await world.fake.widgetGet('counters', { settings: {}, language: 'fr' });
  const [status, chart] = ack.data.content.components;
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  assert.deepEqual(
    status.items.map((item) => item.label),
    ['Pont Charles De Gaulle NE-SO', 'Pont Charles De Gaulle SO-NE'],
  );
  assert.deepEqual(
    chart.series.map((serie) => serie.name),
    ['Pont Charles De G… NE-SO', 'Pont Charles De G… SO-NE'],
  );
});

test('a doubtful last day never becomes the record to beat', async (t) => {
  const world = await createWorld({ config: { cities: ['nantes'] } });
  t.after(() => world.app.stop());
  editRows(world, 'nantes-days.json', (rows) =>
    rows.map((r) =>
      r.id === 785 && r.day === '2026-10-26' ? { ...r, count: 99999, anomaly: 'Forte' } : r,
    ),
  );
  const device = await create(world, '785 - 50 Otages Vers Sud');
  await cycle(world, 60 * 1000);
  assert.deepEqual(world.service.store.get(device.external_id), {
    day: '2021-08-26',
    count: 4695,
    upTo: '2026-10-26',
  });
});

test('a counter removed from Gladys forgets its record', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'compteurs-velo-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const world = await createWorld({ dataDir: dir });
  t.after(() => world.app.stop());
  const device = await create(world, isWilson);
  await cycle(world, 60 * 1000);
  assert.ok(world.service.store.get(device.external_id));
  await world.fake.deviceDeleted(device);
  assert.equal(world.service.store.get(device.external_id), null);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'records.json'), 'utf8')), {});
});

test('every portal down: the connection badge says so, then comes back', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const url = urlOf('tours-days.json');
  const saved = world.network.routes[url];
  world.network.routes[url] = new TypeError('fetch failed');
  await cycle(world);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /Aucun portail/);
  world.network.routes[url] = saved;
  await cycle(world);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('an answer cut at the row limit is an error, not missing days', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  editRows(world, 'tours-days.json', (rows) =>
    Array.from({ length: 5000 }, (_, i) => ({ ...rows[0], day: `2026-10-${i}` })),
  );
  await cycle(world);
  assert.match(world.service.city('tours').error, /more than 5000 rows/);
});
