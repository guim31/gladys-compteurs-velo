# Bike counters

The **bike counters** that French cities publish in open data, in Gladys: how many cyclists rode
past "your" counter yesterday, over the last 7 days, and whether it was a record. Paris, Nantes
Métropole, Tours Métropole, the Saint-Nazaire area and the departmental roads of Hauts-de-Seine.
**No account, no key.**

Unofficial integration, not affiliated with the cities, Eco-Counter or the counter operators. No
hardware involved: the five sources were checked live on 2026-10-29, feedback is welcome.

## What you get

- One **device per counter** you add (per direction when the city separates them): passages of
  the last complete day, of the last 7 days, of today so far and of the last hour available
  (depending on the city), and the age of the data.
- A **widget** "Bike counters": your counters on one row each (last complete day and trend over a
  week), with a 7-day chart.
- Two **scene triggers**: daily record beaten, counter data late.
- A **scene action**: the figures of a counter, with a sentence ready to send or to speak.

## Requirements

- Gladys Assistant **5.3.0** or later.
- Internet access from Gladys: the data comes from the open data portals of the cities.
- No account, no API key.

## Installation

1. In Gladys, open **Integrations → Install from GitHub**.
2. Paste the address `https://github.com/guim31/gladys-compteurs-velo` and confirm.
3. Open the integration once installed: the **Configuration** tab shows.

## Configuration

### Settings

| Setting               | Effect                                                            |
| --------------------- | ----------------------------------------------------------------- |
| Cities                | the cities whose counters are offered in the Discover tab         |
| Language of the names | language of the feature names and of the scene sentences (French) |
| Reading interval      | every 30 minutes, every hour (default) or every 3 hours           |

Feature names are fixed when a device is added: pick the language first.

### Add counters

1. Tick one or more cities, then save.
2. Open the **Discover** tab: every counter of those cities with data in the last 17 days shows
   there, as "City · Counter".
3. Add the ones you want to Gladys. Their values arrive at once.

The counters added are the **watched counters**: the widget, the triggers and the scene action
offer them. A counter added stays read even if you untick its city afterwards.

### Check

The **Status** action of the Configuration tab lists the cities read, their number of counters, the
time of the last reading, the last complete day and the last error if any.

## Devices

| Feature             | Meaning                                                                | Cities               |
| ------------------- | ---------------------------------------------------------------------- | -------------------- |
| Last complete day   | passages of the last day the city has delivered in full                | all                  |
| Last 7 days         | passages of the 7 days ending with the last complete day               | all                  |
| Today so far        | passages of the current day already delivered (0 until the first data) | Tours, Saint-Nazaire |
| Last hour available | passages of the last hour delivered                                    | Paris, Saint-Nazaire |
| Data age            | hours since the end of the last data                                   | all                  |

**A day is never shown before it is complete**: the cities deliver once a day, and the day being
delivered stays out of "Last complete day" and "Last 7 days". A day missing from the source is not
invented: the 7 days then add up to six.

## Dashboard widget

"Bike counters": one row per counter (10 at most), with the passages of the last complete day,
"yesterday" or its date, and the trend against the week before ("↗ 12 %"). Grey when the data is
late. Below, a chart of the last 7 complete days of the first four counters; a setting hides it.
The widget shows the names you gave in Gladys.

## Scene triggers

| Trigger             | Fires when                                                                         |
| ------------------- | ---------------------------------------------------------------------------------- |
| Daily record beaten | a new complete day beats the best day of the counter (history kept by the city)    |
| Counter data late   | the data is 12 h, 1 day, 3 days or 1 week late, beyond the usual delay of the city |

Both can be limited to some counters. Variables: counter, city, passages and day, previous record
and its day; the data age for a late counter. A day flagged as doubtful by Nantes is never a record.

## Scene action

**Get the figures of a bike counter**: passages of the last complete day and its date, of the last
7 days, the trend in % against the week before (0 when unknown), the hours late, and a sentence
such as "Pont Wilson: 1,934 bikes on 27 Oct, 11,915 over 7 days.". "Complete day known" is 0 while
the counter has no complete day yet.

## Scene examples

- Every morning at 9: get the figures of your counter, then send the sentence by Telegram.
- Daily record beaten: send a message with the counter and its passages (scene variables).
- Counter data late by 3 days: send a message, the counter is probably broken.

## Data and refresh

| City             | Portal                                    | Step | Published                                            |
| ---------------- | ----------------------------------------- | ---- | ---------------------------------------------------- |
| Paris            | opendata.paris.fr (Opendatasoft)          | hour | every morning, up to the day before                  |
| Nantes Métropole | data.nantesmetropole.fr (Opendatasoft)    | day  | every morning, two days late                         |
| Tours Métropole  | data.tours-metropole.fr (Opendatasoft)    | day  | late morning, with the day so far                    |
| Saint-Nazaire    | data.saintnazaireagglo.fr (Opendatasoft)  | hour | every morning, up to that morning                    |
| Hauts-de-Seine   | opendata.hauts-de-seine.fr (Opendatasoft) | day  | every night; a day counts once the next one is there |

So the "Last complete day" is usually yesterday (Paris, Tours, Saint-Nazaire), the day before
yesterday (Hauts-de-Seine) or three days ago (Nantes). One aggregated request per city and per
reading (one more for the last hour in Paris and Saint-Nazaire), and once per counter added the
best day of its history, then kept in `/data`. At one reading an hour this is a few dozen requests
a day, far below the quotas of the portals for anonymous use.

## Troubleshooting

- **No counter in Discover**: check that a city is ticked and saved, then run the **Status**
  action. An "HTTP 503" or "timeout" error comes from the portal of the city: try again later.
- **The values do not change today**: normal, the cities publish once a day.
- **A grey row in the widget**: the data of this counter is late (broken counter or city late).
- For more details, set `LOG_LEVEL=debug`: every reading is then logged.

## Limitations

- **Toulouse** stopped updating its Eco-Counter dataset in June 2025; **Rennes** in July 2026;
  **Montpellier** was down during the tests; **Lille**, **Angers** and **Brest** publish yearly or
  campaign figures only; **Anglet** changes its dataset every year. They can be added once a daily
  feed exists.
- Figures as published by the cities (raw Eco-Counter counts, sometimes corrected later).
- Read only.

## Credits

- Data: Ville de Paris, Nantes Métropole, Syndicat des Mobilités de Touraine, Saint-Nazaire agglo
  – La CARENE and Département des Hauts-de-Seine, under their open licences (ODbL / Licence
  Ouverte).
- Built from the official Gladys integration template.
