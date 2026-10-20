// The hymnals, in the order the app lists them. build.py fills this in from HymnGroup.java (code, the app's name,
// day (#500) and night (#200) colours, right-to-left), plus the web names in DISPLAY there.
export const GROUPS = /*GROUPS*/[];

export const BY_CODE = Object.fromEntries(GROUPS.map((g, i) => [g.code, Object.assign(g, {order: i})]));

// "E8" -> {group: 'E', no: '8'}; null when the prefix is not a hymnal
export function splitId(id) {
  const m = /^([A-Za-z]{1,2})(\d+)$/.exec(id || '');
  if (!m || !BY_CODE[m[1].toUpperCase()]) return null;
  return {group: m[1].toUpperCase(), no: String(parseInt(m[2], 10))};
}

export function langOf(code) {
  return (BY_CODE[code] && BY_CODE[code].lang) || 'en';
}
