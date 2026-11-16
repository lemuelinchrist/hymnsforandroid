// The piano part ("Both hands"): first the buttons and the panel on a hymn, then the sheets themselves: every sheet,
// in several styles, must come out as whole bars that Verovio reads. Starts serve.py on a spare port and runs in Chromium.
//
//   python3 tools/web/build.py && node tools/web/tests/piano.cjs            every 12th sheet (about half a minute)
//   node tools/web/tests/piano.cjs --all                                    all of them (a few minutes)
//   node tools/web/tests/piano.cjs --only E8,NS151                          these, with what was added
const {spawn, execSync} = require('child_process');
const path = require('path');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* not installed here */ }
  if (process.env.PW) return require(process.env.PW);
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const {chromium} = loadPlaywright();
const PORT = parseInt(process.env.PORT || '8798', 10), BASE = `http://127.0.0.1:${PORT}/`;
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const step = args.includes('--all') || only ? 1 : 12;

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + 'data/version.json')).ok) return; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serve.py did not start');
}

// runs in the page: the sheets of one pack through addPiano and Verovio
async function inPage({file, step, only}) {
  const {addPiano, scoreOf} = await import('./piano.js');
  const {toMidi, parseMidi} = await import('./player.js');
  const {loadVerovio} = await import('./sheet.js');
  const {fetchGzJson} = await import('./files.js');
  const tk = await loadVerovio(), pack = await fetchGzJson(file);
  const NS = 'http://www.music-encoding.org/ns/mei';
  const kids = (e) => Array.prototype.filter.call(e.childNodes, (n) => n.nodeType === 1);
  const CHOICES = [
    ['hymn', {lh: {family: 'strike', kind: 'hymn', rhythm: 'held'}, rh: {add: 0}}],
    ['arpeggio', {lh: {family: 'arp', kind: 'open', rhythm: '8'}, rh: {add: 1, on: 'beat'}}],
    ['bass', {lh: {family: 'bass', kind: 'alt', rhythm: ''}, rh: {add: 2, on: 'all'}}],
    ['wide', {lh: {family: 'arp', kind: 'wide', rhythm: '16', pedal: true, oct: 1}, rh: {add: 1, on: 'chord'}}],
    ['right only', {lh: null, rh: {add: 2, on: 'long'}}],
  ];
  // a layer's length in sixteenths, and the pitches sounding at each time
  function layerOf(staff, nominal) {
    let at = 0; const notes = [];
    const walk = (e, f) => kids(e).forEach((c) => {
      const n = c.localName;
      if (n === 'note' || n === 'rest' || n === 'chord' || n === 'space') {
        const d = 16 / parseInt(c.getAttribute('dur') || '4', 10) * (2 - Math.pow(0.5, parseInt(c.getAttribute('dots') || '0', 10))) * f;
        if (n !== 'rest' && n !== 'space') notes.push([at, at + d, c]);
        at += d;
      } else if (n === 'mRest') at += nominal;
      else if (n === 'tuplet') walk(c, f * parseInt(c.getAttribute('numbase') || '2', 10) / parseInt(c.getAttribute('num') || '3', 10));
      else if (n === 'beam' || n === 'layer') walk(c, f);
    });
    walk(staff, 1);
    return {len: at, notes};
  }
  const out = {sheets: 0, runs: 0, problems: [], left: 0, right: 0, noLeft: [], shown: {}, midi: 0, repeats: 0};
  const ids = Object.keys(pack).sort();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (only ? !only.includes(id) : i % step) continue;
    out.sheets++;
    let xml = pack[id].replace(/<back>[\s\S]*<\/back>/, '');
    const variants = [['', xml]];
    if (only || i % (step * 6) === 0) {   // also as Verovio writes a transposed sheet
      tk.setOptions({transpose: '+1'}); tk.loadData(xml); variants.push([' +1', tk.getMEI()]); tk.setOptions({transpose: ''});
    }
    for (const [vname, text] of variants) for (const [name, choice] of CHOICES) {
      const where = id + vname + ' ' + name;
      try {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        const hasChords = doc.getElementsByTagNameNS(NS, 'harm').length > 0, kind = /type="kind">chords</.test(text);
        if (kind) continue;
        const added = addPiano(doc, choice);
        out.runs++; out.left += added.left; out.right += added.right;
        // bars with repeats and endings: the order they are played in
        if (id === 'BF465' && name === 'hymn' && !vname) {
          const sc0 = scoreOf(new DOMParser().parseFromString(text, 'application/xml'), choice, {hands: false});
          if (sc0.order.length !== 46) out.problems.push(where + ': the repeat should play 46 bars, not ' + sc0.order.length + ' of ' + sc0.bars);
        }
        if (choice.lh && hasChords && !added.left) out.noLeft.push(where);
        if (only) out.shown[where] = added;
        let unit = 4, count = 4;
        const sd = doc.getElementsByTagNameNS(NS, 'scoreDef')[0];
        if (sd) { unit = parseInt(sd.getAttribute('meter.unit') || '4', 10); count = parseInt(sd.getAttribute('meter.count') || '4', 10); }
        Array.from(doc.getElementsByTagNameNS(NS, 'measure')).forEach((m, mi) => {
          const staffs = kids(m).filter((c) => c.localName === 'staff');
          if (choice.lh && added.left && staffs.length !== 2) { out.problems.push(where + ': bar ' + (mi + 1) + ' has ' + staffs.length + ' staves'); return; }
          if (staffs.length < 2) return;
          const one = layerOf(staffs[0], count * 16 / unit), two = layerOf(staffs[1], one.len);
          if (Math.abs(one.len - two.len) > 0.01) out.problems.push(where + ': bar ' + (mi + 1) + ' is ' + one.len + ' above, ' + two.len + ' below');
        });
        if (!tk.loadData(new XMLSerializer().serializeToString(doc))) out.problems.push(where + ': Verovio does not read it');
        // what plays: finite and in order, every element it lights up is in the sheet that is drawn, and it is a MIDI file
        const hands = !!choice.lh || choice.rh.add > 0, sc = scoreOf(new DOMParser().parseFromString(text, 'application/xml'), choice, {hands});
        const have = new Set(Array.from(doc.getElementsByTagNameNS(NS, '*')).map((e) => e.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'id')));
        if (!sc || !sc.events.length) out.problems.push(where + ': nothing to play');
        else {
          const badEv = sc.events.find((e, k) => !(e.q >= 0 && e.d > 0 && e.note > 20 && e.note < 110 && e.q + e.d <= sc.length + 4) || (k && e.q < sc.events[k - 1].q));
          if (badEv) out.problems.push(where + ': a note at ' + badEv.q + ' (' + badEv.note + ', ' + badEv.d + ') of ' + sc.length);
          const lost = Object.keys(sc.idQ).filter((id) => !have.has(id));
          if (lost.length) out.problems.push(where + ': ' + lost.length + ' elements to light up are not in the sheet, e.g. ' + lost[0]);
          if (hands && choice.lh && !sc.events.some((e) => e.hand === 'l') && added.left) out.problems.push(where + ': no left hand in the notes to play');
          if (sc.order.length < sc.bars) out.problems.push(where + ': ' + sc.order.length + ' bars played of ' + sc.bars);
          if (i % 7 === 0 && name === 'arpeggio') {
            const midi = parseMidi(toMidi(sc, 90, id).buffer);
            if (midi.notes.length !== sc.events.length) out.problems.push(where + ': MIDI has ' + midi.notes.length + ' notes of ' + sc.events.length);
            out.midi = (out.midi || 0) + 1;
          }
          out.repeats = (out.repeats || 0) + (sc.order.length > sc.bars ? 1 : 0);
        }
      } catch (e) {
        out.problems.push(where + ': ' + e.message);
      }
    }
  }
  return out;
}

// the buttons and the panel, on E8
async function ui(page) {
  let failed = 0;
  const test = async (name, fn) => {
    try { await fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + String(e.message || e).split('\n')[0]); }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  // wait until the sheet has stopped being redrawn
  const settle = async () => {
    let last = -1;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(200);
      const now = await page.evaluate(() => (document.querySelector('.sheet-music') || {innerHTML: ''}).innerHTML.length);
      if (now === last && now > 0) return;
      last = now;
    }
  };
  const staves = () => page.locator('.sheet-music g.measure').nth(1).locator('g.staff').count();
  // what the left hand drew: its own ids (lh<bar>n<event>…, lh<bar>r), not the ids Verovio makes up, which may start alike
  const left = () => page.evaluate(() => Array.from(document.querySelectorAll('.sheet-music [id^="lh"]')).filter((e) => /^lh\d+(n\d+(_\d+)?(k\d+)?|r)$/.test(e.id)).length);
  const openSheet = async (id) => { await page.goto(BASE + '#/sheet/' + id); await page.waitForSelector('.sheet-music svg'); await page.waitForFunction((x) => document.title.startsWith(x + ' ·'), id); await settle(); };
  const pick = async (row, text) => { await page.locator('.piano-panel .ce-row', row ? {hasText: row} : {}).locator(`button:text-is("${text}")`).first().click(); await settle(); };
  console.log('Both hands');
  await openSheet('E8');
  await test('the sheet has one staff, and Both hands adds the left hand under it', async () => {
    assert(await staves() === 1, 'one staff to begin with');
    assert(await page.locator('.tb.style').isHidden(), 'no Style button yet');
    await page.click('.tb.hands'); await settle();
    assert(await staves() === 2, 'two staves, got ' + await staves());
    assert(await left() > 10, 'left hand notes');
    assert(await page.locator('.tb.style').isVisible(), 'the Style button');
  });
  let hymnStyle = 0;
  await test('Style changes how the left hand plays, and the right hand gets notes', async () => {
    hymnStyle = await left();
    await page.click('.tb.style');
    await pick('Left hand', 'Arpeggio');
    assert(await left() > hymnStyle, 'an arpeggio has more notes than held chords: ' + await left() + ' / ' + hymnStyle);
    assert(await page.locator('.sheet-music g.note.fill').count() === 0, 'the melody alone');
    await pick('Right hand', 'Two notes');
    assert(await page.locator('.sheet-music g.note.fill').count() > 10, 'notes added under the melody');
    await pick('Right hand', 'Melody alone');
    await pick('Left hand', 'No left hand');
    assert(await staves() === 1, 'no left hand, no second staff');
    await pick('Left hand', 'Strike');
    await pick('', 'Hymn');
    assert(await left() === hymnStyle, 'the hymn style again');
  });
  await test('the choice is the device\'s for every hymn, or this hymn\'s alone', async () => {
    await pick('Left hand', 'Arpeggio');
    await page.click('.piano-panel button:text-is("Only this hymn")'); await settle();
    const here = await left();
    await page.click('.piano-panel button:text-is("Done")');
    assert(await page.locator('.piano-panel').isHidden(), 'the panel closes');
    await openSheet('E10');
    assert(await staves() === 2, 'both hands stay on for the next hymn');
    await openSheet('E8');
    assert(await left() === here, 'E8 keeps its own arpeggio: ' + await left() + ' / ' + here);
    await page.click('.tb.style');
    await page.click('.piano-panel button:text-is("Only this hymn")'); await settle();   // back to the device's
    await pick('Left hand', 'Strike'); await pick('', 'Hymn');
    await page.click('.piano-panel button:text-is("Done")');
  });
  await test('it follows the key, and is not there on the guitar sheet or with the staff hidden', async () => {
    await page.keyboard.press('+'); await settle();
    assert(await staves() === 2 && await left() === hymnStyle, 'transposed: still two staves');
    await page.keyboard.press('0'); await settle();
    await page.keyboard.press('g'); await settle();
    assert(await page.locator('.tb.hands').isHidden(), 'no Both hands on the guitar sheet');
    await page.keyboard.press('p'); await settle();
    assert(await staves() === 2, 'back on the piano sheet');
    await page.keyboard.press('h'); await settle();
    assert(await page.locator('.tb.hands').isHidden() && await page.locator('.sheet-music .chart').count() === 1, 'chords over the words: no hands');
    await page.keyboard.press('h'); await settle();
  });
  await test('an edited chord moves the left hand; 1 to 7 put the chords of the key', async () => {
    const before = await page.locator('.sheet-music').innerHTML();
    await page.click('.tb.edit'); await settle();
    await page.locator('.sheet-music g.measure').nth(1).locator('g.staff').first().click({position: {x: 5, y: 5}, force: true}); await settle();
    const keys = await page.locator('.ce-key .ce-btn').allTextContents();
    assert(keys.join(' ') === '1G 2Am 3Bm 4C 5D 6Em 7D7', 'the chords of G major: ' + keys.join(' '));
    assert(await page.locator('.ce-key .ce-btn.fit').count() > 0, 'a chord that holds the melody is marked');
    await page.keyboard.press('2'); await settle();
    assert((await page.locator('.ce-beat.on .bc').textContent()) === 'Am', 'the chosen beat has Am');
    assert(await staves() === 2, 'both hands while editing');
    assert(await page.locator('.sheet-music').innerHTML() !== before, 'the sheet changed');
    await page.click('.chord-editor button:text-is("Undo")'); await settle();
    await page.click('.chord-editor:not(.piano-panel) button:text-is("Done")'); await settle();
    await page.keyboard.press('b'); await settle();
    assert(await staves() === 1, 'B takes the piano part away');
  });
  console.log('Play sheet');
  await openSheet('E8');
  await test('Play sheet opens the player, plays and lights up the notes; Stop stops', async () => {
    assert(await page.locator('.sheet-player').isHidden(), 'the player is not open yet');
    await page.click('.tb.playsheet'); await page.waitForTimeout(1500);
    assert(await page.locator('.sheet-player').isVisible(), 'the player row');
    assert((await page.locator('.sheet-player .tb.primary').textContent()).includes('Stop'), 'it plays: the button says Stop');
    const lit = await page.locator('.sheet-music g.playing').count();
    assert(lit > 0, 'notes are lit while they sound: ' + lit);
    assert(/Bar \d+ · ♩ = \d+/.test(await page.locator('.sp-where').textContent()), 'the place and the tempo');
    assert(await page.evaluate(() => document.body.classList.contains('sheet-playing')), 'the bars stay while it plays');
    await page.click('.sheet-player .tb.primary'); await page.waitForTimeout(500);
    assert((await page.locator('.sheet-player .tb.primary').textContent()).includes('Play'), 'stopped: the button says Play');
    assert(await page.locator('.sheet-music g.playing').count() === 0, 'nothing lit after Stop');
  });
  await test('with Both hands on it plays the piano part too', async () => {
    await page.click('.sheet-player .tb.icon:text-is("✕")'); await settle();
    assert(await page.locator('.tb.hands').getAttribute('aria-pressed') === 'false', 'Both hands is off here');
    await page.click('.tb.hands'); await settle();
    await page.click('.tb.playsheet'); await page.waitForTimeout(1300);
    assert((await page.locator('.sheet-player .tb.primary').textContent()).includes('Stop'), 'it plays');
    assert(await page.locator('[id^="lh"].playing').count() > 0, 'the left hand lights up too');
    await page.click('.sheet-player .tb.primary'); await settle();
  });
  await test('tapping a note plays from there; the speed and the parts can be changed while it plays', async () => {
    await page.locator('.sheet-music g.measure').nth(6).locator('g.note .notehead').first().click({force: true}); await page.waitForTimeout(1200);
    const bar = parseInt(/Bar (\d+)/.exec(await page.locator('.sp-where').textContent())[1], 10);
    assert(bar >= 7, 'it plays from the tapped bar, not the start: bar ' + bar);
    await page.selectOption('.sp-speed', '0.5'); await settle();
    assert(/♩ = \d+/.test(await page.locator('.sp-where').textContent()), 'still playing at half speed');
    assert((await page.locator('.sheet-player .tb.primary').textContent()).includes('Stop'), 'it goes on after a change of speed');
    await page.click('.sheet-player .tb:text-is("Melody")'); await settle();
    await page.click('.sheet-player .tb:text-is("Melody")'); await page.selectOption('.sp-speed', '1'); await settle();
    assert((await page.locator('.sheet-player .tb.primary').textContent()).includes('Stop'), 'still playing');
  });
  await test('tapping the empty space of a bar plays from that bar', async () => {
    await page.click('.sheet-player .tb.primary'); await settle();   // stop
    const r = await page.locator('.sheet-music g.measure').nth(3).boundingBox();
    await page.mouse.click(r.x + r.width / 2, r.y + 2); await page.waitForTimeout(900);
    const bar = parseInt(/Bar (\d+)/.exec(await page.locator('.sp-where').textContent())[1], 10);
    assert(bar >= 4 && bar <= 5, 'it plays from the bar tapped (the fourth), not the start: bar ' + bar);
    await page.selectOption('.sp-speed', '1');
  });
  await test('a change to the sheet goes on playing with the new notes: the key, and the style', async () => {
    const before = await page.locator('.sp-where').textContent();
    await page.keyboard.press('+'); await settle();
    assert((await page.locator('.sheet-player .tb.primary').textContent()).includes('Stop'), 'transposed, still playing');
    assert(await page.locator('.sheet-music g.playing').count() >= 0, 'lights up in the new key');
    await page.keyboard.press('0'); await settle();
    await page.click('.tb.style'); await settle();
    await pick('Left hand', 'Arpeggio');
    assert((await page.locator('.sheet-player .tb.primary').textContent()).includes('Stop'), 'a new style, still playing');
    await page.click('.piano-panel button:text-is("Done")'); await settle();
  });
  await test('the sheet sounds: rendered without a speaker it has body and does not clip', async () => {
    const level = await page.evaluate(async () => {
      const {scoreOf} = await import('./piano.js'), {renderScoreForTest} = await import('./player.js'), {fetchGzJson} = await import('./files.js');
      const v = await (await fetch('data/version.json')).json(), pack = await fetchGzJson(v.sheets.E);
      const xml = pack.E8.replace(/<back>[\s\S]*<\/back>/, ''), out = {};
      for (const [name, hands, choice] of [['lead', false, null], ['piano', true, {lh: {family: 'arp', kind: 'open', rhythm: '8'}, rh: {add: 2, on: 'beat'}}]]) {
        const sc = scoreOf(new DOMParser().parseFromString(xml, 'application/xml'), choice, {hands});
        out[name] = await renderScoreForTest(sc, 100, 8);
      }
      return out;
    });
    assert(level.lead.rms > 0.002 && level.lead.peak < 1, 'the lead sheet: ' + JSON.stringify(level.lead));
    assert(level.piano.rms > level.lead.rms && level.piano.peak < 1, 'the piano part is fuller and does not clip: ' + JSON.stringify(level));
  });
  await test('the tune\'s Play button and the sheet stop each other; closing the player stops it', async () => {
    await page.goto(BASE + '#/h/E8'); await page.waitForSelector('.hymn'); await settle();
    await page.click('.hymn-nav .icon-btn.play'); await page.waitForTimeout(600);
    assert(await page.locator('.hymn-nav .icon-btn.play').getAttribute('aria-pressed') === 'true', 'the tune plays');
    await page.click('.tb.playsheet'); await page.waitForTimeout(1200);
    assert(await page.locator('.hymn-nav .icon-btn.play').getAttribute('aria-pressed') === 'false', 'the sheet took over: the tune button is off');
    await page.click('.hymn-nav .icon-btn.play'); await page.waitForTimeout(600);
    assert((await page.locator('.sheet-player .tb.primary').textContent()).includes('Play'), 'the tune took over: the sheet stopped');
    await page.click('.hymn-nav .icon-btn.play'); await page.waitForTimeout(300);
    await page.click('.sheet-player .tb.icon:text-is("✕")'); await settle();
    assert(await page.locator('.sheet-player').isHidden(), 'closed');
  });
  return failed;
}

(async () => {
  const server = spawn('python3', [path.join(__dirname, '..', 'serve.py'), '--port', String(PORT), '--bind', '127.0.0.1'], {stdio: 'ignore'});
  const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME} : {});
  let bad = 0;
  try {
    await waitForServer();
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', (e) => { bad++; console.log('  page error: ' + e.message); });
    await page.goto(BASE);
    await page.waitForSelector('body.ready', {timeout: 120000});
    if (!only) bad += await ui(page);
    const version = await (await fetch(BASE + 'data/version.json')).json();
    const total = {sheets: 0, runs: 0, left: 0, right: 0, midi: 0, repeats: 0};
    for (const [group, file] of Object.entries(version.sheets)) {
      if (only && !only.some((id) => id.replace(/\d+$/, '') === group)) continue;
      const t = Date.now(), r = await page.evaluate(inPage, {file, step, only});
      for (const k of Object.keys(total)) total[k] += r[k];
      bad += r.problems.length;
      console.log(`  ${r.problems.length ? '✗' : '✓'} ${group}: ${r.sheets} sheets, ${r.runs} piano parts (${Date.now() - t} ms)` +
        (r.noLeft.length ? `; no left hand: ${r.noLeft.slice(0, 5).join(', ')}${r.noLeft.length > 5 ? ' … ' + r.noLeft.length : ''}` : ''));
      r.problems.slice(0, 12).forEach((p) => console.log('      ' + p));
      if (r.problems.length > 12) console.log('      … ' + r.problems.length + ' in all');
      if (only) console.log(JSON.stringify(r.shown, null, 1));
    }
    console.log(`${total.sheets} sheets, ${total.runs} piano parts, ${total.left} notes in the left hand, ${total.right} added to the right; ` +
      `${total.repeats} that play with repeats, ${total.midi} saved as MIDI and read back: ` +
      (bad ? bad + ' PROBLEMS' : 'all whole bars that Verovio reads'));
  } finally {
    await browser.close();
    server.kill();
  }
  process.exit(bad ? 1 : 0);
})();
