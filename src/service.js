// -----------------------------------------------------------------------------
// The integration at runtime: the cities read, their last rows, the refresh
// timer, the devices offered in the Discover tab, the states of the counters
// added to Gladys, their daily records and the scene triggers.
//
// Data flow: every city ticked in the configuration, plus every city with a
// counter added to Gladys, is read at the configured pace: one aggregated
// request per city (the last WINDOW_DAYS days of every counter), one more for
// the last hour of the watched counters of an hourly source, and once per
// watched counter the best day of its history (then kept in /data).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { DEFAULT_CONFIG, normalizeConfig } from './config.js';
import { addDays, ageHours, localDay, summarize } from './counters.js';
import {
  COUNTER_TYPE,
  buildCounterDevice,
  counterPlatformId,
  counterStates,
  prettyName,
} from './devices.js';
import { PORTALS_DOWN, REPORTS, lines, render } from './messages.js';
import { SOURCES, SOURCE_KEYS } from './sources.js';
import { RecordStore } from './store.js';

const logger = createLogger({ name: 'compteurs-velo' });

// Days read back: two whole weeks before the last complete day (the trend),
// plus the delay of the slowest source.
export const WINDOW_DAYS = 17;
// Unchanged states (a counter of a source that publishes once a day) are
// sent again this often, or the dashboard shows "no recent value" after 48 hours.
export const HEARTBEAT_MS = 6 * 3600 * 1000;
// A counter is shown as late once its data is this many hours older than
// what its source usually delivers.
export const LATE_DISPLAY_HOURS = 12;

export const TRIGGERS = {
  DAILY_RECORD: 'daily_record',
  COUNTER_LATE: 'counter_late',
};
// The delays offered by the "late" trigger, in hours past the usual delay of
// the source (the scene filters only compare for equality: an event is fired
// for every threshold crossed).
export const LATE_THRESHOLDS = [12, 24, 72, 168];

/** One city at runtime: its source and its last rows, counter by counter. */
class City {
  constructor(key) {
    this.key = key;
    this.source = SOURCES[key];
    this.groups = null; // Map counter id → rows
    this.lastHours = new Map(); // counter id → { at, count }
    this.okAt = null;
    this.error = null;
  }
}

export class BikeCounters {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] false in the tests: they call refresh()
   * @param {string|null} [options.dataDir] where the records are kept, null for memory only
   */
  constructor({
    gladys,
    fetch = globalThis.fetch,
    now = Date.now,
    timers = true,
    dataDir = '/data',
  }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.now = now;
    this.useTimers = timers;
    this.store = new RecordStore(dataDir);
    this.config = normalizeConfig(DEFAULT_CONFIG);
    this.cities = new Map(); // key → City
    this.lateness = new Map(); // device id → hours late at the last refresh
    this.discoveredSignature = null;
    this.publishFailed = false;
    this.discoveryFailed = false;
    this.fireFailed = false;
    this.down = false;
    this.timer = null;
    this.stopped = false;
    this.refreshing = null;
    this.loading = Promise.resolve();
  }

  // --- lifecycle --------------------------------------------------------------

  async start(config) {
    this.config = config;
    await this.store.load();
    this.schedule();
    logger.info(
      `Started: ${config.cities.length} city(ies) chosen, ${this.watched().length} counter(s) added`,
    );
    // The first reading in the background: the widget and the scene action
    // wait for it.
    this.loading = this.refresh({ discover: true });
  }

  /** Gladys restarted: everything again, the states included. */
  async resync(config) {
    this.config = config;
    this.gladys.forgetPublishedStates?.();
    await this.refresh({ discover: true });
  }

  async reconfigure(config) {
    this.config = config;
    this.schedule();
    await this.refresh({ discover: true });
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.refreshing;
  }

  schedule() {
    if (!this.useTimers || this.stopped) {
      return;
    }
    clearTimeout(this.timer);
    // A callback still running when the schedule changes must not start a
    // second chain: each chain only continues while it is the current one.
    this.generation = (this.generation ?? 0) + 1;
    const generation = this.generation;
    const tick = () => {
      this.timer = setTimeout(async () => {
        await this.refresh();
        if (!this.stopped && this.generation === generation) {
          tick();
        }
      }, this.config.refreshSeconds * 1000);
      this.timer.unref?.();
    };
    tick();
  }

  // --- devices ----------------------------------------------------------------

  deviceId(key, id) {
    return this.gladys.externalIds(COUNTER_TYPE, counterPlatformId(key, id)).device;
  }

  /** The source key of a device created in Gladys, from its params or its external id. */
  sourceOfDevice(device) {
    const param = device?.params?.find?.((p) => p.name === 'source')?.value;
    if (SOURCE_KEYS.includes(param)) {
      return param;
    }
    const id = String(device?.external_id ?? '');
    // Longest key first: "paris" must not catch another key starting with it.
    return (
      [...SOURCE_KEYS].sort((a, b) => b.length - a.length).find((key) => id.includes(`:${key}-`)) ??
      null
    );
  }

  /** The counters added to Gladys: `{ deviceId, key, name }[]`. */
  watched() {
    return (this.gladys.devices ?? [])
      .map((device) => ({
        deviceId: device.external_id,
        key: this.sourceOfDevice(device),
        name: device.name,
      }))
      .filter((entry) => entry.key);
  }

  /** The cities to read: the ones ticked, and the ones of the counters added. */
  activeKeys() {
    const keys = new Set([...this.config.cities, ...this.watched().map((entry) => entry.key)]);
    return SOURCE_KEYS.filter((key) => keys.has(key));
  }

  city(key) {
    if (!this.cities.has(key)) {
      this.cities.set(key, new City(key));
    }
    return this.cities.get(key);
  }

  /** What a counter of a city shows now (null when the city has no row for it). */
  summary(city, counterId) {
    const rows = city.groups?.get(counterId);
    if (!rows) {
      return null;
    }
    return summarize(city.source, rows, this.now(), city.lastHours.get(counterId) ?? null);
  }

  /** A device's counter: `{ city, counterId, summary }`, summary null if unknown. */
  lookup(deviceId) {
    for (const city of this.cities.values()) {
      for (const counterId of city.groups?.keys() ?? []) {
        if (this.deviceId(city.key, counterId) === deviceId) {
          return { city, counterId, summary: this.summary(city, counterId) };
        }
      }
    }
    const entry = this.watched().find((w) => w.deviceId === deviceId);
    return entry ? { city: this.city(entry.key), counterId: null, summary: null } : null;
  }

  /** Waits for the first reading (at most `ms`), for a widget or a scene action asked at start. */
  async firstReading(ms = 10000) {
    let timer;
    await Promise.race([
      this.loading,
      new Promise((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
    clearTimeout(timer);
  }

  /** Hours the counter's data is behind what its source usually delivers. */
  hoursLate(city, summary) {
    return ageHours(summary, this.now()) - city.source.usualAgeHours;
  }

  isLate(city, summary) {
    return !summary || this.hoursLate(city, summary) >= LATE_DISPLAY_HOURS;
  }

  async publishDiscovered({ force = false } = {}) {
    const devices = [];
    for (const key of this.config.cities) {
      const city = this.cities.get(key);
      for (const counterId of city?.groups?.keys() ?? []) {
        devices.push(
          buildCounterDevice(
            this.gladys,
            key,
            city.source,
            this.summary(city, counterId),
            this.config.language,
          ),
        );
      }
    }
    const signature = JSON.stringify(devices.map((d) => [d.external_id, d.name, d.features]));
    if (!force && signature === this.discoveredSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discoveredSignature = signature;
      if (this.discoveryFailed) {
        this.discoveryFailed = false;
        logger.info('Discovered counters published again');
      }
    } catch (err) {
      if (!this.discoveryFailed) {
        logger.warn(`Cannot publish the discovered counters: ${err.message}`);
      }
      this.discoveryFailed = true;
    }
  }

  async publish(states) {
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (this.publishFailed) {
        this.publishFailed = false;
        logger.info('States published again');
      }
    } catch (err) {
      // Gladys restarting: said once, the next refresh sends them again.
      if (!this.publishFailed) {
        logger.warn(`Cannot publish ${states.length} state(s): ${err.message}`);
      }
      this.publishFailed = true;
    }
  }

  statesOf(city, summary) {
    return counterStates(this.gladys, city.key, city.source, summary, this.now());
  }

  /** A device was just added in Gladys: its states, all of them, now. */
  async onDeviceCreated(device) {
    const found = this.lookup(device?.external_id);
    if (!found?.summary) {
      return;
    }
    await this.publish(this.statesOf(found.city, found.summary));
    this.gladys.requestWidgetRefresh?.('counters')?.catch?.(() => {});
  }

  // --- refresh ------------------------------------------------------------------

  /** One read of every active city; concurrent calls share it. */
  refresh({ discover = false } = {}) {
    if (!this.refreshing) {
      this.refreshing = this.refreshAll(discover)
        .catch((err) => logger.warn(`Refresh failed: ${err.message}`))
        .finally(() => {
          this.refreshing = null;
        });
      return this.refreshing;
    }
    // A discovery asked during a refresh (cities just ticked) reads again
    // right after it: the running one may not include the new cities.
    return discover ? this.refreshing.then(() => this.refresh({ discover })) : this.refreshing;
  }

  async refreshAll(forceDiscovery) {
    for (const key of this.activeKeys()) {
      await this.readCity(this.city(key));
    }
    await this.publishDiscovered({ force: forceDiscovery });
    // States of every counter added, even when its city could not be read:
    // its age keeps growing, and "today" starts again at midnight.
    const states = [];
    const events = [];
    const watched = this.watched();
    for (const entry of watched) {
      const found = this.lookup(entry.deviceId);
      if (!found?.summary) {
        continue;
      }
      states.push(...this.statesOf(found.city, found.summary));
      events.push(...(await this.recordEvents(entry.deviceId, found)));
      events.push(...this.lateEvents(entry.deviceId, found));
    }
    await this.publish(states);
    for (const { key, data } of events) {
      await this.fire(key, data);
    }
    await this.reportConnection();
  }

  /**
   * The connection badge of the Configuration tab: down when not one of the
   * cities read answers, back as soon as one does.
   */
  async reportConnection() {
    const read = this.activeKeys().map((key) => this.city(key));
    const down = read.length > 0 && read.every((city) => city.error);
    if (down === this.down) {
      return;
    }
    this.down = down;
    await this.gladys.setConnectionStatus(!down, down ? PORTALS_DOWN : undefined).catch(() => {});
  }

  /** A device removed from Gladys: its record goes too (a new one starts afresh). */
  async onDeviceDeleted(device) {
    if (device?.external_id) {
      this.lateness.delete(device.external_id);
      await this.store.forget(device.external_id);
    }
  }

  /** Reads a city; a failure is logged once, until it works again. */
  async readCity(city) {
    const since = addDays(localDay(this.now()), -WINDOW_DAYS);
    try {
      const rows = await city.source.days(this.fetch, since);
      const groups = new Map();
      for (const row of rows) {
        if (!groups.has(row.id)) {
          groups.set(row.id, []);
        }
        groups.get(row.id).push(row);
      }
      city.groups = groups;
      city.okAt = this.now();
      if (city.error) {
        logger.info(`${city.source.name}: data back`);
      }
      city.error = null;
      logger.debug(`${city.source.name}: ${groups.size} counters read`);
    } catch (err) {
      if (!city.error) {
        logger.warn(`${city.source.name}: data unavailable: ${err.message}`);
      }
      city.error = err.message;
      return;
    }
    await this.readLastHours(city);
  }

  /** The last hourly slot of the watched counters of an hourly source. */
  async readLastHours(city) {
    if (city.source.step !== 'hour') {
      return;
    }
    const wanted = this.watched()
      .filter((entry) => entry.key === city.key)
      .map((entry) => this.lookup(entry.deviceId))
      .filter((found) => found?.summary?.dataEnd)
      .map((found) => ({ id: found.counterId, last: found.summary.dataEnd - 3600 * 1000 }))
      // Already known: no request.
      .filter((w) => city.lastHours.get(w.id)?.at !== w.last);
    if (wanted.length === 0) {
      return;
    }
    try {
      const hours = await city.source.lastHours(this.fetch, wanted);
      for (const [id, hour] of hours) {
        city.lastHours.set(id, hour);
      }
    } catch (err) {
      // The day counts are there: the last hour waits for the next reading.
      logger.debug(`${city.source.name}: last hours unavailable: ${err.message}`);
    }
  }

  eventData(deviceId, city, summary) {
    return {
      counter: deviceId,
      counter_name: prettyName(summary.name),
      city: city.source.name,
    };
  }

  /**
   * Daily records: the first time a counter is seen, the best day of its
   * history up to its last complete day (no event); then every new complete
   * day is compared with it. A day the source flags as doubtful never counts.
   */
  async recordEvents(deviceId, { city, counterId, summary }) {
    const lastDay = summary.lastDay;
    if (!lastDay) {
      return [];
    }
    const saved = this.store.get(deviceId);
    if (!saved) {
      try {
        const best = await city.source.record(this.fetch, counterId, lastDay.day);
        // The best day includes the last one, unless the source doubts it:
        // a doubtful day never becomes the record to beat.
        const record =
          best && (best.count >= lastDay.count || lastDay.anomaly === 'Forte')
            ? best
            : lastDay.anomaly === 'Forte'
              ? { day: lastDay.day, count: 0 }
              : { day: lastDay.day, count: lastDay.count };
        await this.store.set(deviceId, { ...record, upTo: lastDay.day });
      } catch (err) {
        logger.debug(`${city.source.name}: record of ${counterId} unavailable: ${err.message}`);
      }
      return [];
    }
    if (lastDay.day <= saved.upTo) {
      return [];
    }
    const events = [];
    let { day, count } = saved;
    for (const entry of summary.days) {
      if (!entry.complete || entry.day <= saved.upTo || entry.anomaly === 'Forte') {
        continue;
      }
      if (count > 0 && entry.count > count) {
        events.push({
          key: TRIGGERS.DAILY_RECORD,
          data: {
            ...this.eventData(deviceId, city, summary),
            count: entry.count,
            day: entry.day,
            previous_record: count,
            previous_record_day: day,
          },
        });
      }
      if (entry.count > count) {
        ({ day, count } = entry);
      }
    }
    await this.store.set(deviceId, { day, count, upTo: lastDay.day });
    return events;
  }

  /** "Late" events: the data of a counter crosses a delay past the usual one of its source. */
  lateEvents(deviceId, { city, summary }) {
    const late = this.hoursLate(city, summary);
    const previous = this.lateness.get(deviceId);
    this.lateness.set(deviceId, late);
    if (previous === undefined || !Number.isFinite(late)) {
      return [];
    }
    return LATE_THRESHOLDS.filter((hours) => previous < hours && late >= hours).map((hours) => ({
      key: TRIGGERS.COUNTER_LATE,
      data: {
        ...this.eventData(deviceId, city, summary),
        hours: String(hours),
        age_hours: ageHours(summary, this.now()),
      },
    }));
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      if (this.fireFailed) {
        this.fireFailed = false;
        logger.info('Scene triggers fired again');
      }
    } catch (err) {
      if (!this.fireFailed) {
        logger.warn(`Cannot fire the ${key} trigger: ${err.message}`);
      }
      this.fireFailed = true;
    }
  }

  // --- configuration action -----------------------------------------------------

  status() {
    const now = this.now();
    const blocks = [];
    if (this.config.cities.length === 0) {
      blocks.push(render(REPORTS, 'noCity'));
    }
    for (const key of this.activeKeys()) {
      const city = this.city(key);
      const days = [...(city.groups?.keys() ?? [])]
        .map((id) => this.summary(city, id)?.lastDay?.day)
        .filter(Boolean)
        .sort();
      blocks.push(
        render(REPORTS, 'city', { name: city.source.name, count: city.groups?.size ?? 0 }),
        city.okAt === null
          ? render(REPORTS, 'waiting')
          : render(REPORTS, 'read', {
              age: Math.round((now - city.okAt) / 60000),
              day: days.at(-1) ?? '—',
            }),
        city.error ? render(REPORTS, 'error', { error: city.error }) : null,
      );
    }
    blocks.push(render(REPORTS, 'watched', { count: this.watched().length }));
    return lines(...blocks);
  }
}
