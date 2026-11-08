// The web app's own language (menus, buttons, labels, messages; the hymns themselves are always in their book's
// language), the same five as the Android app: English, Traditional Chinese, Simplified Chinese.
//   tr('Edit chords')                      the text in the app's language, the English itself when there is no translation
//   tr('Bar {0}', 12)                      {0}, {1}... are filled in
//   tn('{0} hymn', '{0} hymns', n)         a count; {0} is the number, written the way the language writes it
//   trh('Tap {0} Share', iconNode)         like tr, with elements for {0}...: gives a list of texts and elements for h()
// The translations are in strings.js, keyed by the English text. The choice (Settings -> Language) is kept on the
// device; "Phone's language" (the default) follows the browser's language list.
import {STRINGS} from './strings.js';

// each language in its own language, so it can be found from any language; '' is "Phone's language"
export const LANGS = [['en', 'English'], ['zh-Hant', '繁體中文'], ['zh-Hans', '简体中文']];

const KEY = 'hfw.lang';

function stored() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return LANGS.some(([code]) => code === v) ? v : '';
  } catch (e) {
    return '';
  }
}

// the first language of the browser's list that the app has; "zh-TW", "zh-HK", "zh-MO" and "zh-Hant" are Traditional,
// the other Chinese Simplified (as the Android app decides)
export function detect(list) {
  for (const tag of list || []) {
    const [language, ...rest] = String(tag).split('-');
    const l = language.toLowerCase();
    if (l === 'en') return l;
    if (l === 'zh') {
      const parts = rest.map((p) => p.toLowerCase());
      if (parts.includes('hant')) return 'zh-Hant';
      if (parts.includes('hans')) return 'zh-Hans';
      return parts.some((p) => ['tw', 'hk', 'mo'].includes(p)) ? 'zh-Hant' : 'zh-Hans';
    }
  }
  return 'en';
}

let choice = stored();
export let lang = choice || detect(typeof navigator === 'undefined' ? [] : navigator.languages || [navigator.language]);

// the language setting: '' for the phone's language
export function getChoice() { return choice; }

export function setChoice(value) {
  choice = LANGS.some(([code]) => code === value) ? value : '';
  try { localStorage.setItem(KEY, JSON.stringify(choice)); } catch (e) { /* private mode */ }
  lang = choice || detect(navigator.languages || [navigator.language]);
  document.documentElement.lang = lang;
}

export const baseLanguage = () => lang.split('-')[0];

function fill(text, args) {
  return text.replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined ? m : String(args[i])));
}

function lookup(english) {
  const table = STRINGS[lang];
  return table && Object.prototype.hasOwnProperty.call(table, english) ? table[english] : english;
}

export function tr(english, ...args) {
  const text = lookup(english);
  return fill(Array.isArray(text) ? text[text.length - 1] : text, args);
}

// a number the way the language writes it (1,362 in English; 1.362 in Spanish; 1 362 in French)
export function num(n) {
  try { return new Intl.NumberFormat(lang).format(n); } catch (e) { return String(n); }
}

// one / other: English takes both forms from the call, the other languages from the translation of the 'other' form
// (a string for a language without plurals, [one, other] where it has them)
export function tn(one, other, n, ...args) {
  let text;
  if (lang === 'en') {
    text = n === 1 ? one : other;
  } else {
    const v = lookup(other);
    text = Array.isArray(v) ? (new Intl.PluralRules(lang).select(n) === 'one' ? v[0] : v[1]) : v;
  }
  return fill(text, [num(n), ...args]);
}

// a text with elements in it: trh('Tap {0} Share, then {1}.', icon, bold) -> ['Tap ', icon, ' Share, then ', bold, '.']
export function trh(english, ...nodes) {
  const out = [];
  lookup(english).split(/(\{\d+\})/).forEach((part) => {
    const m = /^\{(\d+)\}$/.exec(part);
    if (m) out.push(nodes[m[1]]);
    else if (part) out.push(part);
  });
  return out;
}

// The texts in index.html: data-tr (the text), data-tr-label (aria-label), data-tr-title, data-tr-placeholder hold
// their English as written there; this writes them in the app's language (again, after a change of language).
export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  for (const [attr, set] of [['data-tr', (e, v) => { e.textContent = v; }], ['data-tr-label', (e, v) => e.setAttribute('aria-label', v)],
    ['data-tr-title', (e, v) => e.setAttribute('title', v)], ['data-tr-placeholder', (e, v) => e.setAttribute('placeholder', v)]]) {
    for (const e of root.querySelectorAll('[' + attr + ']')) {
      // the English is remembered once: the element's text, or the value of its attribute
      const key = attr + '-en';
      if (!e.hasAttribute(key)) e.setAttribute(key, attr === 'data-tr' ? e.textContent.trim()
        : e.getAttribute(attr === 'data-tr-label' ? 'aria-label' : attr === 'data-tr-title' ? 'title' : 'placeholder'));
      set(e, tr(e.getAttribute(key)));
    }
  }
}
