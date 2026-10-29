// -----------------------------------------------------------------------------
// From the daily rows to what a counter shows: complete days only, the week,
// the trend, today, the last hour and the age of the data, on French days
// (summer time included).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  ageHours,
  dayStart,
  hoursIn,
  localDay,
  localHour,
  summarize,
} from '../src/counters.js';
import { SOURCES } from '../src/sources.js';

const HOUR = 3600 * 1000;
// 2026-10-29 10:00 in Paris (UTC+1).
const NOW = Date.parse('2026-10-29T09:00:00Z');

/** Rows of one counter, one per day, ending at `lastDay`, each with its 23:00 slot. */
function rows(lastDay, counts, { daily = false } = {}) {
  return counts.map((count, index) => {
    const day = addDays(lastDay, index - counts.length + 1);
    return {
      id: 'c1',
      name: 'Pont',
      day,
      count,
      slots: daily ? 1 : hoursIn(day),
      // The 23:00 slot in Paris, or midnight UTC for a daily source.
      last: daily ? Date.parse(`${day}T00:00:00Z`) : dayStart(addDays(day, 1)) - HOUR,
      anomaly: null,
    };
  });
}

const fourteen = [100, 100, 100, 100, 100, 100, 100, 110, 110, 110, 110, 110, 110, 110];

test('French days and hours, summer time included', () => {
  assert.equal(localDay(Date.parse('2026-10-28T23:30:00Z')), '2026-10-29');
  assert.equal(localDay(Date.parse('2026-07-14T21:59:00Z')), '2026-07-14');
  assert.equal(localHour(Date.parse('2026-10-27T22:00:00Z')), 23);
  assert.equal(localHour(Date.parse('2026-07-27T21:00:00Z')), 23);
  assert.equal(new Date(dayStart('2026-10-29')).toISOString(), '2026-10-28T23:00:00.000Z');
  assert.equal(new Date(dayStart('2026-07-14')).toISOString(), '2026-07-13T22:00:00.000Z');
  // The two days of the clock changes.
  assert.equal(new Date(dayStart('2026-10-25')).toISOString(), '2026-10-24T22:00:00.000Z');
  assert.equal(new Date(dayStart('2026-03-29')).toISOString(), '2026-03-28T23:00:00.000Z');
});

test('an hourly source: a day is complete once all its slots up to 23:00 are there', () => {
  // The day before yesterday ends at 23:00, yesterday stops at 09:00.
  const data = rows('2026-10-28', [...fourteen, 50]);
  data.at(-1).last = Date.parse('2026-10-28T08:00:00Z');
  const summary = summarize(SOURCES.saint_nazaire, data, NOW);
  assert.equal(summary.lastDay.day, '2026-10-27');
  assert.equal(summary.lastDay.count, 110);
  assert.equal(summary.week, 770);
  assert.equal(summary.trend, 10);
  // Today has no row yet: 0 passages so far.
  assert.equal(summary.today, 0);
  // The data ends at 10:00 on the 28th: 24 hours ago.
  assert.equal(ageHours(summary, NOW), 24);

  data.at(-1).last = Date.parse('2026-10-28T22:00:00Z');
  assert.equal(summarize(SOURCES.saint_nazaire, data, NOW).lastDay.day, '2026-10-28');
  // The 23:00 slot is there but an hour is missing: not complete.
  data.at(-1).slots = 23;
  assert.equal(summarize(SOURCES.saint_nazaire, data, NOW).lastDay.day, '2026-10-27');
  // The clock change day has 25 hours, the spring one 23.
  assert.deepEqual(['2026-10-25', '2026-03-29', '2026-10-28'].map(hoursIn), [25, 23, 24]);
});

test('today so far, for the sources that deliver the current day', () => {
  const data = rows('2026-10-29', [...fourteen, 120, 42]);
  data.at(-1).last = Date.parse('2026-10-29T07:00:00Z');
  assert.equal(summarize(SOURCES.saint_nazaire, data, NOW).today, 42);
  // Today is never a complete day, whatever its last slot says.
  data.at(-1).last = Date.parse('2026-10-29T22:00:00Z');
  assert.equal(summarize(SOURCES.saint_nazaire, data, NOW).lastDay.day, '2026-10-28');
  assert.equal(summarize(SOURCES.paris, data, NOW).today, null);
});

test('a daily source: the last day counts only once the next one is there', () => {
  const data = rows('2026-10-28', [...fourteen, 30], { daily: true });
  const summary = summarize(SOURCES.hauts_de_seine, data, NOW);
  assert.equal(summary.lastDay.day, '2026-10-27');
  // A daily source: the data ends with the last complete day, at midnight.
  assert.equal(summary.dataEnd, dayStart('2026-10-28'));
  assert.equal(ageHours(summary, NOW), 34);
});

test('a source of finished days (Nantes): its last row is complete', () => {
  const data = rows('2026-10-26', fourteen, { daily: true });
  const summary = summarize(SOURCES.nantes, data, NOW);
  assert.equal(summary.lastDay.day, '2026-10-26');
  assert.equal(summary.week, 770);
  assert.equal(ageHours(summary, NOW), 58);
});

test('no week nor trend without whole weeks: a missing day is not invented', () => {
  const data = rows('2026-10-27', fourteen);
  data.splice(10, 1); // 2026-10-24 missing, like Paris on the night of the clock change
  const summary = summarize(SOURCES.paris, data, NOW);
  assert.equal(summary.week, null);
  assert.equal(summary.trend, null);
  assert.equal(summarize(SOURCES.paris, rows('2026-10-27', [5, 6]), NOW).trend, null);
});

test('no complete day yet: nothing to show but the age', () => {
  const data = rows('2026-10-28', [12]);
  const summary = summarize(SOURCES.tours, data, NOW);
  assert.equal(summary.lastDay, null);
  assert.equal(summary.week, null);
  assert.equal(summary.dataEnd, null);
  assert.equal(ageHours(summary, NOW), Infinity);
});

test('the last hour is the slot that ends the data, never an older one', () => {
  const data = rows('2026-10-27', fourteen);
  const end = Date.parse('2026-10-27T22:00:00Z');
  const fresh = summarize(SOURCES.paris, data, NOW, { at: end, count: 29 });
  assert.deepEqual(fresh.lastHour, { at: end, count: 29 });
  const old = summarize(SOURCES.paris, data, NOW, { at: end - 24 * HOUR, count: 31 });
  assert.equal(old.lastHour, null);
  assert.equal(summarize(SOURCES.tours, data, NOW, { at: end, count: 29 }).lastHour, null);
});
