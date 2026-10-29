# Gladys Bike counters

External integration for [Gladys Assistant](https://gladysassistant.com): the
**bike counters published in open data by French cities**, in Gladys: how many
cyclists rode past your counter the day before, over the last 7 days, and
whether it was a record. **Paris, Nantes Métropole, Tours Métropole, the
Saint-Nazaire area** and the departmental roads of **Hauts-de-Seine**. **No
account, no key.**

Unofficial: not affiliated with the cities, Eco-Counter or the counter
operators. No hardware involved: the five sources were checked live on
2026-10-29, not yet on many Gladys installations: feedback welcome.

User documentation: [English](docs/en.md) · [français](docs/fr.md) ·
[Deutsch](docs/de.md) · [español](docs/es.md).

## What you get in Gladys

| Kind                 | Content                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Devices              | one per counter added: last complete day, last 7 days, today so far and last hour (by city), data age |
| Dashboard widget     | "Bike counters": one row per counter (last complete day, weekly trend) and a 7-day chart              |
| Scene triggers       | daily record beaten, counter data late (12 h to 1 week beyond the usual delay of the city)            |
| Scene action         | the figures of a counter: numbers and a sentence ready to send                                        |
| Configuration action | status: cities read, last complete day, errors                                                        |

Requires Gladys **5.3.0** or later.

## Installation

In Gladys: **Integrations → Install from GitHub**, then
`https://github.com/guim31/gladys-compteurs-velo`. Tick your cities in the
configuration, then add your counters from the **Discover** tab.

## How it works

- One Opendatasoft dataset per city (`src/sources.js`), read through
  aggregated queries of the Explore v2.1 API: one row per counter and French
  day for the last 17 days, the last hourly slot of the watched counters
  (hourly sources), and once per counter the best day of its history (kept in
  `/data/records.json`).
- The cities publish once a day. A day is shown only once **complete**: the
  23:00 slot of an hourly source, the next day present in a daily one, every
  row in Nantes (finished days only). The current day is "today so far", never
  a finished day.
- Devices are published with `should_poll: false`: the container reads the
  portals every 30 minutes, hour (default) or 3 hours.

| City             | Step | Last complete day, usually   |
| ---------------- | ---- | ---------------------------- |
| Paris            | hour | yesterday (published ~8 am)  |
| Nantes Métropole | day  | three days ago               |
| Tours Métropole  | day  | yesterday (published ~noon)  |
| Saint-Nazaire    | hour | yesterday (published ~10 am) |
| Hauts-de-Seine   | day  | the day before yesterday     |

## Limitations

- **Toulouse** (Eco-Counter dataset frozen since June 2025), **Rennes**
  (frozen since July 2026), **Montpellier** (portal down during the tests),
  **Lille**, **Angers** and **Brest** (yearly or campaign figures only) and
  **Anglet** (one dataset per year) are not supported for now.
- Figures as published by the cities: raw Eco-Counter counts, published once
  a day, sometimes corrected later.
- Read only.

## Development

```bash
npm install
npm test               # node --test, no network access
npm run lint           # ESLint
npm run format:check   # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store .   # store admission checks
```

See [CLAUDE.md](CLAUDE.md) for the architecture and the conventions. The test
fixtures (`test/fixtures/sources`) are the real answers of the five portals,
captured on 2026-10-29.

## Credits

- Data: Ville de Paris, Nantes Métropole, Syndicat des Mobilités de Touraine,
  Saint-Nazaire agglo – La CARENE and Département des Hauts-de-Seine, under
  their open licences (ODbL / Licence Ouverte). The counters are Eco-Counter
  devices run by the cities.
- Built from the official
  [integration template](https://github.com/GladysAssistant/integration-template-js).

## License

[Apache 2.0](LICENSE).
