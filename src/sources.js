// -----------------------------------------------------------------------------
// The open data sources: one Opendatasoft dataset per city, read through the
// same three aggregated queries (Explore API v2.1, no key):
//
//   days(since)      every counter of the city, one row per local day since
//                    `since`: { id, name, day, count, slots, last, anomaly }
//   lastHours(list)  the last hourly slot of a few counters (hourly sources)
//   record(id, day)  the best day of a counter up to `day` included
//
// The days are French days (`timezone=Europe/Paris`): the counters are in
// France, whatever the time zone of Gladys.
//
// Every source below was checked live on 2026-10-29 (test/fixtures/sources
// holds those answers). Keys are part of the device external ids: never
// rename one.
// -----------------------------------------------------------------------------

import { getJson } from './http.js';

export const SOURCE_TIMEZONE = 'Europe/Paris';
const MAX_BODY_BYTES = 4e6;
// An aggregated query returns every group at once (no 100-row pages), up to
// this many rows: 120 counters × 17 days for Paris.
const MAX_GROUPS = 5000;

/** A whole number ≥ 0, or null for a missing or non-numeric value. */
export function int(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

/** A date in ms, or null. */
export function time(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** An ODSQL string literal. */
export const quote = (value) => `"${String(value).replace(/["\\]/g, '\\$&')}"`;

/** One aggregated Opendatasoft query. */
async function ods(fetch, source, params) {
  const query = new URLSearchParams({ ...params, timezone: SOURCE_TIMEZONE });
  const url = `${source.base}/api/explore/v2.1/catalog/datasets/${source.datasetId}/records?${query}`;
  const data = await getJson(fetch, url, { maxBytes: MAX_BODY_BYTES });
  return Array.isArray(data?.results) ? data.results : [];
}

const and = (...clauses) =>
  clauses
    .filter(Boolean)
    .map((clause) => `(${clause})`)
    .join(' and ');

/**
 * The queries of a source, from its field names.
 * @param {object} fields
 * @param {string} fields.id     counter id (one per direction when the source separates them)
 * @param {string} fields.name   counter name
 * @param {string} fields.count  passages of the record
 * @param {string} fields.date   date of the record (hour or day)
 * @param {string} [fields.area] a commune, shown before the name
 * @param {string} [fields.anomaly] the source's own anomaly flag
 * @param {string} [fields.where] records kept (e.g. bikes only)
 */
function odsQueries({ id, name, count, date, area, anomaly, where }) {
  const groups = [`${id} as id`, `${name} as name`];
  if (area) {
    groups.push(`${area} as area`);
  }
  if (anomaly) {
    groups.push(`${anomaly} as anomaly`);
  }
  return {
    async days(fetch, since) {
      const rows = await ods(fetch, this, {
        select: `sum(${count}) as count, count(*) as slots, max(${date}) as last`,
        where: and(where, `${date} >= date'${since}'`),
        group_by: [...groups, `date_format(${date}, 'yyyy-MM-dd') as day`].join(', '),
        limit: String(MAX_GROUPS),
      });
      return rows
        .filter((row) => row.id !== null && row.id !== undefined && row.day)
        .map((row) => ({
          id: String(row.id),
          name: [row.area, row.name]
            .filter((part) => part !== null && part !== undefined && String(part).trim())
            .map((part) => String(part).trim())
            .join(' · '),
          day: String(row.day),
          count: int(row.count) ?? 0,
          slots: int(row.slots) ?? 0,
          last: time(row.last),
          anomaly: row.anomaly ? String(row.anomaly) : null,
        }));
    },

    /** `wanted`: [{ id, last }], the last slot of each counter. */
    async lastHours(fetch, wanted) {
      if (wanted.length === 0) {
        return new Map();
      }
      const rows = await ods(fetch, this, {
        select: `${id} as id, ${date} as at, sum(${count}) as count`,
        where: and(
          where,
          wanted
            .map(
              (w) => `${id} = ${quote(w.id)} and ${date} = date'${new Date(w.last).toISOString()}'`,
            )
            .map((clause) => `(${clause})`)
            .join(' or '),
        ),
        group_by: `${id}, ${date}`,
        limit: String(MAX_GROUPS),
      });
      return new Map(
        rows
          .filter((row) => row.id !== null && row.id !== undefined)
          .map((row) => [String(row.id), { at: time(row.at), count: int(row.count) ?? 0 }]),
      );
    },

    /** The best day of a counter up to `day` (YYYY-MM-DD) included: { day, count } or null. */
    async record(fetch, counterId, day) {
      const rows = await ods(fetch, this, {
        select: `sum(${count}) as count`,
        where: and(
          where,
          `${id} = ${quote(counterId)}`,
          `${date} < date'${nextDay(day)}'`,
          anomaly ? `${anomaly} is null or ${anomaly} != "Forte"` : null,
        ),
        group_by: `date_format(${date}, 'yyyy-MM-dd') as day`,
        order_by: 'count desc',
        limit: '1',
      });
      const best = rows[0];
      return best?.day ? { day: String(best.day), count: int(best.count) ?? 0 } : null;
    },
  };
}

/** The calendar day after a YYYY-MM-DD day. */
export function nextDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Every source: `step` is the finest step of its records ('hour' or 'day');
 * `fullDays` when every row is a whole day (the source publishes finished
 * days only); `intraday` when the source delivers the current day too;
 * `usualAgeHours` the oldest its last data normally gets, between two of its
 * daily publications (the "late counter" trigger counts from there).
 */
export const SOURCES = {
  // opendata.paris.fr, "Comptage vélo - Données compteurs": hourly counts of
  // the last 13 months, one counter per direction, published every morning
  // up to the end of the day before.
  paris: {
    name: 'Paris',
    publisher: 'Ville de Paris',
    dataset: 'https://opendata.paris.fr/explore/dataset/comptage-velo-donnees-compteurs/',
    base: 'https://opendata.paris.fr',
    datasetId: 'comptage-velo-donnees-compteurs',
    step: 'hour',
    fullDays: false,
    intraday: false,
    usualAgeHours: 36,
    ...odsQueries({ id: 'id_compteur', name: 'nom_compteur', count: 'sum_counts', date: 'date' }),
  },

  // data.nantesmetropole.fr, "Comptages vélo Naolib de Nantes Métropole": one
  // row per loop and finished day (24 hourly columns and the total),
  // published two days later. The source flags its doubtful days
  // (probabilite_presence_anomalie "Forte"): never a record.
  nantes: {
    name: 'Nantes Métropole',
    publisher: 'Nantes Métropole',
    dataset:
      'https://data.nantesmetropole.fr/explore/dataset/244400404_comptages-velo-nantes-metropole/',
    base: 'https://data.nantesmetropole.fr',
    datasetId: '244400404_comptages-velo-nantes-metropole',
    step: 'day',
    fullDays: true,
    intraday: false,
    usualAgeHours: 60,
    ...odsQueries({
      id: 'boucle_num',
      name: 'boucle_libelle',
      count: 'total',
      date: 'jour',
      anomaly: 'probabilite_presence_anomalie',
    }),
  },

  // data.tours-metropole.fr, "Comptage vélo - Données Compteurs - Syndicat
  // des Mobilités de Touraine": daily, 60- or 15-minute records depending on
  // the counter, published late every morning with the current day so far.
  tours: {
    name: 'Tours Métropole',
    publisher: 'Syndicat des Mobilités de Touraine',
    dataset:
      'https://data.tours-metropole.fr/explore/dataset/comptage-velo-donnees-compteurs-syndicat-des-mobilites-de-touraine/',
    base: 'https://data.tours-metropole.fr',
    datasetId: 'comptage-velo-donnees-compteurs-syndicat-des-mobilites-de-touraine',
    step: 'day',
    fullDays: false,
    intraday: true,
    usualAgeHours: 40,
    ...odsQueries({ id: 'id', name: 'nom_compteur', count: 'counts', date: 'date' }),
  },

  // data.saintnazaireagglo.fr, the bike and pedestrian counters of the CARENE:
  // hourly, published every morning up to that morning. Only the counters
  // of bikes alone are kept (the others add up walkers and riders).
  saint_nazaire: {
    name: 'Saint-Nazaire agglo',
    publisher: 'Saint-Nazaire agglo – La CARENE',
    dataset:
      'https://data.saintnazaireagglo.fr/explore/dataset/ex-vue-personnalisee-comptage-velo-et-pedestre-donnees-compteurs/',
    base: 'https://data.saintnazaireagglo.fr',
    datasetId: 'ex-vue-personnalisee-comptage-velo-et-pedestre-donnees-compteurs',
    step: 'hour',
    fullDays: false,
    intraday: true,
    usualAgeHours: 30,
    ...odsQueries({
      id: 'id',
      name: 'name',
      count: 'counts',
      date: 'date',
      where: 'travel_modes = "vélo"',
    }),
  },

  // opendata.hauts-de-seine.fr, "Comptages vélos (pas journalier)": the
  // counters of the departmental roads, daily, published every night with
  // the day just over (possibly unfinished: a day only counts once the next
  // one is there).
  hauts_de_seine: {
    name: 'Hauts-de-Seine',
    publisher: 'Département des Hauts-de-Seine',
    dataset:
      'https://opendata.hauts-de-seine.fr/explore/dataset/fr-229200506-comptages-velos-pas-journalier/',
    base: 'https://opendata.hauts-de-seine.fr',
    datasetId: 'fr-229200506-comptages-velos-pas-journalier',
    step: 'day',
    fullDays: false,
    intraday: false,
    usualAgeHours: 52,
    ...odsQueries({ id: 'id', name: 'name', count: 'counts', date: 'date', area: 'commune' }),
  },
};

export const SOURCE_KEYS = Object.keys(SOURCES);
