// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

import { SOURCE_KEYS } from './sources.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Seconds between two readings of the portals. They publish once a day: an
// hour is plenty, half an hour catches a morning publication sooner. The
// integration drives its own timer (devices are published with
// should_poll: false, the core only polls up to one minute).
export const REFRESH_INTERVALS = ['1800', '3600', '10800'];

export const DEFAULT_CONFIG = {
  cities: [],
  language: 'fr',
  refresh_interval: '3600',
};

/** The cities chosen: an array from the form, tolerating a JSON or comma-separated string. */
function citiesOf(value) {
  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      list = value.split(',');
    }
  }
  if (!Array.isArray(list)) {
    return [];
  }
  const wanted = list.map((item) => String(item).trim());
  return SOURCE_KEYS.filter((key) => wanted.includes(key));
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const interval = REFRESH_INTERVALS.includes(String(source.refresh_interval))
    ? String(source.refresh_interval)
    : DEFAULT_CONFIG.refresh_interval;
  return {
    cities: citiesOf(source.cities),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
    refreshSeconds: Number(interval),
  };
}
