// Chord editing: starts serve.py with an empty data folder and drives the editor in Chromium.
//   python3 build.py && node tests/edit.cjs
const {spawn, execSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* not installed here */ }
  if (process.env.PW) return require(process.env.PW);
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const {chromium} = loadPlaywright();

const PORT = parseInt(process.env.PORT || '8798', 10);
const BASE = `http://127.0.0.1:${PORT}/`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'hymnsforweb-edit-'));
let passed = 0, failed = 0;
const errors = [];

async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + String(e.message || e).split('\n').join('\n      ')); }
}
function assert(c, m) { if (!c) throw new Error(m); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + 'data/version.json')).ok) return; } catch (e) { /* not yet */ }
    await sleep(200);
  }
  throw new Error('serve.py did not start');
}

async function open(page, hash) {
  await page.goto(BASE + hash);
  await page.waitForSelector('body.ready', {timeout: 60000});
  await page.waitForSelector('.sheet-music svg', {timeout: 60000});
}

async function clickBar(page, n) {
  const box = await (await page.$('.sheet-music #bar-' + n)).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
const chordsOf = (page) => page.$$eval('.sheet-music g.harm', (gs) => gs.map((g) => g.textContent.replace(/[\s\uE000-\uF8FF]/g, '')));

(async () => {
  const server = spawn('python3', [path.join(__dirname, '..', 'serve.py'), '--port', String(PORT), '--bind', '127.0.0.1', '--data', path.join(DATA, 'edits')], {stdio: 'ignore'});
  const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME} : {});
  try {
    await waitForServer();
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/409/.test(m.text())) errors.push(m.text()); });

    await open(page, '#/sheet/E8?v=piano');
    const before = await chordsOf(page);

    await test('Edit chords opens the panel and ids are on bars', async () => {
      await page.click('button.edit');
      await page.waitForSelector('.chord-editor:not([hidden])');
      assert(await page.$('.sheet-music g.measure[id^="bar-"]'), 'no bar ids in the SVG');
      assert(await page.$('.sheet-music g.harm[id^="chord-"]'), 'no chord ids in the SVG');
    });

    await test('tapping a bar selects it and shows its beats', async () => {
      await clickBar(page, 2);
      assert((await page.textContent('.ce-title')).startsWith('Bar 2'), 'title ' + await page.textContent('.ce-title'));
      assert((await page.$$('.ce-beat')).length >= 4, 'beat strip too short');
      assert(await page.$('#bar-2.bar-selected'), 'bar not highlighted');
    });

    await test('adding a passing chord on a half beat redraws and marks it', async () => {
      await page.click('.ce-beat:has(.bt:text-is("2½"))');
      await page.click('.ce-row .note:text-is("A")');
      await page.click('.ce-btn:text-is("7")');
      await page.waitForFunction(() => document.querySelectorAll('.sheet-music g.harm.edit').length === 1);
      const after = await chordsOf(page);
      assert(after.length === before.length + 1, 'chord count ' + before.length + ' -> ' + after.length);
      assert(after.includes('A7'), 'A7 missing: ' + after.join(' '));
    });

    await test('it is saved on the server', async () => {
      await page.waitForFunction(() => /Saved/.test(document.querySelector('.ce-status').textContent), null, {timeout: 5000});
      const j = await (await fetch(BASE + 'api/edits/E8')).json();
      assert(j.rev === 1 && j.bars['2'], 'server has ' + JSON.stringify(j));
      assert(j.bars['2'].chords.some(([t, c]) => t === 2.5 && c === 'A7'), JSON.stringify(j.bars['2']));
      assert(j.bars['2'].was.length >= 1, 'no original recorded');
    });

    await test('typing a chord with b and # is cleaned up', async () => {
      await page.click('.ce-beat:has(.bt:text-is("1"))');
      await page.fill('.ce-input', 'ebm7/bb');
      await page.press('.ce-input', 'Enter');
      try {
        await page.waitForFunction(() => [...document.querySelectorAll('.sheet-music g.harm')].some((g) => /Em7\/B/.test(g.textContent.replace(/[\s\uE000-\uF8FF]/g, ''))), null, {timeout: 8000});
      } catch (e) {
        throw new Error('chords now: ' + (await chordsOf(page)).join(' ') + '; input "' + await page.inputValue('.ce-input') + '"; title ' + await page.textContent('.ce-title'));
      }
    });

    await test('transposed, the chord shows moved and is stored in the original key', async () => {
      await page.keyboard.press('+');
      await page.waitForFunction(() => [...document.querySelectorAll('.sheet-music g.harm')].some((g) => g.textContent.replace(/[\s\uE000-\uF8FF]/g, '') === 'Fm'));
      await page.click('.ce-beat:has(.bt:text-is("3"))');
      await page.fill('.ce-input', 'C');
      await page.press('.ce-input', 'Enter');
      await page.waitForFunction(() => /Saved/.test(document.querySelector('.ce-status').textContent));
      const j = await (await fetch(BASE + 'api/edits/E8')).json();
      const c = j.bars['2'].chords.find(([t]) => t === 3);
      assert(c && c[1] === 'B', 'stored ' + JSON.stringify(j.bars['2'].chords));
      await page.keyboard.press('0');
    });

    await test('Undo removes the last change', async () => {
      await page.click('.ce-btn:text-is("Undo")');
      await page.waitForFunction(() => document.querySelector('#chord-2-3').textContent.replace(/\s+/g, '') === 'Em');
    });

    await test('edits survive a reload, in the chart view and on another device', async () => {
      await page.waitForFunction(() => /Saved/.test(document.querySelector('.ce-status').textContent));
      const shown = await chordsOf(page);
      const page2 = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
      await open(page2, '#/sheet/E8?v=piano');
      const other = await chordsOf(page2);
      assert(JSON.stringify(other) === JSON.stringify(shown), 'other device shows different chords: ' + other.join(' ') + ' vs ' + shown.join(' '));
      await page2.click('button.orig');
      await page2.waitForFunction(() => document.querySelectorAll('.sheet-music g.harm.edit').length === 0);
      await page2.keyboard.press('h');
      await page2.waitForSelector('.chart .ch');
      await page2.close();
    });

    await test('guitar view leaves edit mode and still shows the edited chords', async () => {
      await page.click('.sheet-bar .seg .tb:text-is("Guitar")');
      await page.waitForFunction(() => !document.body.classList.contains('editing-chords'));
      await page.click('.sheet-bar .seg .tb:text-is("Piano")');
    });

    await test('a second device saving first gives a conflict, not a lost update', async () => {
      await page.click('button.edit');
      const cur = await (await fetch(BASE + 'api/edits/E8')).json();
      await fetch(BASE + 'api/edits/E8', {method: 'PUT', headers: {'Content-Type': 'application/json', 'X-Hymns': '1'}, body: JSON.stringify({rev: cur.rev, bars: cur.bars})});
      await clickBar(page, 3);
      await page.click('.ce-beat:has(.bt:text-is("1"))');
      await page.fill('.ce-input', 'F');
      await page.press('.ce-input', 'Enter');
      await page.waitForFunction(() => /other device/.test(document.querySelector('.ce-status').textContent), null, {timeout: 5000});
    });

    await test('no console errors', async () => { assert(!errors.length, errors.join('\n')); });
    await page.screenshot({path: path.join(DATA, 'editor.png')});
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\n${passed} passed, ${failed} failed (screenshot: ${path.join(DATA, 'editor.png')})`);
  process.exit(failed ? 1 : 0);
})();
