# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The bike counters published in open data by Paris, Nantes Métropole, Tours
  Métropole, Saint-Nazaire agglo and the Hauts-de-Seine, offered city by city
  in the Discover tab, one device per counter (and per direction when the city
  separates them).
- Passages of the last complete day and of the last 7 days, today so far
  (Tours, Saint-Nazaire), the last hour available (Paris, Saint-Nazaire) and
  the age of the data. A day being delivered is never shown as a finished day.
- A "Bike counters" widget: one row per counter with the trend over a week,
  and a 7-day chart (Gladys 5.3.0 or later).
- Scene triggers "Daily record beaten" and "Counter data late", and a scene
  action giving the figures of a counter with a sentence ready to send.
- A "Status" action: cities read, last complete day, errors.
- Texts and documentation in English, French, German and Spanish.
