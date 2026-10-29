// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// - get_counts: the figures of a watched counter, as numbers for a "Continue
//   only if" step and as a sentence ready for a message or a speaker
//   ("Pont Wilson : 1 934 passages à vélo hier, 11 520 sur 7 jours.").
//
// A scene action does not receive the user's language: the sentence follows
// the `language` of the configuration. Outputs are numbers, never booleans:
// the core's "Continue only if" compares with ===.
// -----------------------------------------------------------------------------

import { prettyName } from './devices.js';
import { TEXT, formatCount, say } from './messages.js';
import { whenText } from './widgets.js';

export class SceneError extends Error {}

const firstId = (value) => String((Array.isArray(value) ? value[0] : value) ?? '');

export const SCENE_ACTIONS = {
  async get_counts(service, { fields }) {
    const language = service.config.language;
    // Asked right at start: the first reading, not "no data".
    await service.firstReading();
    const watched = service.watched();
    if (watched.length === 0) {
      throw new SceneError(say(TEXT, language, 'noCounter'));
    }
    const entry = watched.find((w) => w.deviceId === firstId(fields?.counter));
    if (!entry) {
      throw new SceneError(say(TEXT, language, 'gone'));
    }
    const found = service.lookup(entry.deviceId);
    const summary = found?.summary;
    const name = summary ? prettyName(summary.name) : entry.name;
    const city = found?.city?.source?.name ?? '';
    if (!summary?.lastDay) {
      return {
        found: 0,
        sentence: say(TEXT, language, 'noSentence', { name }),
        counter_name: name,
        city,
        last_day: 0,
        last_day_date: '',
        week: 0,
        trend: 0,
        hours_late: 0,
      };
    }
    const { lastDay } = summary;
    return {
      found: 1,
      sentence: say(TEXT, language, 'sentence', {
        name,
        count: formatCount(lastDay.count, language),
        raw: lastDay.count,
        when: whenText(lastDay.day, service.now(), language),
        week: formatCount(summary.week ?? 0, language),
      }),
      counter_name: name,
      city,
      last_day: lastDay.count,
      last_day_date: lastDay.day,
      week: summary.week ?? 0,
      trend: summary.trend ?? 0,
      hours_late: Math.max(0, service.hoursLate(found.city, summary)),
    };
  },
};
