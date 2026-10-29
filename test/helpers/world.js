// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake `fetch` serving the
// real answers of the five portals (captured on 2026-10-29 at 01:53 in Paris,
// see test/fixtures/sources/index.json), a manual clock, and the integration
// wired on top through registerHandlers. Nothing touches the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';

process.env.LOG_LEVEL ??= 'silent';

export const fixtureJson = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/sources/${name}`, import.meta.url), 'utf8'));

// 2026-10-29 01:53:49 in Paris, the time of the capture.
export const FIXTURE_TIME = 1793235229487;
export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;

const INDEX = fixtureJson('index.json');

/** What an Opendatasoft request asks: its dataset, its kind and the counter of a record. */
export function requestOf(url) {
  const parsed = new URL(url);
  const select = parsed.searchParams.get('select') ?? '';
  const where = parsed.searchParams.get('where') ?? '';
  const kind = select.includes('slots')
    ? 'days'
    : select.includes(' as at')
      ? 'last-hours'
      : 'record';
  return {
    dataset: parsed.pathname.split('/')[6],
    kind,
    counter: kind === 'record' ? (/= "([^"]+)"/.exec(where)?.[1] ?? null) : null,
  };
}

/** The fixture URL serving a request: the same one, or the same kind of the same dataset. */
export function fixtureUrlFor(url) {
  if (INDEX[url]) {
    return url;
  }
  const wanted = requestOf(url);
  return Object.keys(INDEX).find((candidate) => {
    const known = requestOf(candidate);
    return known.dataset === wanted.dataset && known.kind === wanted.kind;
  });
}

/** The URL of a fixture file, e.g. urlOf('nantes-days.json'). */
export const urlOf = (file) => Object.keys(INDEX).find((url) => INDEX[url] === file);

/**
 * A fake `fetch`: `routes[url]` is a JSON value, a status number, a Response,
 * an Error (network failure) or a function of the request returning one of them.
 * A request without its own route gets the fixture of the same kind (a day
 * later, the "since" of the URL changes). Every call is recorded in `calls`.
 */
export function createFetch(overrides = {}) {
  const routes = {
    ...Object.fromEntries(Object.entries(INDEX).map(([url, file]) => [url, fixtureJson(file)])),
    ...overrides,
  };
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, headers: init.headers ?? {} });
    let route = routes[url] ?? routes[fixtureUrlFor(url)];
    if (typeof route === 'function') {
      route = await route(url, init);
    }
    if (route instanceof Error) {
      throw route;
    }
    if (route === undefined) {
      return new Response('not found', { status: 404 });
    }
    if (route instanceof Response) {
      return route;
    }
    if (typeof route === 'number') {
      return new Response('error', { status: route });
    }
    return new Response(JSON.stringify(route), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch, calls, routes };
}

/** A manual clock. */
export function createClock(start = FIXTURE_TIME) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {object} [options.network] from createFetch
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {string|null} [options.dataDir] where the records are kept (null: memory)
 */
export async function createWorld({
  config = { cities: ['tours'] },
  network = createFetch(),
  devices = [],
  connect = true,
  clock = createClock(),
  dataDir = null,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: network.fetch,
    timers: false,
    now: clock.now,
    dataDir,
  });
  const world = { gladys, fake: gladys.fake, app, service: app.service, network, clock };
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.service.loading;
  }
  return world;
}

/** Run a configuration action; resolves with its message (multi-language). */
export async function action(world, key, fields = {}) {
  const ack = await world.fake.action(key, fields);
  if (!ack.success) {
    throw new Error(`${key} failed: ${ack.error}`);
  }
  return ack.data.message;
}

/** The device published for a name part or a predicate, from the last discovery list. */
export const discovered = (world, predicate) =>
  world.fake.discoveredDevices.find(
    typeof predicate === 'function' ? predicate : (d) => d.name.includes(predicate),
  );

/** Create a discovered device in Gladys, as the user would. */
export async function create(world, predicate) {
  const device = discovered(world, predicate);
  if (!device) {
    throw new Error(`${predicate} is not in the discovered devices`);
  }
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** One refresh cycle, `ms` later (an hour by default). */
export async function cycle(world, ms = HOUR) {
  world.clock.advance(ms);
  await world.service.refresh();
}

/** Edits the served rows of a fixture: `edit(results)` returns the new results. */
export function editRows(world, file, edit) {
  const url = urlOf(file);
  const document = structuredClone(world.network.routes[url]);
  document.results = edit(document.results);
  world.network.routes[url] = document;
  return document;
}

/** Captures what the integration logs, at a level. */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
