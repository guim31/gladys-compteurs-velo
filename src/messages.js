// -----------------------------------------------------------------------------
// Texts sent from the container (feature names, action messages, widget
// contents, scene outputs), in the four languages of the Gladys interface.
// Entries are strings or functions of one parameter object. German says "du",
// Spanish "usted". Brand and place names never translate.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const PORTALS_DOWN = {
  en: 'No open data portal answers, check the integration logs.',
  fr: "Aucun portail open data ne répond, consultez les logs de l'intégration.",
  de: 'Kein Open-Data-Portal antwortet, sieh dir die Protokolle der Integration an.',
  es: 'Ningún portal de datos abiertos responde, consulte los registros de la integración.',
};

// Feature names, frozen when the device is created (configured language).
export const NAMES = {
  en: {
    last_hour: 'Last hour available',
    today: 'Today so far',
    last_day: 'Last complete day',
    week: 'Last 7 days',
    age: 'Data age',
  },
  fr: {
    last_hour: 'Dernière heure disponible',
    today: "Aujourd'hui jusqu'ici",
    last_day: 'Dernière journée complète',
    week: '7 derniers jours',
    age: 'Âge de la donnée',
  },
  de: {
    last_hour: 'Letzte verfügbare Stunde',
    today: 'Heute bisher',
    last_day: 'Letzter vollständiger Tag',
    week: 'Letzte 7 Tage',
    age: 'Alter der Daten',
  },
  es: {
    last_hour: 'Última hora disponible',
    today: 'Hoy hasta ahora',
    last_day: 'Último día completo',
    week: 'Últimos 7 días',
    age: 'Antigüedad del dato',
  },
};

export const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** 1934 → "1 934" (fr), "1,934" (en)… */
export const formatCount = (count, language) =>
  new Intl.NumberFormat(LOCALES[language] ?? LOCALES.en).format(count);

/** "2026-10-26" → "26 oct." (fr), "26 Oct" (en)… */
export const formatDay = (day, language) =>
  new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));

/** Ends a sentence once: "le 27 oct." already has its full stop. */
const stop = (text) => (text.endsWith('.') ? text : `${text}.`);

const plural = (count, one, many) => (count === 1 ? one : many);
const pluralFr = (count, one, many) => (count > 1 ? many : one);

// Widget contents and scene outputs. `when` is "yesterday" or a day already
// formatted ("26 oct."); counts arrive formatted too.
export const TEXT = {
  en: {
    yesterday: 'yesterday',
    on: ({ day }) => `on ${day}`,
    late: 'data late',
    noDay: 'no complete day yet',
    chartTitle: 'Passages per day',
    unit: 'bikes',
    sentence: ({ name, count, raw, when, week }) =>
      `${name}: ${count} ${plural(raw, 'bike', 'bikes')} ${when}, ${week} over 7 days.`,
    sentenceDay: ({ name, count, raw, when }) =>
      `${name}: ${count} ${plural(raw, 'bike', 'bikes')} ${stop(when)}`,
    noSentence: ({ name }) => `${name}: no complete day delivered yet.`,
    pickCounter: 'Add a counter in the Discover tab of the integration, then pick it here.',
    gone: 'This counter is no longer watched.',
    noCounter: 'No counter is watched: add one in the Discover tab of the integration.',
  },
  fr: {
    yesterday: 'hier',
    on: ({ day }) => `le ${day}`,
    late: 'données en retard',
    noDay: 'pas encore de journée complète',
    chartTitle: 'Passages par jour',
    unit: 'vélos',
    sentence: ({ name, count, raw, when, week }) =>
      `${name} : ${count} ${pluralFr(raw, 'passage', 'passages')} à vélo ${when}, ${week} sur 7 jours.`,
    sentenceDay: ({ name, count, raw, when }) =>
      `${name} : ${count} ${pluralFr(raw, 'passage', 'passages')} à vélo ${stop(when)}`,
    noSentence: ({ name }) => `${name} : pas encore de journée complète livrée.`,
    pickCounter:
      "Ajoutez un compteur dans l'onglet Découverte de l'intégration, puis choisissez-le ici.",
    gone: "Ce compteur n'est plus suivi.",
    noCounter:
      "Aucun compteur n'est suivi : ajoutez-en un dans l'onglet Découverte de l'intégration.",
  },
  de: {
    yesterday: 'gestern',
    on: ({ day }) => `am ${day}`,
    late: 'Daten verspätet',
    noDay: 'noch kein vollständiger Tag',
    chartTitle: 'Durchfahrten pro Tag',
    unit: 'Räder',
    sentence: ({ name, count, raw, when, week }) =>
      `${name}: ${count} ${plural(raw, 'Fahrrad', 'Fahrräder')} ${when}, ${week} in 7 Tagen.`,
    sentenceDay: ({ name, count, raw, when }) =>
      `${name}: ${count} ${plural(raw, 'Fahrrad', 'Fahrräder')} ${stop(when)}`,
    noSentence: ({ name }) => `${name}: noch kein vollständiger Tag geliefert.`,
    pickCounter: 'Füge einen Zähler im Tab „Entdecken“ der Integration hinzu und wähle ihn hier.',
    gone: 'Dieser Zähler wird nicht mehr überwacht.',
    noCounter: 'Kein Zähler wird überwacht: füge einen im Tab „Entdecken“ der Integration hinzu.',
  },
  es: {
    yesterday: 'ayer',
    on: ({ day }) => `el ${day}`,
    late: 'datos con retraso',
    noDay: 'aún no hay un día completo',
    chartTitle: 'Pasos por día',
    unit: 'bicis',
    sentence: ({ name, count, raw, when, week }) =>
      `${name}: ${count} ${plural(raw, 'bici', 'bicis')} ${when}, ${week} en 7 días.`,
    sentenceDay: ({ name, count, raw, when }) =>
      `${name}: ${count} ${plural(raw, 'bici', 'bicis')} ${stop(when)}`,
    noSentence: ({ name }) => `${name}: aún no se ha entregado un día completo.`,
    pickCounter:
      'Añada un contador en la pestaña Descubrir de la integración y luego elíjalo aquí.',
    gone: 'Este contador ya no está vigilado.',
    noCounter: 'No se vigila ningún contador: añada uno en la pestaña Descubrir de la integración.',
  },
};

// Answer of the "Status" configuration action.
export const REPORTS = {
  en: {
    noCity: 'No city chosen: tick one or more cities above, then save.',
    city: ({ name, count }) => `■ ${name}: ${count} counter${count === 1 ? '' : 's'} with data`,
    read: ({ age, day }) => `Last reading ${age} min ago, last complete day: ${day}.`,
    waiting: 'Not read yet.',
    error: ({ error }) => `Last error: ${error}`,
    watched: ({ count }) => `${count} counter${count === 1 ? '' : 's'} added to Gladys.`,
  },
  fr: {
    noCity: 'Aucune ville choisie : cochez une ou plusieurs villes ci-dessus, puis enregistrez.',
    city: ({ name, count }) => `■ ${name} : ${count} compteur${count > 1 ? 's' : ''} avec données`,
    read: ({ age, day }) =>
      `Dernière lecture il y a ${age} min, dernière journée complète : ${day}.`,
    waiting: 'Pas encore lu.',
    error: ({ error }) => `Dernière erreur : ${error}`,
    watched: ({ count }) =>
      `${count} compteur${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} à Gladys.`,
  },
  de: {
    noCity: 'Keine Stadt gewählt: kreuze oben eine oder mehrere Städte an und speichere.',
    city: ({ name, count }) => `■ ${name}: ${count} Zähler mit Daten`,
    read: ({ age, day }) => `Letzte Abfrage vor ${age} min, letzter vollständiger Tag: ${day}.`,
    waiting: 'Noch nicht abgefragt.',
    error: ({ error }) => `Letzter Fehler: ${error}`,
    watched: ({ count }) => `${count} Zähler zu Gladys hinzugefügt.`,
  },
  es: {
    noCity: 'Ninguna ciudad elegida: marque una o varias ciudades arriba y guarde.',
    city: ({ name, count }) => `■ ${name}: ${count} contador${count === 1 ? '' : 'es'} con datos`,
    read: ({ age, day }) => `Última lectura hace ${age} min, último día completo: ${day}.`,
    waiting: 'Aún no leído.',
    error: ({ error }) => `Último error: ${error}`,
    watched: ({ count }) =>
      `${count} contador${count === 1 ? '' : 'es'} añadido${count === 1 ? '' : 's'} a Gladys.`,
  },
};

/** One text of a table, in a language (English when missing). */
export function say(table, language, key, params = {}) {
  const entry = table[language]?.[key] ?? table.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

/** The same text in every language of the table: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    Object.keys(table).map((language) => [language, say(table, language, key, params)]),
  );
}

/** Joins rendered messages (or plain strings), language by language, one per line. */
export function lines(...messages) {
  const languages = Object.keys(messages.find((m) => typeof m === 'object' && m) ?? { en: '' });
  return Object.fromEntries(
    languages.map((language) => [
      language,
      messages
        .filter((message) => message !== null && message !== undefined)
        .map((message) => (typeof message === 'string' ? message : message[language]))
        .join('\n'),
    ]),
  );
}
