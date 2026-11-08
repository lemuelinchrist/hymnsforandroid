// The hymnals, in the order the app lists them. build.py fills this in from HymnGroup.java (code, the app's name,
// day (#500) and night (#200) colours, right-to-left), plus the web names in DISPLAY there.
import {lang, baseLanguage} from './i18n.js';

export const GROUPS = /*GROUPS*/[];

// What the Android app calls the books and languages in each of its languages (res/values-*/strings.xml, read by build.py):
// {'zh-Hant': {book: {c: '中文（繁體）'}, language: {c: '中文'}, first: 'C'}}. English is HymnGroup.java's own name.
const NAMES = /*NAMES*/{};

export const BY_CODE = Object.fromEntries(GROUPS.map((g, i) => [g.code, Object.assign(g, {order: i})]));

// The codes three hymnals had before 2026-11 (Burmese MY, Russian R, French Youth FY), so that an old link, a saved
// favorite or what someone types still finds its hymn: MY637 is BUR637.
export const OLD_CODES = {MY: 'BUR', R: 'RUS', FY: 'FRY'};

// a hymnal's code (any case, or an old code) as its current code; null when there is no such hymnal
export function currentCode(code) {
  const c = String(code || '').toUpperCase();
  return OLD_CODES[c] || (BY_CODE[c] ? c : null);
}

// a hymn ID with its hymnal's current code ("MY637" -> "BUR637"); unchanged when the hymnal is unknown
export function currentId(id) {
  const m = /^([A-Za-z]{1,3})(\d.*)$/.exec(id || '');
  const code = m && currentCode(m[1]);
  return code ? code + m[2] : id;
}

// "E8" -> {group: 'E', no: '8'}; null when the prefix is not a hymnal
export function splitId(id) {
  const m = /^([A-Za-z]{1,3})(\d+)$/.exec(id || '');
  const group = m && currentCode(m[1]);
  if (!group) return null;
  return {group, no: String(parseInt(m[2], 10))};
}

export function langOf(code) {
  return (BY_CODE[code] && BY_CODE[code].lang) || 'en';
}

// the code of the main book of a book's language: E for BF, NS and CH, C for the Chinese supplements and Simplified, and so on
const LANGUAGE_BOOK = {BF: 'E', NS: 'E', CH: 'E', CS: 'C', Z: 'C', ZS: 'C', FRY: 'FR', SY: 'S', GY: 'G', POY: 'POR'};
const languageBook = (code) => LANGUAGE_BOOK[code] || code;

// the name of a book in the app's language ("Spanish", 西班牙文); Be Filled and New Songs stay English
export function bookName(code) {
  const g = BY_CODE[code];
  const own = NAMES[lang] && NAMES[lang].book[code.toLowerCase()];
  return own || (g && (g.long || g.name)) || code;
}

// the language of a book in the app's language ("Chinese" for the four Chinese books, "English" for Children)
export function languageName(code) {
  const main = languageBook(code);
  const own = NAMES[lang] && NAMES[lang].language[main.toLowerCase()];
  return own || null;
}

// the line under a book's own name: its name in the app's language, then the count ("Spanish · 910 hymns"); only the
// count when the two names would be the same ("English" in English) or the book is in the app's own language
export function bookSubtitle(code, count) {
  const g = BY_CODE[code];
  const name = bookName(code);
  if (name === g.name || langOf(code).split('-')[0] === baseLanguage()) return count;
  return name + ' \u00b7 ' + count;
}

// the book a new person starts in: the first hymn's book in the app's language (Android's first_hymn string)
export function firstGroup() {
  const code = NAMES[lang] && NAMES[lang].first;
  return code && BY_CODE[code] ? code : 'E';
}
