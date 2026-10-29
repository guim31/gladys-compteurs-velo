// -----------------------------------------------------------------------------
// The Gladys device of a bike counter and its states:
//   last_hour  counter-sensor/integer        passages in the last hour delivered
//                                            (hourly sources only)
//   today      counter-sensor/integer        passages today so far (sources that
//                                            deliver the current day only)
//   last_day   counter-sensor/integer        passages of the last complete day
//   week       counter-sensor/integer        passages of the 7 days ending there
//   age        duration/integer (hours)      hours since the end of the last data
//
// Read-only, no polling: the integration reads the portals on its own timer
// (src/service.js), Gladys never polls (`should_poll: false`). The bounds are
// fixed display bounds, so that the structure never changes.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { ageHours } from './counters.js';
import { NAMES } from './messages.js';

export const COUNTER_TYPE = 'counter';
export const MAX_DEVICE_NAME = 80;
export const MAX_AGE_HOURS = 720;

/** Shortens a text to `max` characters, with an ellipsis. */
export function clip(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** A piece of an external id: letters, digits, "_" and "-" only. */
export const slug = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The platform id of a counter: "<source key>-<id given by the portal>". */
export const counterPlatformId = (sourceKey, id) => `${sourceKey}-${slug(id)}`;

/** "Pont Wilson" stays; the "SN_" prefix and underscores of some portals go. */
export function prettyName(name) {
  return String(name ?? '')
    .replace(/^SN_/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BOUNDS = { last_hour: 10000, today: 100000, last_day: 100000, week: 1000000 };

/** The feature keys of a counter of this source. */
export const featureKeys = (source) => [
  ...(source.step === 'hour' ? ['last_hour'] : []),
  ...(source.intraday ? ['today'] : []),
  'last_day',
  'week',
  'age',
];

/**
 * The device of a counter.
 * @param {object} gladys
 * @param {string} sourceKey
 * @param {object} source an entry of SOURCES
 * @param {object} summary from summarize()
 * @param {string} language
 */
export function buildCounterDevice(gladys, sourceKey, source, summary, language) {
  const ids = gladys.externalIds(COUNTER_TYPE, counterPlatformId(sourceKey, summary.id));
  const names = NAMES[language] ?? NAMES.en;
  const definition = (key) =>
    key === 'age'
      ? {
          category: C.DURATION,
          type: T.DURATION.INTEGER,
          unit: U.HOURS,
          min: 0,
          max: MAX_AGE_HOURS,
        }
      : { category: C.COUNTER_SENSOR, type: T.SENSOR.INTEGER, min: 0, max: BOUNDS[key] };
  return {
    name: clip(`${source.name} · ${prettyName(summary.name)}`, MAX_DEVICE_NAME),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'source', value: sourceKey },
      { name: 'counter_id', value: summary.id },
    ],
    features: featureKeys(source).map((key) => ({
      name: names[key],
      external_id: ids.feature(key),
      ...definition(key),
      read_only: true,
      has_feedback: false,
    })),
  };
}

/**
 * The states of a counter device. A value the source does not give yet (no
 * complete day, no hour) is not published: the last known one stays.
 */
export function counterStates(gladys, sourceKey, source, summary, now) {
  const ids = gladys.externalIds(COUNTER_TYPE, counterPlatformId(sourceKey, summary.id));
  const age = ageHours(summary, now);
  const values = {
    last_hour: summary.lastHour?.count ?? null,
    today: summary.today,
    last_day: summary.lastDay?.count ?? null,
    week: summary.week,
    age: Number.isFinite(age) ? Math.min(MAX_AGE_HOURS, age) : null,
  };
  return featureKeys(source)
    .filter((key) => values[key] !== null && values[key] !== undefined)
    .map((key) => ({ device_feature_external_id: ids.feature(key), state: values[key] }));
}
