// -----------------------------------------------------------------------------
// From the daily rows of a source to what a counter shows: its last complete
// day, the 7 days ending there, the week before, today so far, the last hour,
// and the end of its last data.
//
// A day is complete when the source has delivered all of it: a source that
// publishes finished days only (`fullDays`), every hourly slot up to 23:00
// for an hourly source, the day followed by a later one in a daily source (whose rows do
// not say how much of the day they hold). The day still being delivered is
// never shown as a finished day.
// -----------------------------------------------------------------------------

import { SOURCE_TIMEZONE, nextDay } from './sources.js';

const HOUR_MS = 3600 * 1000;

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: SOURCE_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Local calendar parts of a date in France. */
function partsOf(ms) {
  const parts = Object.fromEntries(PARTS.formatToParts(ms).map((p) => [p.type, p.value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    utc: Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ),
  };
}

/** The French day (YYYY-MM-DD) of a date. */
export const localDay = (ms) => partsOf(ms).day;

/** The French hour (0-23) of a date. */
export const localHour = (ms) => partsOf(ms).hour;

/** The calendar day `n` days after (or before, n < 0) a YYYY-MM-DD day. */
export function addDays(day, n) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** The instant a French day starts. */
export function dayStart(day) {
  const guess = Date.parse(`${day}T00:00:00Z`);
  // Offset of France (1 or 2 hours) at 00:00 UTC, the same as at the local
  // midnight just before: summer time changes at 01:00 UTC.
  return guess - (partsOf(guess).utc - guess);
}

/** Hours in a French day: 23, 24 or 25. */
export const hoursIn = (day) => Math.round((dayStart(nextDay(day)) - dayStart(day)) / HOUR_MS);

/** Sum of the complete days within [from, to], and how many there were. */
function sumDays(days, from, to) {
  const inside = days.filter((d) => d.complete && d.day >= from && d.day <= to);
  return { count: inside.reduce((sum, d) => sum + d.count, 0), days: inside.length };
}

/**
 * What a counter shows, from its rows.
 * @param {object} source an entry of SOURCES
 * @param {Array} rows the rows of this counter (any order)
 * @param {number} now
 * @param {{ at: number, count: number }|null} [lastHour]
 */
export function summarize(source, rows, now, lastHour = null) {
  const sorted = [...rows].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const today = localDay(now);
  const days = sorted.map((row, index) => ({
    day: row.day,
    count: row.count,
    anomaly: row.anomaly ?? null,
    complete:
      row.day < today &&
      (source.fullDays ||
        (source.step === 'hour'
          ? row.last !== null && localHour(row.last) === 23 && row.slots >= hoursIn(row.day)
          : index < sorted.length - 1)),
  }));
  const complete = days.filter((d) => d.complete);
  const lastDay = complete.at(-1) ?? null;

  let week = null;
  let trend = null;
  if (lastDay) {
    const current = sumDays(days, addDays(lastDay.day, -6), lastDay.day);
    const previous = sumDays(days, addDays(lastDay.day, -13), addDays(lastDay.day, -7));
    // Only a whole week: a missing day (Paris has no 2026-10-25) would show
    // a week one seventh short.
    week = current.days === 7 ? current.count : null;
    // A trend only between two whole weeks: a missing day would fake one.
    if (current.days === 7 && previous.days === 7 && previous.count > 0) {
      trend = Math.round(((current.count - previous.count) / previous.count) * 100);
    }
  }

  let dataEnd = null;
  if (source.step === 'hour') {
    const lasts = sorted.map((row) => row.last).filter((last) => last !== null);
    dataEnd = lasts.length > 0 ? Math.max(...lasts) + HOUR_MS : null;
  } else if (lastDay) {
    dataEnd = dayStart(nextDay(lastDay.day));
  }

  return {
    id: String(sorted[0]?.id ?? ''),
    name: sorted.at(-1)?.name ?? '',
    days,
    lastDay,
    week,
    trend,
    today: source.intraday ? (sorted.find((row) => row.day === today)?.count ?? 0) : null,
    // The hour of an older reading would be shown as the last one: only the
    // slot that ends the data counts.
    lastHour:
      source.step === 'hour' && lastHour && dataEnd !== null && lastHour.at === dataEnd - HOUR_MS
        ? lastHour
        : null,
    dataEnd,
  };
}

/** Whole hours since the end of the counter's last data (Infinity when unknown). */
export function ageHours(summary, now) {
  if (!summary || summary.dataEnd === null) {
    return Infinity;
  }
  return Math.max(0, Math.floor((now - summary.dataEnd) / HOUR_MS));
}
