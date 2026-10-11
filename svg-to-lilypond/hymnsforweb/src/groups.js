// The hymnals, in the order the app lists them. Colours are the app's day (#500) and night (#200) colours.
export const GROUPS = [
  {code: 'E', name: 'English', day: '#3D577A', night: '#B0BEC5'},
  {code: 'NS', name: 'New Songs', day: '#CC0000', night: '#EF9A9A'},
  {code: 'BF', name: 'Be Filled', day: '#0099CC', night: '#90CAF9'},
  {code: 'CH', name: 'Children', day: '#8D9124', night: '#E6EE9C'},
  {code: 'C', name: '中文 (繁)', long: 'Chinese (Traditional)', day: '#669900', night: '#A5D6A7', cjk: true},
  {code: 'CS', name: '補充本 (繁)', long: 'Chinese Supplement (Traditional)', day: '#9933CC', night: '#CE93D8', cjk: true},
  {code: 'Z', name: '中文 (简)', long: 'Chinese (Simplified)', day: '#669900', night: '#A5D6A7', cjk: true},
  {code: 'ZS', name: '补充本 (简)', long: 'Chinese Supplement (Simplified)', day: '#9933CC', night: '#CE93D8', cjk: true},
  {code: 'CB', name: 'Cebuano', day: '#E67A00', night: '#FFCC80'},
  {code: 'T', name: 'Tagalog', day: '#00897B', night: '#80CBC4'},
  {code: 'FR', name: 'Français', long: 'French', day: '#E91E63', night: '#F48FB1'},
  {code: 'S', name: 'Español', long: 'Spanish', day: '#3F51B5', night: '#9FA8DA'},
  {code: 'SY', name: 'Español (jóvenes)', long: 'Spanish Youth', day: '#3F51B5', night: '#9FA8DA'},
  {code: 'G', name: 'Deutsch', long: 'German', day: '#F4511E', night: '#FFAB91'},
  {code: 'GY', name: 'Deutsch (Jugend)', long: 'German Youth', day: '#F4511E', night: '#FFAB91'},
  {code: 'K', name: '한국어', long: 'Korean', day: '#795548', night: '#BCAAA4', cjk: true},
  {code: 'J', name: '日本語', long: 'Japanese', day: '#689F38', night: '#AED581', cjk: true},
  {code: 'I', name: 'B. Indonesia', long: 'Indonesian', day: '#F44336', night: '#E57373'},
  {code: 'F', name: 'فارسی', long: 'Farsi', day: '#673AB7', night: '#9575CD', rtl: true},
  {code: 'SK', name: 'Slovenčina', long: 'Slovak', day: '#9C27B0', night: '#BA68C8'},
  {code: 'GK', name: 'Ελληνικά', long: 'Greek', day: '#0288D1', night: '#4FC3F7'},
  {code: 'SW', name: 'Kiswahili', day: '#00838F', night: '#4DD0E1'},
];

export const BY_CODE = Object.fromEntries(GROUPS.map((g, i) => [g.code, Object.assign(g, {order: i})]));

// "E8" -> {group: 'E', no: '8'}; null when the prefix is not a hymnal
export function splitId(id) {
  const m = /^([A-Za-z]{1,2})(\d+)$/.exec(id || '');
  if (!m || !BY_CODE[m[1].toUpperCase()]) return null;
  return {group: m[1].toUpperCase(), no: String(parseInt(m[2], 10))};
}
