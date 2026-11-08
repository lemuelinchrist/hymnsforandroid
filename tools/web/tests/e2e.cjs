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
      const n = await page.locator('.hymnals .hymnal-card').count();
      assert(n === 30, 'expected 30 hymnals, found ' + n);
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
    await test('the old codes MY, R and FY (renamed 2026-11) still work: typed, in a link, and in what the device saved', async () => {
      await search(page, 'my 637');
      await page.press('#q', 'Enter');
      await page.waitForTimeout(700); assert(await page.evaluate(() => location.hash) === '#/h/BUR637', 'typed my 637 -> ' + await page.evaluate(() => location.hash));
      await page.evaluate(() => { location.hash = '#/h/R5'; });        // an old link opens the hymn under its new code
      await page.waitForTimeout(700); assert(await page.evaluate(() => location.hash) === '#/h/RUS5', 'link R5 -> ' + await page.evaluate(() => location.hash));
      await page.evaluate(() => { location.hash = '#/h/fy12'; });
      await page.waitForTimeout(700); assert(await page.evaluate(() => location.hash) === '#/h/FRY12', 'link fy12 -> ' + await page.evaluate(() => location.hash));
      // what an old version saved: favorites, recent hymns, hidden books, the current book
      await page.evaluate(() => {
        localStorage.setItem('hfw.favorites', JSON.stringify(['MY637', 'E1', 'FY12', 'BUR637']));
        localStorage.setItem('hfw.recent', JSON.stringify(['R5', 'NS151']));
        localStorage.setItem('hfw.hidden', JSON.stringify(['I', 'FY']));
        localStorage.setItem('hfw.group', JSON.stringify('MY'));
        localStorage.removeItem('hfw.codesMigrated2026_11');
      });
      await open(page, '');
      const saved = await page.evaluate(() => ['favorites', 'recent', 'hidden', 'group', 'codesMigrated2026_11']
        .map((k) => localStorage.getItem('hfw.' + k)).join(' | '));
      assert(saved === '["BUR637","E1","FRY12"] | ["RUS5","NS151"] | ["I","FRY"] | "BUR" | true', 'migrated: ' + saved);
      await page.evaluate(() => { ['favorites', 'recent', 'hidden', 'group'].forEach((k) => localStorage.removeItem('hfw.' + k)); });
    });
    await test('the Bible references under a hymn link to the Recovery Version text', async () => {
      await open(page, '#/h/E241');
      const links = await page.locator('.meta .scripture a').evaluateAll((as) => as.map((a) => [a.textContent, a.href, a.target]));
      assert(links.length === 1, 'E241 has one reference: ' + JSON.stringify(links));
      assert(links[0][1] === 'https://text.recoveryversion.bible/66_Revelation_5.htm#Rev5-12', 'link: ' + JSON.stringify(links));
      assert(links.every((l) => l[2] === '_blank'), 'opens in a new tab');
      await open(page, '#/h/NS931');                    // a part without a book goes on from the one before: Ephesians 2:5-6,18,19-22
      const ns = await page.locator('.meta .scripture a').evaluateAll((as) => as.map((a) => a.getAttribute('href').replace('https://text.recoveryversion.bible/', '')));
      assert(ns.includes('49_Ephesians_2.htm#Eph2-18'), 'NS931: ' + JSON.stringify(ns));
    });
    await test('words find the first line first: "blessings flow" -> E8', async () => {
      await open(page, '#/browse/E');
      await search(page, 'blessings flow');
      await page.waitForSelector('.results');
      const first = await page.locator('.results .hymn-row .chip').first().textContent();
      assert(first === 'E8', 'first result was ' + first);
    });
    await test('typing keeps a space between words (the results are drawn while typing)', async () => {
      await open(page, '#/');
      await page.fill('#q', '');
      await page.locator('#q').pressSequentially('blessings flow', {delay: 300});
      await page.waitForTimeout(400);
      const typed = await page.inputValue('#q');
      assert(typed === 'blessings flow', 'the box has "' + typed + '"');
    });
    await test('whole words rank before parts of words ("flow" before "flowers")', async () => {
      const found = await page.evaluate(async () => (await import('./db.js')).search(['flow']).filter((r) => r.group === 'E'));
      const whole = found.findIndex((r) => r.score === 26 || r.score === 23), part = found.findIndex((r) => r.id === 'E343');
      assert(whole >= 0 && part > whole, 'whole-word match at ' + whole + ', E343 (flowers) at ' + part);
    });
    await test('a details link ("4/4" under E1) searches only the music column, and keeps that in both lists', async () => {
      await page.goto(BASE + '#/h/E1');
      const link = page.locator('.meta a', {hasText: '4/4'}).first();
      assert(await link.count() === 1, 'no 4/4 link in the details');
      assert((await link.getAttribute('href')).includes('in=music'), 'link ' + await link.getAttribute('href'));
      const r = await page.evaluate(async () => {
        const DB = await import('./db.js');
        return {anywhere: DB.search(['4 4'], '4 4', null, 1e6).length, music: DB.search(['4 4'], '4 4', null, 1e6, 'music').length};
      });
      assert(r.music > 0 && r.music < r.anywhere, 'music ' + r.music + ', anywhere ' + r.anywhere);
      await link.click();
      await page.waitForSelector('.results-head .seg a');
      const segs = await page.locator('.results-head .seg a').evaluateAll((as) => as.map((x) => x.getAttribute('href')));
      assert(segs.every((x) => x.includes('in=music')), 'the hymnal/all links lost it: ' + segs.join(' '));
      const n = parseInt((await page.locator('.results-head .seg a.on .n').textContent()), 10);
      assert(n > 0 && n <= r.music, 'shown ' + n + ' vs ' + r.music);
    });
    await test('a phrase in quotes must be found together: "ancient of days"', async () => {
      const r = await page.evaluate(async () => {
        const DB = await import('./db.js');
        const q = DB.parseQuery('"Ancient of Days" glory', 'E');
        const words = DB.parseQuery('ancient days', 'E');
        return {terms: q.words, phrase: DB.search(q.words.slice(0, 1)).length, words: DB.search(words.words).length};
      });
      assert(r.terms.join('|') === 'ancient of days|glory', 'terms ' + r.terms.join('|'));
      assert(r.phrase > 0 && r.phrase <= r.words, 'phrase ' + r.phrase + ', words ' + r.words);
    });
    await test('authors, subjects and tunes are searched, with a line saying why: "watchman nee"', async () => {
      await page.goto(BASE + '#/search?q=watchman%20nee');
      await page.waitForSelector('.results');
      const snippets = await page.locator('.results .snippet').allTextContents();
      assert(snippets.some((x) => x.startsWith('Author: ')), 'no Author line: ' + snippets.slice(0, 3).join(' | '));
      const fr = await page.evaluate(async () => (await import('./db.js')).search(['margaret', 'jenkins'])
        .some((r) => r.id === 'FR1' && r.where === 'people'));
      assert(fr, 'FR1 not found by the author of its parent E7');
    });
    await test('one or two letters only count as a whole word: "c major"', async () => {
      const r = await page.evaluate(async () => {
        const DB = await import('./db.js');
        const found = DB.search(['c', 'major']).filter((x) => x.group === 'E');
        return {n: found.length, first: found[0] && found[0].where};
      });
      assert(r.n > 100 && r.n < 300 && r.first === 'music', JSON.stringify(r));
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
    await test('Tamil and Burmese words keep their vowel signs: "மாட்சி" finds TA2', async () => {
      await page.goto(BASE + '#/search?q=' + encodeURIComponent('மாட்சி') + '&all=1');
      await page.waitForSelector('.results');
      const chips = await page.locator('.results .chip').allTextContents();
      assert(chips.includes('TA2'), 'no TA2: ' + chips.slice(0, 5).join(' '));
      const marks = await page.locator('.results mark').allTextContents();
      assert(marks.includes('மாட்சி'), 'word not highlighted whole: ' + marks.slice(0, 5).join(' | '));
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
    await test('big screens: the top bar has a Favorites star that opens the favorites, from a hymn too', async () => {
      await open(page, '#/h/E8');
      assert(await page.isVisible('#favoritesTop'), 'no Favorites star in the top bar');
      await page.click('#favoritesTop');
      await page.waitForURL(/#\/favorites/);
      assert(await page.locator('.page-title').textContent().then((t) => t.includes('Favorites')), 'not the favorites page');
    });
    await test('Listen and links always has a YouTube and a SoundCloud search (E: "Hymn 8 ...", C: first line and chorus)', async () => {
      await open(page, '#/h/E8');
      const href = await page.getAttribute('.links-card a[href*="results?search_query"]', 'href');
      assert(href === 'https://www.youtube.com/results?search_query=Hymn+8+Praise+God+from+whom+all+blessings+flow', 'E8: ' + href);
      const sc = await page.getAttribute('.links-card a[href*="soundcloud.com/search"]', 'href');
      assert(sc === 'https://soundcloud.com/search/sounds?q=Hymn+8+Praise+God+from+whom+all+blessings+flow', 'E8 SoundCloud: ' + sc);
      await open(page, '#/h/C206');
      const c = await page.getAttribute('.links-card a[href*="results?search_query"]', 'href');
      assert(c.length > 50 && !/[%:,!.;]/.test(c.slice(45)), 'C206: ' + c);
    });
    await test('search links: no doubled plus signs, no ? or curly/full-width marks (SW103, FRY30, FRY88, ZS911)', async () => {
      for (const id of ['SW103', 'FR100', 'FRY30', 'FRY88', 'ZS911', 'TA909']) {
        await open(page, '#/h/' + id);
        for (const sel of ['a[href*="results?search_query"]', 'a[href*="soundcloud.com/search"]']) {
          const href = await page.getAttribute('.links-card ' + sel, 'href');
          const q = decodeURIComponent(href.split(/[?&](?:search_query|q)=/)[1]);
          assert(!/\+\+|^\+|\+$/.test(q) && !/[?\u2019\uff0c\uff1b\uff1f\uff01\u3002\uff0e\u3001]/.test(q), id + ': ' + q);
        }
      }
    });
    await test('piano videos: E1 has one, E12 two in order, E395 its own and a NYCYPCD one, C1 borrows its parent\'s, E35 has none', async () => {
      const links = async (id) => { await open(page, '#/h/' + id); return page.locator('.videos:not(.search) a').evaluateAll((a) => a.filter((x) => !x.getAttribute('href').startsWith('#')).map((x) => x.textContent + ' ' + x.href).filter((x) => !x.startsWith('LSM'))); };   // LSM recordings come and go with the data
      assert((await links('E1')).join() === '1st tune ↗ https://www.youtube.com/watch?v=xVAb23XLD0s', 'E1: ' + await links('E1'));
      const e12 = await links('E12');
      assert(e12.length === 2 && e12[0].startsWith('1st tune') && e12[1].startsWith('2nd tune') && e12.every((x) => x.includes('https://www.youtube.com/watch?v=')), 'E12: ' + e12);
      assert((await links('E3')).length === 1, 'E3 has one video');
      const e395 = await links('E395');   // its own piano video, then the NYCYPCD recording (a youtube link)
      assert(e395.length === 2 && e395[0] === '1st tune ↗ https://www.youtube.com/watch?v=emzsWJGEj8Y' && e395[1].startsWith('NYCYPCD'), 'E395: ' + e395);
      assert((await links('C1'))[0] === (await links('E1'))[0], 'C1 should show E1\'s video first: ' + await links('C1'));
      assert((await links('E35')).length === 0 && await page.locator('.videos:not(.search)').count() === 0, 'E35 should have no videos line');
      assert(await page.locator('.links-card dt').allTextContents().then((t) => t.join() === 'Search'), 'E35 should have only the search row');
      await open(page, '#/h/E12');
      const card = (await page.locator('.links-card').innerText()).replace(/\s+/g, ' ');
      assert(card.replace(/ YouTube LSM ↗/, '') === 'LISTEN AND LINKS Piano videos 1st tune ↗ · 2nd tune ↗ New tunes BF171 · BF455 Search YouTube ↗ · SoundCloud ↗', 'the card reads: ' + card);
    });
    await test('new tunes: a hymn lists its New Tunes (open in the app) and their recordings in the links card', async () => {
      await open(page, '#/h/E12');
      const card = (await page.locator('.links-card').innerText()).replace(/\s+/g, ' ');
      assert(/New tunes BF171 · BF455/.test(card), 'E12 card: ' + card);
      assert(!card.includes('New tune recordings'), 'E12 has no recordings of its new tunes: ' + card);
      await page.click('.links-card a[href="#/h/BF455"]');
      await page.waitForURL(/#\/h\/BF455/);
      await open(page, '#/h/E1079');
      const card2 = (await page.locator('.links-card').innerText()).replace(/\s+/g, ' ');
      assert(/New tunes BF94/.test(card2) && /New tune recordings BF94 – NYCYPCD ↗/.test(card2), 'E1079 card: ' + card2);
      await open(page, '#/h/BF455');
      assert(!(await page.locator('.links-card').innerText().catch(() => '')).includes('New tunes'), 'a New Tune lists no New Tunes');
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
    await test('dark theme: the sheet is drawn in its own colours, and the paper button gives light paper (kept)', async () => {
      const dark = await newPage(browser, {colorScheme: 'dark'});
      await open(dark.page, '#/sheet/E11');
      await dark.page.waitForSelector('.sheet-music svg');
      const look = () => dark.page.evaluate(() => {
        const svg = document.querySelector('.sheet-music svg');
        return {filter: getComputedStyle(svg).filter, fill: getComputedStyle(svg).fill, cls: document.querySelector('.sheet').className,
          staff: getComputedStyle(document.querySelector('.sheet-music g.staff > path')).stroke};
      });
      const d = await look();
      assert(d.filter === 'none', 'the sheet is still inverted: ' + d.filter);
      assert(d.cls.includes('dark') && d.fill === 'rgb(214, 214, 214)' && d.staff === 'rgb(142, 142, 142)', 'colours ' + JSON.stringify(d));
      await dark.page.click('.sheet-bar .tb.paper');
      const l = await look();
      assert(l.cls.includes('light-paper') && !l.cls.includes('dark') && l.fill === 'rgb(0, 0, 0)', 'light paper ' + JSON.stringify(l));
      await dark.page.reload();
      await dark.page.waitForSelector('.sheet-music svg');
      assert((await look()).cls.includes('light-paper'), 'light paper not kept after a reload');
      await dark.page.click('.sheet-bar .tb.paper');
      await dark.ctx.close();
      const light = await newPage(browser, {colorScheme: 'light'});
      await open(light.page, '#/sheet/E11');
      await light.page.waitForSelector('.sheet-music svg');
      assert(await light.page.locator('.sheet-bar .tb.paper').isHidden(), 'the paper button shows in the light theme');
      await light.ctx.close();
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
      await page.click('.theme-tile[aria-label="Dark"]');
      assert(await page.getAttribute('html', 'data-theme') === 'dark', 'dark');
      await open(page, '#/h/E8');
      await page.reload();
      assert(await page.getAttribute('html', 'data-theme') === 'dark', 'dark after reload');
      await page.waitForSelector('.sheet.dark .sheet-music svg', {timeout: 60000});
      await open(page, '#/settings');
      await page.click('.theme-tile[aria-label="System default"]');
      assert(await page.getAttribute('html', 'data-theme') === null, 'back to the device setting');
    });

    await test('Black theme: pure black page, remembered, sheet drawn dark', async () => {
      await open(page, '#/settings');
      await page.click('.theme-tile[aria-label="Black"]');
      assert(await page.getAttribute('html', 'data-theme') === 'black', 'black');
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert(bg === 'rgb(0, 0, 0)', 'background ' + bg);
      await open(page, '#/h/E8');
      await page.reload();
      assert(await page.getAttribute('html', 'data-theme') === 'black', 'black after reload');
      await page.waitForSelector('.sheet.dark .sheet-music svg', {timeout: 60000});
      await open(page, '#/settings');
      await page.click('.theme-tile[aria-label="System default"]');
    });
    await test('Settings: a theme tile keeps the keyboard focus after it is chosen', async () => {
      await open(page, '#/settings');
      await page.focus('.theme-tile[aria-label="Dark"]');
      await page.keyboard.press('Enter');
      assert(await page.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'Dark', 'focus lost');
      await page.focus('.theme-tile[aria-label="System default"]');
      await page.keyboard.press('Enter');
    });
    await test('Settings: Text size has the five Android steps; the chosen one is marked and the hymn follows', async () => {
      await open(page, '#/settings');
      await page.click('.size-steps button[aria-label="XXL"]');
      assert(await page.locator('.set-head:has-text("Text size") span').textContent() === 'XXL', 'value beside the title');
      assert(await page.locator('.size-steps button[aria-pressed="true"]').getAttribute('aria-label') === 'XXL', 'XXL not marked');
      assert(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lyric-scale').trim()) === '1.6', 'lyrics not bigger');
      await page.click('.size-steps button[aria-label="Medium"]');   // back to the default
    });
    await test('Settings: Share the app shows a QR code for the web app, and for Google Play when switched', async () => {
      await open(page, '#/settings');
      const card = page.locator('.share-card');
      assert(await card.locator('.qr-url').textContent() === 'lemuelinchrist.github.io/hymnsforandroid/', 'web address first');
      const web = await card.locator('.qr svg path').getAttribute('d');
      assert(web && web.length > 500, 'a QR code is drawn');
      await card.locator('.seg button:text-is("Android")').click();
      assert((await card.locator('.qr-url').textContent()).startsWith('play.google.com/store/apps/details?id=com.lemuelinchrist.android.hymns'), 'Google Play address');
      assert(await card.locator('.seg button:text-is("Android")').getAttribute('aria-pressed') === 'true', 'Android is chosen');
      const play = await card.locator('.qr svg path').getAttribute('d');
      assert(play !== web, 'the code changed with the address');
      await card.locator('.seg button:text-is("iPhone and all devices")').click();
      assert(await card.locator('.qr svg path').getAttribute('d') === web, 'and back');
    });
    await test('Languages (Hymn Books) setting says what it is for', async () => {
      await open(page, '#/settings');
      const text = await page.locator('.settings-card', {hasText: 'Languages (Hymn Books)'}).first().textContent();
      assert(/Simplify your view by hiding books you don't use \((all \d+ shown|hiding [^)]+)\)/.test(text), text.slice(0, 200));
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
      assert(await page.locator('.family a[href$="/h/I1"]').count() === 0, 'I1 in the other languages');
      assert(await page.locator('.family a[href$="/h/S1"]').count() === 1, 'S1 missing');
    });
    await test('a hymnal switched off in Settings leaves the lists', async () => {
      await open(page, '#/settings');
      await page.click('.hymnal-toggle:has(.chip:text-is("S")) input');
      await open(page, '#/h/E1');
      assert(await page.locator('.family a[href$="/h/S1"]').count() === 0, 'S1 still shown');
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
    await test('a French Youth song shows its own words under the borrowed sheet (FRY18; the lyrics files carry the book code)', async () => {
      await open(page, '#/h/FRY18');
      await page.waitForSelector('.sheet-music svg', {timeout: 60000});
      assert((await page.textContent('.sheet-title')).startsWith('Viens'), 'title ' + await page.textContent('.sheet-title'));
      assert(await page.textContent('.sheet-no:not(.sheet-spacer)') === 'FRY18', 'number');
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

    await test('Share button: a menu with Copy lyrics and Copy link (no Web Share here), link names the hymn; Escape closes it', async () => {
      await open(page, '#/h/E8');
      assert(await page.locator('.hymn-nav .share').count() === 1 && await page.locator('.hymn-nav [title="Copy the lyrics (C)"]').count() === 0, 'share button');
      await page.click('.hymn-nav .share');
      const labels = await page.locator('.share-menu button').allTextContents();
      assert(labels.join() === (await page.evaluate(() => !!navigator.share) ? 'Share lyrics,Share link,Copy lyrics' : 'Copy lyrics,Copy link'), labels.join());
      await page.click('.share-menu button:text-is("' + (labels.includes('Copy link') ? 'Copy link' : 'Copy lyrics') + '")');
      await page.waitForTimeout(300);
      assert(await page.locator('.share-menu').count() === 0, 'menu stays open');
      if (labels.includes('Copy link')) {
        const text = await page.evaluate(() => navigator.clipboard.readText());
        assert(/^E8 · .+\nhttps:\/\/lemuelinchrist\.github\.io\/hymnsforandroid\/#\/h\/E8$/.test(text), JSON.stringify(text));
      }
      await page.click('.hymn-nav .share');
      await page.keyboard.press('Escape');
      assert(await page.locator('.share-menu').count() === 0, 'Escape');
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
    await test('offline right after the very first visit (no second online load): the app still starts', async () => {
      const off = await browser.newContext({viewport: {width: 1400, height: 900}});
      const p = await off.newPage();
      await open(p, '#/h/E9');
      await p.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active);
      await p.waitForFunction(async () => !!(await caches.match(new URL('data/version.json', location.href).href)), null, {timeout: 20000});
      await off.setOffline(true);
      await p.reload();
      await p.waitForSelector('body.ready', {timeout: 30000});
      await onHymn(p, 'E9');
      await off.close();
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
    await test('other languages: a long row has an All button that shows every language below each other; remembered', async () => {
      await open(phone.page, '#/h/BF78');
      await phone.page.waitForSelector('.fam-more:not([hidden])');
      const row = () => phone.page.evaluate(() => { const n = document.querySelector('.family'); return [n.scrollWidth > n.clientWidth + 2, n.offsetHeight]; });
      const [scrolls, oneRow] = await row();
      assert(scrolls, 'the row should scroll while closed');
      await phone.page.tap('.fam-more');
      const [scrolls2, tall] = await row();
      assert(!scrolls2 && tall > oneRow * 3, 'all languages should show below each other: ' + oneRow + ' -> ' + tall);
      await open(phone.page, '#/h/BF79');
      assert(await phone.page.locator('.family-wrap.open').count() === 1, 'the choice is kept for the next hymn');
      await phone.page.tap('.fam-more');   // closed again for the other tests
      assert(await phone.page.locator('.family-wrap.open').count() === 0, 'closed again');
    });
    await test('a button on the lower right goes back after switching language, and goes at any other hymn (BF78 -> E600 -> back)', async () => {
      await open(phone.page, '#/h/BF78');
      assert(await phone.page.locator('.swap-back').count() === 0, 'no button before a switch');
      await phone.page.tap('.fam:has-text("English")');
      await onHymn(phone.page, 'E600');
      assert(await phone.page.textContent('.swap-back') === 'BF78', 'button should name the hymn just left');
      await phone.page.tap('.swap-back');
      await onHymn(phone.page, 'BF78');
      assert(await phone.page.textContent('.swap-back') === 'E600', 'now it names E600 (back and forth)');
      await phone.page.tap('.fam:has-text("English")');
      await onHymn(phone.page, 'E600');
      await phone.page.tap('.hymn-nav a[aria-label="Next hymn"]');
      await onHymn(phone.page, 'E601');
      assert(await phone.page.locator('.swap-back').count() === 0, 'any other hymn removes the button');
    });
    await test('no bottom tab bar: the top bar has the Settings gear, the home page an empty Favorites card that opens Favorites', async () => {
      await open(phone.page, '');
      await phone.page.evaluate(() => localStorage.removeItem('hfw.favorites'));
      await open(phone.page, '');
      assert(await phone.page.locator('.tabbar').count() === 0, 'tab bar still there');
      assert(await phone.page.isHidden('#favoritesTop'), 'the star should be on the home page, not the top bar');
      const fav = phone.page.locator('.home-lists a[href="#/favorites"]');
      assert(await fav.textContent() === 'Import', 'empty Favorites card should offer Import');
      await phone.page.tap('#settingsTop');
      await phone.page.waitForURL(/#\/settings/);
      assert(await phone.page.locator('#settingsTop svg path[fill="currentColor"]').count() === 1, 'not the Android gear');
    });
    await test('the back-to-hymn button is dark-on-pastel in the dark theme and hidden on the Sheet music tab', async () => {
      await open(phone.page, '#/h/BF78');
      await phone.page.tap('.fam:has-text("English")');
      await onHymn(phone.page, 'E600');
      assert(await phone.page.evaluate(() => getComputedStyle(document.querySelector('.swap-back')).color) === 'rgb(255, 255, 255)', 'light theme: white text');
      await phone.page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      assert(await phone.page.evaluate(() => getComputedStyle(document.querySelector('.swap-back')).color) === 'rgb(22, 20, 18)', 'dark theme: dark text');
      await phone.page.evaluate(() => { delete document.documentElement.dataset.theme; });
      await phone.page.click('.tabs button[data-tab="sheet"]');
      assert(await phone.page.isHidden('.swap-back'), 'button over the music');
      await open(phone.page, '#/h/E8');   // no button left for the next tests
    });
    await test('a detour ends the back-to-hymn button (Settings, then browser Back); the toast rides above it', async () => {
      await open(phone.page, '#/h/BF78');
      await phone.page.tap('.fam:has-text("English")');
      await onHymn(phone.page, 'E600');
      await phone.page.waitForTimeout(400);   // the toast animates its position
      const toastBottom = (() => phone.page.evaluate(() => getComputedStyle(document.querySelector('#toast')).bottom));
      assert(parseInt(await toastBottom(), 10) >= 90, 'toast should be above the button: ' + await toastBottom());
      await phone.page.tap('#settingsTop');
      await phone.page.waitForURL(/#\/settings/);
      await phone.page.waitForSelector('.theme-tile');   // Settings is drawn
      await phone.page.goBack();
      await onHymn(phone.page, 'E600');
      assert(await phone.page.locator('.swap-back').count() === 0, 'button still there after a detour');
    });
    await test('phone top bar: the logo, the hymnal button and ABC are 40px touch targets', async () => {
      await open(phone.page, '');
      for (const sel of ['.brand', '#hymnalBtn', '#kbToggle']) {
        const r = await phone.page.evaluate((x) => { const b = document.querySelector(x).getBoundingClientRect(); return [b.width, b.height]; }, sel);
        assert(r[0] >= 40 && r[1] >= 36, sel + ' is ' + r.map(Math.round).join('x'));
      }
    });
    await test('phone hymn page: the hymnal code stands beside the number (CS258)', async () => {
      await open(phone.page, '#/h/E8');
      const t = await phone.page.evaluate(() => document.querySelector('.hymn-id').innerText.replace(/\s+/g, ''));
      assert(t === 'E8', 'shows ' + t);
    });
    await test('phone: a hymn with short lines has its lyrics block in the middle', async () => {
      await open(phone.page, '#/h/J55');
      const r = await phone.page.evaluate(() => { const b = document.querySelector('.lyrics').getBoundingClientRect(); return [b.left, innerWidth - b.right]; });
      assert(Math.abs(r[0] - r[1]) < 3, 'margins ' + r.map(Math.round).join(' / '));
    });
    await test('lyrics: one column in the middle of the page, two columns once there is room (not beside the sheet)', async () => {
      const probe = async (w) => {
        const q = await newPage(browser, {viewport: {width: w, height: 1000}});
        await open(q.page, '#/h/E56');
        const r = await q.page.evaluate(() => {
          const b = document.querySelector('.lyrics').getBoundingClientRect();
          return [b.left, innerWidth - b.right, new Set([...document.querySelectorAll('.stanza')].map((x) => Math.round(x.getBoundingClientRect().left))).size];
        });
        await q.ctx.close();
        return r;
      };
      for (const w of [500, 760, 900]) {
        const r = await probe(w);
        assert(Math.abs(r[0] - r[1]) < 3 && r[2] === 1, w + ' px: margins ' + r.map(Math.round).join(' / '));
      }
      const wide = await probe(1050);
      assert(wide[2] === 2, '1050 px: ' + wide[2] + ' column(s)');
    });
    await test('the search box takes the whole top bar but Back while it is in use', async () => {
      await open(phone.page, '#/h/E8');
      await open(phone.page, '#/h/E9');
      const w0 = await phone.page.evaluate(() => document.querySelector('.searchbox').offsetWidth);
      await phone.page.tap('#q');
      assert(await phone.page.isHidden('.brand') && await phone.page.isHidden('#hymnalBtn') && await phone.page.isHidden('#settingsTop'), 'others still shown');
      assert(await phone.page.isVisible('#backBtn'), 'Back hidden');
      const w1 = await phone.page.evaluate(() => document.querySelector('.searchbox').offsetWidth);
      assert(w1 > w0 + 80, 'box ' + w0 + ' -> ' + w1);
      await phone.page.tap('#kbToggle');
      assert(await phone.page.isHidden('#hymnalBtn'), 'ABC collapsed the box');
      await phone.page.evaluate(() => document.activeElement.blur());
      assert(await phone.page.isVisible('#hymnalBtn') && await phone.page.isVisible('.brand'), 'not back after leaving the box');
      await phone.page.evaluate(() => localStorage.removeItem('hfw.keyboard'));   // the next test starts on numbers
    });
    await test('the search box opens the number pad; ABC switches to letters, and it is remembered', async () => {
      await open(phone.page, '');
      const mode = () => phone.page.evaluate(() => document.querySelector('#q').inputMode);
      assert(await mode() === 'numeric', 'first keyboard is ' + await mode());
      assert(await phone.page.textContent('#kbToggle') === 'ABC', 'button should offer letters');
      await phone.page.tap('#q');
      await phone.page.tap('#kbToggle');
      assert(await mode() === 'search', 'after ABC the keyboard is ' + await mode());
      assert(await phone.page.evaluate(() => document.activeElement.id) === 'q', 'the box lost the focus');
      await open(phone.page, '');
      assert(await mode() === 'search' && await phone.page.textContent('#kbToggle') === '123', 'letters not remembered');
      await phone.page.tap('#kbToggle');
      assert(await mode() === 'numeric', 'back to numbers');
    });
    await test('tabs switch between lyrics and sheet; the sheet loads only when asked', async () => {
      await open(phone.page, '#/h/E8');
      assert(await phone.page.locator('.sheet-music').count() === 0, 'sheet loaded before the tab was opened');
      await phone.page.click('.tabs button[data-tab="sheet"]');
      await phone.page.waitForSelector('.sheet-music svg', {timeout: 60000});
      assert(await phone.page.isHidden('.lyrics-pane'), 'lyrics hidden');
      assert(phone.page.url().includes('tab=sheet'), 'URL has tab=sheet');
    });
    await test('the tab strip stays at the top of the page and the page is the only scroller', async () => {
      await open(phone.page, '#/h/C38');
      await phone.page.evaluate(() => window.scrollTo(0, 600));
      await phone.page.waitForTimeout(300);
      await phone.page.evaluate(() => window.scrollTo(0, 560));
      await phone.page.waitForTimeout(300);
      const r = await phone.page.evaluate(() => ({
        y: document.querySelector('.tabs').getBoundingClientRect().bottom,
        away: document.body.classList.contains('tabs-away'),
        pos: getComputedStyle(document.querySelector('.tabs')).position,
        ov: getComputedStyle(document.querySelector('.lyrics-pane')).overflowY}));
      assert(r.pos !== 'sticky' && r.y < 0 && !r.away, 'tab strip follows the page, not the screen');
      assert(r.ov === 'visible', 'lyrics pane has its own scrollbar');
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

    console.log('Language');
    await test('the browser language chooses the app language: zh-TW starts in C in Traditional Chinese, es in S', async () => {
      const t = await newPage(browser, {locale: 'zh-TW'});
      await open(t.page, '');
      assert(await t.page.evaluate(() => document.documentElement.lang) === 'zh-Hant', 'lang is not zh-Hant');
      assert((await t.page.textContent('#hymnalName')).includes('中文'), 'a new person in Traditional Chinese starts in C: ' + await t.page.textContent('#hymnalName'));
      assert((await t.page.textContent('.hero h1')) === '詩歌', 'the heading is not 詩歌');
      assert((await t.page.getAttribute('#settingsTop', 'aria-label')) === '設定', 'the settings link is not translated');
      await t.ctx.close();
      const s = await newPage(browser, {locale: 'es-MX'});
      await open(s.page, '');
      assert((await s.page.textContent('#hymnalName')) === 'Español', 'a new person in Spanish starts in S');
      // the other books say what they are in Spanish, under their own names, with the count as Spanish counts
      const card = await s.page.textContent('.hymnal-card[href="#/browse/C"] .count');
      assert(/Chino \(tradicional\) · 786 himnos/.test(card), 'book subtitle: ' + card);
      await s.ctx.close();
    });
    await test('Settings -> App language switches at once, is kept, and Phone\'s language follows the browser again', async () => {
      const t = await newPage(browser, {locale: 'en-US'});
      await open(t.page, '#/settings');
      assert((await t.page.textContent('h1.page-title')).includes('Settings'), 'English at first');
      await t.page.selectOption('.lang-select', 'fr');
      await t.page.waitForFunction(() => document.querySelector('h1.page-title').textContent.includes('Réglages'));
      assert(await t.page.evaluate(() => document.documentElement.lang) === 'fr', 'html lang is fr');
      assert((await t.page.getAttribute('#favoritesTop', 'aria-label')) === 'Favoris', 'the top bar is written again');
      assert((await t.page.getAttribute('#q', 'placeholder')).includes('Cherchez') || (await t.page.getAttribute('#q', 'placeholder')).includes('Numéro'), 'the search box is written again: ' + await t.page.getAttribute('#q', 'placeholder'));
      await t.page.reload();
      await t.page.waitForSelector('body.ready', {timeout: 60000});
      assert((await t.page.textContent('h1.page-title')).includes('Réglages'), 'the choice is kept after a reload');
      await t.page.selectOption('.lang-select', '');
      await t.page.waitForFunction(() => document.querySelector('h1.page-title').textContent.includes('Settings'));
      await t.ctx.close();
    });
    await test('a hymn page in Simplified Chinese: details, links card and the sheet toolbar are translated', async () => {
      const t = await newPage(browser, {locale: 'zh-CN'});
      await open(t.page, '#/h/E8');
      await onHymn(t.page, 'E8');
      const text = await t.page.textContent('#view');
      for (const w of ['聆听与链接', '作词']) assert(text.includes(w), 'missing ' + w + ' in the hymn page');
      await t.page.goto(BASE + '#/sheet/E8');
      await t.page.waitForSelector('.sheet-bar');
      const bar = await t.page.textContent('.sheet-bar');
      assert(bar.includes('钢琴') && bar.includes('吉他') && bar.includes('编辑和弦'), 'sheet toolbar: ' + bar);
      await t.ctx.close();
    });
    await test('English stays exactly as it was (a count of one, a count of many)', async () => {
      const t = await newPage(browser, {locale: 'en-US'});
      await open(t.page, '');
      const card = await t.page.textContent('.hymnal-card[href="#/browse/S"] .count');
      assert(/^Spanish · [\d,]+ hymns$/.test(card), 'English book subtitle: ' + card);
      await t.ctx.close();
    });

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
