// End-to-end tests: starts serve.py on a spare port and drives Chromium with Playwright.
//
//   python3 tools/web/build.py && node tools/web/tests/e2e.cjs   (Playwright from the project or the global npm folder)
//   node tests/e2e.cjs --sheets 200                   also renders 200 random sheets in every mode
//   node tests/e2e.cjs --sheets all                   ... or all of them (slow: about half an hour)
const {spawn, execSync} = require('child_process');
const path = require('path');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* not installed here */ }
  if (process.env.PW) return require(process.env.PW);
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const {chromium} = loadPlaywright();

const PORT = parseInt(process.env.PORT || "8799", 10);
const BASE = `http://127.0.0.1:${PORT}/`;
const args = process.argv.slice(2);
const sheetsArg = args.includes('--sheets') ? args[args.indexOf('--sheets') + 1] : null;

let passed = 0, failed = 0;
const errors = [];

async function test(name, fn) {
  const t = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${String(e.message || e).split('\n').join('\n      ')}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(BASE + 'data/version.json');
      if (r.ok) return;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serve.py did not start');
}

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext(Object.assign({viewport: {width: 1400, height: 900}}, opts));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return {ctx, page};
}

async function open(page, hash) {
  await page.goto(BASE + hash);
  await page.waitForSelector('body.ready', {timeout: 60000});
}

// wait until the hymn's screen is drawn (the URL changes first)
async function onHymn(page, id) {
  await page.waitForFunction((x) => document.title.startsWith(x + ' ·'), id);
}

async function search(page, text) {
  await page.fill('#q', text);
  await page.waitForTimeout(400);
}

(async () => {
  const server = spawn('python3', [path.join(__dirname, '..', 'serve.py'), '--port', String(PORT), '--bind', '127.0.0.1'],
    {stdio: 'ignore'});
  const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME} : {});
  try {
    await waitForServer();
    const {ctx, page} = await newPage(browser);

    console.log('Loading');
    await test('first visit downloads the database and shows the hymnals', async () => {
      await open(page, '');
      assert(await page.locator('.hymnals .hymnal-card').count() === 22, 'expected 22 hymnals');
    });
    await test('a second visit opens the database from the browser, without downloading it', async () => {
      await page.waitForTimeout(500);   // the first visit stores it in IndexedDB
      const asked = [];
      const onReq = (r) => { if (/hymns-.*\.sqlite/.test(r.url())) asked.push(r.url()); };
      page.on('request', onReq);
      const t = Date.now();
      await open(page, '');
      page.off('request', onReq);
      assert(!asked.length, 'the database was downloaded again');
      console.log(`      (ready in ${Date.now() - t} ms)`);
    });

    console.log('Search');
    await test('a number opens that hymn in the current hymnal', async () => {
      await open(page, '#/browse/E');
      await search(page, '8');
      await page.press('#q', 'Enter');
      await page.waitForURL(/#\/h\/E8/);
      assert((await page.textContent('.hymn-title')).includes('Praise God'), 'E8 title');
    });
    await test('a hymn ID opens that hymn (ns151, "C 206")', async () => {
      await search(page, 'ns151');
      await page.press('#q', 'Enter');
      await page.waitForURL(/#\/h\/NS151/);
      await search(page, 'C 206');
      await page.press('#q', 'Enter');
      await page.waitForURL(/#\/h\/C206/);
    });
    await test('words find the first line first: "blessings flow" -> E8', async () => {
      await open(page, '#/browse/E');
      await search(page, 'blessings flow');
      await page.waitForSelector('.results');
      const first = await page.locator('.results .hymn-row .chip').first().textContent();
      assert(first === 'E8', 'first result was ' + first);
    });
    await test('whole words rank before parts of words ("flow" before "flowers")', async () => {
      const found = await page.evaluate(async () => (await import('./db.js')).search(['flow']).filter((r) => r.group === 'E'));
      const whole = found.findIndex((r) => r.score > 1 && r.score < 2), part = found.findIndex((r) => r.id === 'E343');
      assert(whole >= 0 && part > whole, 'whole-word match at ' + whole + ', E343 (flowers) at ' + part);
    });
    await test('accents and case are ignored: "senor jesus" finds Spanish hymns', async () => {
      await search(page, 'senor jesus');
      await page.goto(BASE + '#/search?q=senor%20jesus&all=1');
      await page.waitForSelector('.results');
      const chips = await page.locator('.results .chip').allTextContents();
      assert(chips.some((c) => /^S\d/.test(c)), 'no Spanish hymn: ' + chips.slice(0, 5).join(' '));
      assert(await page.locator('.results mark').count() > 0, 'no highlight');
    });
    await test('Chinese search', async () => {
      await page.goto(BASE + '#/search?q=' + encodeURIComponent('神的愛') + '&all=1');
      await page.waitForSelector('.results');
      assert(await page.locator('.results .hymn-row').count() >= 5, 'too few results');
    });
    await test('arrow keys move through the results, Enter opens one', async () => {
      await page.focus('#q');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      const focused = await page.evaluate(() => document.activeElement.querySelector('.chip').textContent);
      await page.keyboard.press('Enter');
      await page.waitForURL(new RegExp('#/h/' + focused + '$'));
    });

    console.log('Hymn page');
    await test('a hymn shows numbered stanzas, chorus and footer', async () => {
      await open(page, '#/h/E1');
      assert(await page.locator('.lyrics .stanza.verse').count() >= 3, 'stanzas');
      assert(await page.locator('.meta dt').count() >= 3, 'footer');
    });
    await test('a translation takes the sheet of its English parent (SW10 -> E1206)', async () => {
      await open(page, '#/h/SW10');
      assert((await page.textContent('.sheet-from')).includes('E1206'), 'sheet-from note');
      assert(await page.locator('.family a[href*="E1206"]').count() === 1, 'E1206 in other languages');
      await page.waitForSelector('.sheet-music svg', {timeout: 60000});
    });
    await test('other languages switch to the translation', async () => {
      await open(page, '#/h/E8');
      await page.click('.family a[href*="C5"]');
      await onHymn(page, 'C5');
      assert(await page.locator('.lyrics.cjk').count() === 1, 'Chinese lyrics');
    });
    await test('← and → go to the previous and next hymn', async () => {
      await open(page, '#/h/E8');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await onHymn(page, 'E10');
      await page.keyboard.press('ArrowLeft');
      await onHymn(page, 'E9');
    });
    await test('the browser Back button returns to the previous screen', async () => {
      await page.goBack();
      await onHymn(page, 'E10');
      await page.goBack();
      await onHymn(page, 'E9');
    });
    await test('favorites: F adds, the home page lists it', async () => {
      await open(page, '#/h/E8');
      await page.evaluate(() => localStorage.removeItem('hfw.favorites'));
      await page.keyboard.press('f');
      await open(page, '');
      assert((await page.locator('.home-lists').textContent()).includes('Favorites'), 'favorites list');
      assert(await page.locator('.home-lists a[href="#/h/E8"]').count() >= 1, 'E8 in the lists');
    });
    await test('a hymn without sheet music has no Sheet tab and says so (C206)', async () => {
      await open(page, '#/h/C206');
      assert(await page.locator('.tabs').count() === 0, 'tabs shown');
      assert(await page.locator('.sheet-pane').count() === 0, 'sheet pane shown');
      assert((await page.textContent('.meta')).includes('No sheet music'), 'no-sheet note');
    });
    await test('each lyric line is its own block (long lines wrap with a hanging indent)', async () => {
      await open(page, '#/h/E8');
      assert(await page.locator('.stanza').first().locator('.line').count() === 4, 'E8 stanza 1 has 4 lines');
    });
    await test('Farsi lyrics are right to left', async () => {
      await open(page, '#/h/F1');
      assert(await page.getAttribute('.lyrics', 'dir') === 'rtl', 'dir=rtl');
    });
    await test('an unknown hymn shows a message', async () => {
      await open(page, '#/h/E99999');
      assert((await page.textContent('#view')).includes('No hymn'), 'message');
    });

    console.log('Sheet music');
    await test('the piano sheet renders in the original key', async () => {
      await open(page, '#/h/E8');
      await page.evaluate(() => localStorage.removeItem('hfw.sheet'));
      await open(page, '#/h/E8');
      await page.waitForSelector('.sheet-music svg', {timeout: 60000});
      assert(await page.textContent('.transpose .key') === 'G', 'key G');
    });
    await test('transpose up and down; the key and the URL follow', async () => {
      await page.click('button[title^="Transpose up"]');
      await page.waitForFunction(() => document.querySelector('.transpose .key').textContent === 'A♭ (+1)');
      assert(page.url().includes('t=1'), 'URL has t=1');
      await page.keyboard.press('-');
      await page.keyboard.press('-');
      await page.waitForFunction(() => document.querySelector('.transpose .key').textContent === 'G♭ (-1)');
      await page.keyboard.press('0');
      await page.waitForFunction(() => document.querySelector('.transpose .key').textContent === 'G');
    });
    await test('transposing stops at ±6', async () => {
      for (let i = 0; i < 8; i++) await page.keyboard.press('+');
      await page.waitForFunction(() => document.querySelector('.transpose .key').textContent.includes('(+6)'));
      assert(await page.isDisabled('button[title^="Transpose up"]'), 'up disabled at +6');
      await page.keyboard.press('0');
    });
    await test('guitar: capo from the key, chords moved down', async () => {
      await page.keyboard.press('+');   // A♭: capo 1, so the chords are in G
      await page.click('button[title^="Guitar"]');
      await page.waitForFunction(() => document.querySelector('.sheet-capo').textContent === '(Guitar: Capo 1)');
      assert(page.url().includes('v=guitar'), 'URL has v=guitar');
    });
    await test('hide the staff: chords over the lyrics', async () => {
      await page.click('button[title^="Show or hide the staff"]');
      await page.waitForSelector('.chart .cline');
      const chords = await page.locator('.chart .ch').allTextContents();
      assert(chords.filter(Boolean)[0] === 'G', 'first chord ' + chords.filter(Boolean)[0]);
      assert(page.url().includes('staff=0'), 'URL has staff=0');
    });
    await test('a reload keeps the sheet settings (URL)', async () => {
      await page.reload();
      await page.waitForSelector('.chart .cline', {timeout: 60000});
      assert(await page.textContent('.transpose .key') === 'A♭ (+1)', 'key after reload');
    });
    await test('the variant and staff are remembered for the next hymn; transposition is not', async () => {
      await open(page, '#/h/E9');
      await page.waitForSelector('.chart .cline', {timeout: 60000});
      assert(!(await page.textContent('.transpose .key')).includes('('), 'E9 not transposed');
      await page.keyboard.press('h');
      await page.keyboard.press('p');
      await page.waitForSelector('.sheet-music svg');
    });
    await test('zoom changes the sheet size', async () => {
      const before = await page.evaluate(() => document.querySelector('.sheet-music svg').getBoundingClientRect().height);
      await page.keyboard.press('Shift+Z');
      await page.keyboard.press('Shift+Z');
      await page.waitForFunction((b) => document.querySelector('.sheet-music svg').getBoundingClientRect().height > b * 1.1, before);
      await page.click('button[title="Original key and size"]');
    });
    await test('sheet-only view, Esc goes back', async () => {
      await page.click('a[title^="Sheet only"]');
      await page.waitForURL(/#\/sheet\/E9/);
      await page.waitForSelector('body.sheet-only .sheet-music svg', {timeout: 60000});
      assert(await page.locator('.lyrics').count() === 0, 'no lyrics');
      await page.keyboard.press('Escape');
      await page.waitForURL(/#\/h\/E9/);
      await page.waitForSelector('.lyrics');
    });
    await test('Chinese guitar sheet uses the Chinese capo label', async () => {
      await open(page, '#/h/C103?v=guitar&staff=0');
      await page.waitForSelector('.chart .cline', {timeout: 60000});
      assert((await page.textContent('.sheet-capo')).startsWith('(吉他'), 'capo label: ' + await page.textContent('.sheet-capo'));
      await page.evaluate(() => localStorage.removeItem('hfw.sheet'));
    });
    await test('dark mode is set in Settings and remembered', async () => {
      await open(page, '#/settings');
      await page.click('.settings-card .seg button:text-is("Dark")');
      assert(await page.getAttribute('html', 'data-theme') === 'dark', 'dark');
      await open(page, '#/h/E8');
      await page.reload();
      assert(await page.getAttribute('html', 'data-theme') === 'dark', 'dark after reload');
      await page.waitForSelector('.sheet.dark .sheet-music svg', {timeout: 60000});
      await open(page, '#/settings');
      await page.click('.settings-card .seg button:text-is("Device")');
      assert(await page.getAttribute('html', 'data-theme') === null, 'back to the device setting');
    });

    console.log('Like the Android app');
    await test('a single chorus is repeated after every stanza (E1001: 1 C 2 C 3 C 4 C)', async () => {
      await open(page, '#/h/E1001');
      const kinds = await page.$$eval('.lyrics .stanza', (els) => els.map((e) => e.classList.contains('chorus') ? 'C' : e.querySelector('.no').textContent));
      assert(kinds.join(' ') === '1 C 2 C 3 C 4 C', kinds.join(' '));
    });
    await test('two choruses are not repeated (E13)', async () => {
      await open(page, '#/h/E13');
      assert(await page.locator('.lyrics .stanza.again').count() === 0, 'repeated');
    });
    await test('picking a hymnal on a hymn opens its translation; Back returns (E52 -> FR10)', async () => {
      await open(page, '#/h/E52');
      await page.click('#hymnalBtn');
      await page.click('#hymnalChoices .hymnal-card:has(.code:text-is("FR"))');
      await onHymn(page, 'FR10');
      await page.click('#backBtn');
      await onHymn(page, 'E52');
    });
    await test('Indonesian is switched off at first: not in the hymnals nor the other languages', async () => {
      await open(page, '');
      assert(await page.locator('.hymnals .hymnal-card:has(.code:text-is("I"))').count() === 0, 'I in the hymnals');
      await open(page, '#/h/E1');
      assert(await page.locator('.family a[href*="I1"]').count() === 0, 'I1 in the other languages');
      assert(await page.locator('.family a[href*="S1"]').count() === 1, 'S1 missing');
    });
    await test('a hymnal switched off in Settings leaves the lists', async () => {
      await open(page, '#/settings');
      await page.click('.hymnal-toggle:has(.chip:text-is("S")) input');
      await open(page, '#/h/E1');
      assert(await page.locator('.family a[href*="S1"]').count() === 0, 'S1 still shown');
      await open(page, '#/settings');
      await page.click('.hymnal-toggle:has(.chip:text-is("S")) input');
    });
    await test('a French hymn shows its own words under the borrowed English sheet (FR10)', async () => {
      await open(page, '#/h/FR10');
      await page.waitForSelector('.sheet-music svg', {timeout: 60000});
      assert((await page.textContent('.sheet-title')).startsWith('Père'), 'title ' + await page.textContent('.sheet-title'));
      assert(await page.textContent('.sheet-no:not(.sheet-spacer)') === 'FR10', 'number');
      assert((await page.textContent('.sheet-from')).includes('E52'), 'from note');
    });
    await test('favorites import in the Android format, and export', async () => {
      await page.evaluate(() => localStorage.removeItem('hfw.favorites'));
      await open(page, '#/favorites');
      await page.fill('textarea.paste', 'e1, C215,NS151,X999,');
      await page.click('.btn.primary:text-is("Import")');
      await page.waitForSelector('.list-card');
      const ids = await page.$$eval('.list-card .chip', (cs) => cs.map((c) => c.textContent));
      assert(['E1', 'C215', 'NS151'].every((x) => ids.includes(x)) && ids.length === 3, ids.join(' '));
      assert(await page.evaluate(() => JSON.parse(localStorage.getItem('hfw.favorites')).join(',') + ',') === 'E1,C215,NS151,', 'stored order');
    });
    await test('favorites import the Android app\'s Back up text', async () => {
      await page.evaluate(() => localStorage.removeItem('hfw.favorites'));
      await open(page, '#/favorites');
      await page.fill('textarea.paste', 'My favorite hymns (Hymns For Android): 3 hymns\n\nTo put them back: ...\n\n' +
        '> E8 – Praise God, from whom all blessings flow;\n> C215 – x\nNS151 – y, E1 z\n\nSent from my iPhone\n');
      await page.click('.btn.primary:text-is("Import")');
      await page.waitForSelector('.list-card');
      assert(await page.evaluate(() => JSON.parse(localStorage.getItem('hfw.favorites')).join(',')) === 'E8,C215,NS151', 'stored order');
    });
    await test('copy puts the lyrics on the clipboard', async () => {
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: BASE});
      await open(page, '#/h/E8');
      await page.keyboard.press('c');
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => navigator.clipboard.readText());
      assert(text.startsWith('E8 · Praise God') && text.includes('\n1\n'), JSON.stringify(text.slice(0, 80)));
    });

    await test('Play loops the tune and stops on the next hymn (E1)', async () => {
      await open(page, '#/h/E1');
      await page.click('.hymn-nav .play');
      await page.waitForFunction(async () => (await import('./player.js')).playing() === 'E1');
      assert(await page.getAttribute('.hymn-nav .play', 'aria-pressed') === 'true', 'button not pressed');
      await page.keyboard.press('ArrowRight');
      await onHymn(page, 'E2');
      assert(await page.evaluate(async () => (await import('./player.js')).playing()) === null, 'still playing');
    });
    await test('every tune file reads as notes, and sounds (not silent, not clipping)', async () => {
      const r = await page.evaluate(async () => {
        const P = await import('./player.js');
        const v = await (await fetch('data/version.json')).json();
        const ix = await (await fetch(v.indexFile)).json();
        const bad = [];
        for (const [t, f] of Object.entries(ix.tunes)) {
          if (f.endsWith('.mp3')) continue;
          try { if (!P.parseMidi(await (await fetch(f)).arrayBuffer()).notes.length) bad.push(t + ': no notes'); }
          catch (e) { bad.push(t + ': ' + e.message); }
        }
        const level = await P.renderForTest(ix.tunes['5553216153222'], 6);
        return {count: Object.keys(ix.tunes).length, bad, level};
      });
      assert(r.count > 2400, r.count + ' tunes');
      assert(!r.bad.length, r.bad.slice(0, 10).join('\n'));
      assert(r.level.peak > 0.1 && r.level.peak < 0.95, 'E1 peak ' + r.level.peak);
    });
    await test('a hymn with no tune has Play greyed out (C206)', async () => {
      await open(page, '#/h/C206');
      assert(await page.isDisabled('.hymn-nav .play') === (await page.evaluate(async () => { const DB = await import('./db.js'); return !DB.tuneFile(DB.hymn('C206')); })), 'state');
    });

    await test('same tune: the other hymns on E135\'s tune, one per hymn family', async () => {
      await open(page, '#/h/E135');
      const ids = await page.$$eval('.same-tune .chip', (cs) => cs.map((c) => c.textContent));
      assert(ids.length === 12 && ids.includes('E352') && ids.includes('NS664') && !ids.includes('E135'), ids.join(' '));
    });
    await test('same tune from a Chinese hymn lists the Chinese versions first (C272)', async () => {
      await open(page, '#/h/C272');
      const ids = await page.$$eval('.same-tune .chip', (cs) => cs.map((c) => c.textContent));
      assert(ids.slice(0, 3).join(' ') === 'C311 C372 C650' && !ids.includes('E352'), ids.join(' '));
    });
    await test('no same-tune section when no other hymn has the tune (E1)', async () => {
      await open(page, '#/h/E1');
      assert(await page.locator('.same-tune').count() === 0, 'section shown');
    });

    console.log('Installable and offline');
    await test('manifest, home-screen icon and not for search engines', async () => {
      await open(page, '');
      const m = await (await fetch(BASE + 'manifest.webmanifest')).json();
      assert(m.display === 'standalone' && m.icons.length >= 2, 'manifest');
      assert((await (await fetch(BASE + 'icons/apple-touch-icon.png')).ok), 'apple-touch-icon');
      assert(await page.getAttribute('meta[name="robots"]', 'content') === 'noindex, nofollow', 'robots meta');
    });
    await test('the app opens and shows hymns and sheets without a network', async () => {
      const off = await browser.newContext({viewport: {width: 1400, height: 900}});
      const p = await off.newPage();
      await open(p, '#/h/E8');
      await p.waitForSelector('.sheet-music svg', {timeout: 60000});
      await p.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active);
      await p.reload();     // now under the service worker's control
      await p.waitForSelector('body.ready', {timeout: 60000});
      await p.waitForSelector('.sheet-music svg', {timeout: 60000});
      await off.setOffline(true);
      await p.reload();
      await p.waitForSelector('body.ready', {timeout: 30000});
      await p.goto(BASE + '#/h/E9');
      await onHymn(p, 'E9');
      await p.waitForSelector('.sheet-music svg', {timeout: 30000});
      await off.close();
    });
    await ctx.close();

    console.log('Phone (390 × 844)');
    const phone = await newPage(browser, {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
    for (const hash of ['', '#/h/E8', '#/h/SW10', '#/search?q=love&all=1', '#/browse/E', '#/browse/C?tab=cat', '#/h/NS151?tab=sheet']) {
      await test('no sideways scrolling: ' + (hash || 'home'), async () => {
        await open(phone.page, hash);
        if (hash.includes('tab=sheet')) await phone.page.waitForSelector('.sheet-music svg', {timeout: 60000});
        const over = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(over <= 0, 'page is ' + over + 'px too wide');
      });
    }
    await test('tabs switch between lyrics and sheet; the sheet loads only when asked', async () => {
      await open(phone.page, '#/h/E8');
      assert(await phone.page.locator('.sheet-music').count() === 0, 'sheet loaded before the tab was opened');
      await phone.page.click('.tabs button[data-tab="sheet"]');
      await phone.page.waitForSelector('.sheet-music svg', {timeout: 60000});
      assert(await phone.page.isHidden('.lyrics-pane'), 'lyrics hidden');
      assert(phone.page.url().includes('tab=sheet'), 'URL has tab=sheet');
    });
    await test('swipe left opens the next hymn', async () => {
      await open(phone.page, '#/h/E8');
      await phone.page.evaluate(() => {
        const el = document.querySelector('.lyrics-pane');
        const t = (x) => new Touch({identifier: 1, target: el, clientX: x, clientY: 400});
        el.dispatchEvent(new TouchEvent('touchstart', {touches: [t(300)], changedTouches: [t(300)], bubbles: true}));
        el.dispatchEvent(new TouchEvent('touchend', {touches: [], changedTouches: [t(100)], bubbles: true}));
      });
      await phone.page.waitForURL(/#\/h\/E9/);
    });
    await phone.ctx.close();

    if (sheetsArg) {
      console.log('Every mode of ' + sheetsArg + ' sheets');
      const sp = await newPage(browser, {viewport: {width: 900, height: 900}});
      await open(sp.page, '');
      const version = await (await fetch(BASE + 'data/version.json')).json();
      const ids = (await (await fetch(BASE + version.indexFile)).json()).sheets;
      let pick = ids;
      if (sheetsArg !== 'all') {
        pick = ids.slice().sort(() => Math.random() - 0.5).slice(0, parseInt(sheetsArg, 10));
      }
      const bad = await sp.page.evaluate(async (list) => {
        const {SheetView} = await import('./sheet.js');
        const host = document.createElement('div');
        host.style.width = '800px';
        document.body.appendChild(host);
        const view = new SheetView(host);
        const out = [];
        for (const id of list) {
          const modes = [{guitar: false, staff: true, shift: 0}, {guitar: false, staff: true, shift: 3},
            {guitar: true, staff: true, shift: 0}, {guitar: true, staff: false, shift: -2}];
          try {
            await view.show(id, modes[0]);
            for (const m of modes) {
              view.set(m);
              const err = host.querySelector('.sheet-status.error');
              if (err) { out.push(id + ' ' + JSON.stringify(m) + ': ' + err.textContent); break; }
              if (m.staff && !host.querySelector('.sheet-music svg')) { out.push(id + ' ' + JSON.stringify(m) + ': no svg'); break; }
              if (!m.staff && !host.querySelector('.chart .cline')) { out.push(id + ' ' + JSON.stringify(m) + ': empty chart'); break; }
            }
          } catch (e) {
            out.push(id + ': ' + e);
          }
        }
        return out;
      }, pick);
      await test(`${pick.length} sheets render as piano, transposed, guitar and chord chart`, async () => {
        assert(!bad.length, bad.length + ' failed:\n' + bad.slice(0, 30).join('\n'));
      });
      await sp.ctx.close();
    }

    await test('no errors in the browser console', async () => {
      assert(!errors.length, errors.slice(0, 10).join('\n'));
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
