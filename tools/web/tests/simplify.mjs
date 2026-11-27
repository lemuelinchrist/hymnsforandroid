// The chord simplifier (src/simplify.js) over the sheets: chords a bar before and after, and how much of the melody they hold.
//   node tools/web/tests/simplify.mjs [E8 E1 ...]        these sheets, shown bar by bar
//   node tools/web/tests/simplify.mjs --rank             the sheets where Medium cuts most, by meter
//   node tools/web/tests/simplify.mjs --stats            all English sheets: the numbers per level
import fs from 'fs';
import {simplifyBars, shapeOf, LEVELS} from '../src/simplify.js';
const DIR = new URL('../../../app/src/main/assets/sheetMei/', import.meta.url).pathname;
const NAT = {c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11};

function read(xml) {
  const sd = /<scoreDef\b[^>]*>/.exec(xml)[0];
  const count = +(/meter\.count="(\d+)"/.exec(sd) || [0, 4])[1], unit = +(/meter\.unit="(\d+)"/.exec(sd) || [0, 4])[1];
  const sig = (/key\.sig="([^"]*)"/.exec(sd) || [0, '0'])[1], m = /^(\d+)([sf])?$/.exec(sig), f = m ? +m[1] * (m[2] === 'f' ? -1 : 1) : 0;
  const sharp = 'fcgdaeb'.slice(0, Math.max(0, f)), flat = 'beadgcf'.slice(0, Math.max(0, -f));
  const bars = [];
  for (const mm of xml.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)) {
    const body = mm[1], events = []; let t = 0;
    for (const e of body.matchAll(/<(note|rest)\b([^>]*?)\/?>/g)) {
      const at = Object.fromEntries([...e[2].matchAll(/([\w.:]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
      const len = unit / +at.dur * (at.dots === '1' ? 1.5 : 1);
      let pc = null;
      if (e[1] === 'note') {
        const l = at.pname, a = at.accid || at['accid.ges'];
        const alt = a ? ({s: 1, f: -1, n: 0, x: 2, ss: 2, ff: -2}[a] || 0) : sharp.includes(l) ? 1 : flat.includes(l) ? -1 : 0;
        pc = ((NAT[l] + alt) % 12 + 12) % 12;
      }
      events.push({onset: 1 + t, len, pc}); t += len;
    }
    const chords = [...body.matchAll(/<harm\b[^>]*tstamp="([^"]*)"[^>]*>([^<]*)<\/harm>/g)].map((h) => [+h[1], h[2]]);
    bars.push({unit, count, len: t, events, chords});
  }
  return bars;
}
const fmt = (cs) => cs.map((c) => c[1]).join(' ') || '·';
const args = process.argv.slice(2);
if (args[0] === '--mei') {   // --mei <level> <id>: the sheet with the chords of that level (to look at it in Verovio)
  const xml = fs.readFileSync(DIR + args[2] + '.mei', 'utf8'), bars = read(xml), res = simplifyBars(bars, args[1]);
  let i = -1;
  process.stdout.write(xml.replace(/<measure\b[^>]*>[\s\S]*?<\/measure>/g, (m) => {
    i++;
    if (!res[i]) return m;
    return m.replace(/\n?<harm\b[^>]*>[^<]*<\/harm>/g, '').replace(/<\/measure>$/, res[i].map(([t, x]) => `\n<harm staff="1" tstamp="${t}" place="above">${x}</harm>`).join('') + '</measure>');
  }));
  process.exit(0);
}
if (args.includes('--stats')) {
  const ids = fs.readdirSync(DIR).filter((f) => /^E\d+\.mei$/.test(f));
  const tot = {orig: 0, light: 0, medium: 0, easy: 0, bars: 0, fit: {orig: 0, light: 0, medium: 0, easy: 0}, notes: 0};
  for (const f of ids) {
    const bars = read(fs.readFileSync(DIR + f, 'utf8'));
    tot.bars += bars.length; tot.orig += bars.reduce((x, b) => x + b.chords.length, 0);
    for (const lv of LEVELS) {
      const res = simplifyBars(bars, lv);
      tot[lv] += res.reduce((x, r, i) => x + (r || bars[i].chords).length, 0);
    }
  }
  console.log('sheets', ids.length, 'bars', tot.bars);
  console.log('chord symbols per bar:', ['orig', ...LEVELS].map((k) => k + ' ' + (tot[k] / tot.bars).toFixed(2)).join('  '));
} else if (args[0] !== '--rank') {
  for (const id of args) {
    const bars = read(fs.readFileSync(DIR + id + '.mei', 'utf8'));
    const res = LEVELS.map((lv) => simplifyBars(bars, lv));
    console.log(id, bars[0].count + '/' + bars[0].unit);
    bars.forEach((b, i) => console.log(String(i + 1).padStart(3), fmt(b.chords).padEnd(34), LEVELS.map((lv, k) => fmt(res[k][i] || b.chords).padEnd(22)).join(' ')));
  }
}
if (args[0] === '--rank') {   // the sheets where Medium cuts most (per bar), by meter
  const rows = [];
  for (const f of fs.readdirSync(DIR).filter((f) => /^E\d+\.mei$/.test(f))) {
    const bars = read(fs.readFileSync(DIR + f, 'utf8')); if (bars.length < 8) continue;
    const res = simplifyBars(bars, 'medium');
    const o = bars.reduce((x, b) => x + b.chords.length, 0), m = res.reduce((x, r, i) => x + (r || bars[i].chords).length, 0);
    rows.push([f.slice(0, -4), bars[0].count + '/' + bars[0].unit, bars.length, (o / bars.length).toFixed(1), (m / bars.length).toFixed(1), o - m]);
  }
  const by = {}; rows.forEach((r) => (by[r[1]] = by[r[1]] || []).push(r));
  for (const k of Object.keys(by).sort((a, b) => by[b].length - by[a].length).slice(0, 4)) {
    console.log(k, by[k].length, 'sheets; most cut:'); by[k].sort((a, b) => b[5] - a[5]).slice(0, 4).forEach((r) => console.log('  ', r.join(' ')));
  }
}
