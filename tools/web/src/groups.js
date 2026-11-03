// The hymnals, in the order the app lists them. build.py fills this in from HymnGroup.java (code, the app's name,
// day (#500) and night (#200) colours, right-to-left), plus the web names in DISPLAY there.
export const GROUPS = /*GROUPS*/[];

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
