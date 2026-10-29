// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.2+ for the chart).
//
// - counters: the watched counters, one status row each ("Pont Wilson" /
//   "1 934 · hier · ↗ 12 %"), grey when the data is late or no day is
//   complete yet; below, a chart of the last 7 complete days of the first
//   four counters (hidden by a setting).
//
// Budget of the core: 8 components, 1 focal (the chart), 1 status (10 rows).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { addDays, dayStart, localDay } from './counters.js';
import { clip } from './devices.js';

/**
 * Shortens a name in the middle, keeping its end: the direction of a Paris
 * counter ("… NE-SO") is what tells two rows apart.
 */
export function clipMiddle(text, max) {
  const value = String(text ?? '');
  if (value.length <= max) {
    return value;
  }
  const tail = value.slice(value.lastIndexOf(' ') + 1);
  if (tail.length > max / 2) {
    return clip(value, max);
  }
  return `${value.slice(0, max - tail.length - 2).trimEnd()}… ${tail}`;
}

/** Names made distinct: a repeated one gets " (2)", " (3)"… within `max`. */
export function distinct(names, max) {
  const seen = new Map();
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (count === 1) {
      return name;
    }
    const suffix = ` (${count})`;
    return `${clipMiddle(name, max - suffix.length)}${suffix}`;
  });
}
import { TEXT, formatCount, formatDay, say } from './messages.js';

export const MAX_ROWS = 10;
export const MAX_SERIES = 4;
const MAX_LABEL = 40;
const MAX_SERIES_NAME = 24;

/**
 * The name given in Gladys, without the "Tours Métropole · " the device was
 * discovered with: the rows and the curves name the counter itself.
 */
export function shortName(entry, city) {
  const prefix = city ? `${city.source.name} · ` : null;
  return prefix && entry.name.startsWith(prefix) && entry.name.length > prefix.length
    ? entry.name.slice(prefix.length)
    : entry.name;
}

/** "hier", or "le 26 oct.": the day a count belongs to. */
export function whenText(day, now, language) {
  return day === addDays(localDay(now), -1)
    ? say(TEXT, language, 'yesterday')
    : say(TEXT, language, 'on', { day: formatDay(day, language) });
}

/** "↗ 12 %", "↘ 4 %", "→ 0 %". */
export function trendText(trend) {
  const arrow = trend > 0 ? '↗' : trend < 0 ? '↘' : '→';
  return `${arrow} ${Math.abs(trend)} %`;
}

/** The value of a status row. */
export function rowValue(service, city, summary, language) {
  if (!summary?.lastDay) {
    return say(TEXT, language, summary ? 'noDay' : 'late');
  }
  const parts = [
    formatCount(summary.lastDay.count, language),
    whenText(summary.lastDay.day, service.now(), language),
  ];
  if (summary.trend !== null) {
    parts.push(trendText(summary.trend));
  }
  return clip(parts.join(' · '), 40);
}

async function countersContent(service, { settings, language }) {
  await service.firstReading();
  const lang = language ?? service.config.language;
  const ttl = Math.max(60, service.config.refreshSeconds);
  const watched = service.watched();
  const chosen = Array.isArray(settings?.counters) ? settings.counters.map(String) : [];
  const entries =
    chosen.length > 0
      ? chosen.map((id) => watched.find((entry) => entry.deviceId === id)).filter(Boolean)
      : watched;
  if (entries.length === 0) {
    const key = chosen.length > 0 ? 'gone' : 'pickCounter';
    return { ttl_seconds: ttl, components: [{ type: 'text', text: say(TEXT, lang, key) }] };
  }
  const rows = entries.slice(0, MAX_ROWS).map((entry) => {
    const found = service.lookup(entry.deviceId);
    return { entry, city: found?.city, summary: found?.summary ?? null };
  });
  const labels = distinct(
    rows.map(({ entry, city }) => clipMiddle(shortName(entry, city), MAX_LABEL)),
    MAX_LABEL,
  );
  const components = [
    {
      type: 'status',
      items: rows.map(({ city, summary }, index) => ({
        label: labels[index],
        value: rowValue(service, city, summary, lang),
        color:
          summary?.lastDay && !service.isLate(city, summary)
            ? WIDGET_COLORS.PRIMARY
            : WIDGET_COLORS.NEUTRAL,
      })),
    },
  ];
  const charted = rows.filter(({ summary }) => summary?.lastDay).slice(0, MAX_SERIES);
  const seriesNames = distinct(
    charted.map(({ entry, city }) => clipMiddle(shortName(entry, city), MAX_SERIES_NAME)),
    MAX_SERIES_NAME,
  );
  const series = charted
    .map(({ summary }, index) => ({
      name: seriesNames[index],
      points: summary.days
        .filter((d) => d.complete && d.day > addDays(summary.lastDay.day, -7))
        .map((d) => ({ t: new Date(dayStart(d.day)).toISOString(), v: d.count })),
    }))
    .filter((serie) => serie.points.length > 0);
  if (settings?.hide_chart !== true && series.length > 0) {
    components.push({
      type: 'chart',
      chart_type: series.length === 1 ? 'bar' : 'line',
      title: say(TEXT, lang, 'chartTitle'),
      unit: say(TEXT, lang, 'unit'),
      series,
    });
  }
  return { ttl_seconds: ttl, components };
}

export const WIDGETS = {
  counters: { get: countersContent },
};
