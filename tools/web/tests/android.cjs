// The Android app's sheet viewer (tools/web/android around the web app's sheet code), as the app serves it
// (tests/android_serve.py), on a phone screen, with a stand-in for the app's chord edits bridge (window.HymnsEdits).
//   node tools/web/tests/android.cjs
const {spawn, execSync} = require('child_process');
const path = require('path');

function playwright() {
  try { return require('playwright'); } catch (e) { /* not installed here */ }
  if (process.env.PW) return require(process.env.PW);
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const {chromium} = playwright();
const PORT = 8781;
const BASE = `http://127.0.0.1:${PORT}/assets/viewer/index.html?`;
const BF500 = 'id=BF500&variant=piano&accent=%230099cc&accentNight=%2333b5e5&tune=m5511233423455345';

(async () => {
  const server = spawn('python3', [path.join(__dirname, 'android_serve.py'), '--port', String(PORT)], {stdio: 'ignore'});
  await new Promise((r) => setTimeout(r, 1200));
  const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME} : {});
  let failed = 0, passed = 0;
  const errors = [];
  const test = async (name, fn) => {
    try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + String(e.message || e).split('\n')[0]); }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  // a phone, with the app's bridge: the edits it keeps, and whether the editor is open (for Back)
  async function phone(query, opts = {}) {
    const ctx = await browser.newContext(Object.assign({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true}, opts));
    await ctx.addInitScript(() => {
      const saved = {};
      window.__bridge = {saved, editing: null};
      window.HymnsEdits = {
        get: (id) => saved[id] || '{}',
        put: (id, bars) => { if (bars === '{}') delete saved[id]; else saved[id] = bars; return true; },
        setEditing: (on) => { window.__bridge.editing = on; },
        saveFile: (name, base64) => { window.__bridge.file = {name, head: atob(base64).slice(0, 4), size: atob(base64).length}; },
      };
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + query);
    await page.waitForSelector('.sheet-music svg', {timeout: 30000});
    await page.waitForTimeout(500);
    return {ctx, page};
  }

  console.log('The Android sheet viewer');
  let p = await phone(BF500 + '&theme=light&lang=en');
  let page = p.page;
  await test('the sheet with the toolbar: ‹ back first, Piano | Guitar, key, Chords only, Both hands, ▶, ⋯', async () => {
    const bar = await page.locator('.sheet-bar').textContent();
    assert(/Piano/.test(bar) && /Guitar/.test(bar) && /Chords only/.test(bar) && /Both hands/.test(bar), 'toolbar: ' + bar);
    assert(await page.locator('.sheet-bar > *:visible').first().getAttribute('title') === 'Back', 'back is first');
    assert(await page.locator('.tb.playsheet').isVisible() && await page.locator('.tb.sheet-more').isVisible(), 'play and more');
    assert((await page.locator('.sheet-no:not(.sheet-spacer)').textContent()).trim() === 'BF500', 'the number');
  });
  await test('one row on a small phone: the icons for Piano | Guitar, no zoom and no Both hands', async () => {
    const q = await phone(BF500 + '&theme=light&lang=en', {viewport: {width: 360, height: 740}});
    const r = await q.page.locator('.sheet-bar').evaluate((bar) => {
      const vis = [...bar.children].filter((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0 && !e.classList.contains('grow'));
      const fit = vis.every((e) => e.scrollWidth <= e.clientWidth + 1);
      return {fit, tops: [...new Set(vis.map((e) => Math.round(e.getBoundingClientRect().top)))], right: Math.max(...vis.map((e) => e.getBoundingClientRect().right)),
        names: vis.map((e) => e.className)};
    });
    assert(Math.max(...r.tops) - Math.min(...r.tops) <= 4, 'one row: ' + JSON.stringify(r));
    assert(r.right <= 360, 'fits the screen: ' + r.right);
    assert(r.fit, 'nothing squeezed: ' + JSON.stringify(r));
    assert(r.right <= 354, 'inside the padding: ' + r.right);
    assert(!r.names.some((n) => /zoom|hands/.test(n)), 'no zoom, no Both hands: ' + r.names);
    assert(await q.page.locator('.sheet-bar .seg .tb .lbl').first().isHidden(), 'Piano | Guitar are icons');
    await q.page.screenshot({path: process.env.SHOT || '/tmp/bar360.png', clip: {x: 0, y: 0, width: 360, height: 120}});
    await q.ctx.close();
  });
  await test('no zoom buttons on a phone, so Smaller and Bigger are in the ⋯ menu', async () => {
    const before = await page.locator('.sheet-music svg').first().evaluate((e) => e.getBoundingClientRect().height);
    await page.click('.sheet-bar .tb.sheet-more');
    assert(await page.locator('.share-menu button:has-text("Smaller")').count() === 1 && await page.locator('.share-menu button:has-text("Bigger")').count() === 1, 'the menu has both');
    await page.click('.share-menu button:has-text("Bigger")'); await page.waitForTimeout(1200);
    const after = await page.locator('.sheet-music svg').first().evaluate((e) => e.getBoundingClientRect().height);
    assert(after > before, 'Bigger redraws the sheet larger: ' + before + ' -> ' + after);
    await page.click('.sheet-bar .tb.sheet-more'); await page.click('.share-menu button:has-text("Smaller")'); await page.waitForTimeout(1200);
  });
  await test('one row at every width: the bar gives up the zoom, the words, Both hands, in that order', async () => {
    const q = await phone(BF500 + '&theme=light&lang=en', {viewport: {width: 800, height: 700}});
    let last = -1;
    for (const w of [800, 700, 620, 540, 460, 400, 360, 320]) {
      await q.page.setViewportSize({width: w, height: 700}); await q.page.waitForTimeout(400);
      const r = await q.page.locator('.sheet-bar').evaluate((bar) => {
        const tops = [...bar.children].filter((e) => e.offsetParent !== null && !e.classList.contains('grow')).map((e) => Math.round(e.getBoundingClientRect().top));
        return {fit: +bar.dataset.fit, rows: Math.max(...tops) - Math.min(...tops), over: bar.scrollWidth > bar.clientWidth};
      });
      assert(r.rows <= 4 && !r.over, w + ' px: ' + JSON.stringify(r));
      assert(r.fit >= last, w + ' px: gives up more as it narrows: ' + JSON.stringify(r)); last = r.fit;
    }
    assert(last >= 5, 'the narrow end gave up Both hands and Chords only (in ⋯)');
    await q.ctx.close();
  });
  await test('the book\'s colour (Be Filled), from the app', async () => {
    const bg = await page.locator('.sheet-bar .seg .tb[aria-pressed="true"]').evaluate((e) => getComputedStyle(e).backgroundColor);
    assert(bg === 'rgb(0, 153, 204)', 'Piano pressed in the day colour: ' + bg);
  });
  await test('Both hands opens its panel; ▶ plays at the tune\'s tempo and shades the bar', async () => {
    await page.click('.sheet-bar .tb.sheet-more'); await page.click('.share-menu button:has-text("Both hands")'); await page.waitForTimeout(800);   // not in the bar on a phone
    assert(await page.locator('.piano-panel .pp-body').isVisible(), 'the panel');
    const pressed = await page.locator('.piano-panel .ce-btn[aria-pressed="true"]').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    assert(pressed === 'rgb(0, 153, 204)', 'the panel in the book\'s colour too: ' + pressed);
    await page.click('.piano-panel button:text-is("Done")');
    await page.click('.tb.playsheet'); await page.waitForTimeout(1500);
    assert((await page.locator('.sheet-player .tb.primary').textContent()).includes('Stop'), 'it plays');
    assert(await page.locator('.sp-tempo').textContent() === '♩ = 89', 'the tune\'s tempo: ' + await page.locator('.sp-tempo').textContent());
    assert(await page.locator('.sp-bar').isVisible() && await page.locator('[id^="lh"].playing').count() > 0, 'the bar and the left hand light up');
    await page.click('.tb.playsheet'); await page.waitForTimeout(300);
    await page.click('.sheet-bar .tb.sheet-more'); await page.click('.share-menu button:has-text("Both hands")'); await page.waitForTimeout(500);
  });
  await test('chord editing fits a phone: three lines, saved through the app, Back closes it', async () => {
    await page.click('.sheet-bar .tb.sheet-more'); await page.click('.share-menu button:has-text("Edit chords")'); await page.waitForTimeout(500);
    assert(await page.evaluate(() => window.__bridge.editing) === true, 'the app knows (Back closes the editor)');
    await page.locator('.sheet-music g.measure').nth(2).locator('g.staff').first().click({position: {x: 5, y: 5}, force: true}); await page.waitForTimeout(500);
    const height = await page.locator('.chord-editor:not(.pp-panel)').evaluate((e) => e.offsetHeight);
    assert(height < 220, 'the editor leaves the sheet in view: ' + height + 'px');
    const done = await page.locator('.chord-editor:not(.pp-panel) .ce-btn.primary').evaluate((e) => getComputedStyle(e).backgroundColor);
    assert(done === 'rgb(0, 153, 204)', 'the editor in the book\'s colour: ' + done);
    assert(await page.locator('.ce-more').isVisible() && await page.locator('.ce-build').isHidden(), 'More, folded away');
    await page.click('.ce-key .ce-btn:has-text("G")'); await page.waitForTimeout(500);
    const saved = await page.evaluate(() => JSON.parse(window.__bridge.saved.BF500 || '{}'));
    assert(saved['3'] && saved['3'].chords[0][1] === 'G', 'saved in the app: ' + JSON.stringify(saved));
    await page.click('.ce-more');
    assert(await page.locator('.ce-build').isVisible() && await page.locator('.ce-btn:text-is("Original bar")').isVisible(), 'More shows the rest');
    await page.click('.ce-btn:text-is("Original bar")'); await page.waitForTimeout(400);
    assert(await page.evaluate(() => !window.__bridge.saved.BF500), 'the original bar again: nothing kept');
    await page.click('.ce-more');
    await page.evaluate(() => window.closeEditor()); await page.waitForTimeout(300);
    assert(await page.locator('.chord-editor:not(.pp-panel)').isHidden() && await page.evaluate(() => window.__bridge.editing) === false, 'closed');
  });
  await test('Save MIDI hands the file to the app (a WebView does not download)', async () => {
    await page.click('.sheet-bar .tb.sheet-more'); await page.click('.share-menu button:has-text("Save MIDI")'); await page.waitForTimeout(800);
    const f = await page.evaluate(() => window.__bridge.file);
    assert(f && f.name === 'BF500.mid' && f.head === 'MThd' && f.size > 200, 'the file: ' + JSON.stringify(f));
  });
  await test('the camera cutout and the keyboard (setInsets, setKeyboard)', async () => {
    await page.evaluate(() => { window.setInsets(30, 0, 0, 40); window.setKeyboard(200); });
    const pad = await page.locator('.sheet-bar').evaluate((e) => [getComputedStyle(e).paddingTop, getComputedStyle(e).paddingLeft]);
    assert(pad[0] === '40px' && pad[1] === '52px', 'the toolbar keeps clear of the cutout: ' + pad);
    await page.evaluate(() => { window.setInsets(0, 0, 0, 0); window.setKeyboard(0); });
  });
  await p.ctx.close();

  p = await phone(BF500 + '&theme=dark&lang=zh-Hant');
  page = p.page;
  await test('dark theme: dark paper, the night colour; the app\'s language', async () => {
    assert(await page.locator('.sheet').evaluate((e) => e.classList.contains('dark')), 'dark paper');
    const bg = await page.locator('.sheet-bar .seg .tb[aria-pressed="true"]').evaluate((e) => getComputedStyle(e).backgroundColor);
    assert(bg === 'rgb(51, 181, 229)', 'the night colour: ' + bg);
    const bar = await page.locator('.sheet-bar').textContent();
    assert(bar.includes('鋼琴') && bar.includes('雙手'), 'Traditional Chinese: ' + bar);
  });
  await p.ctx.close();

  p = await phone('id=E1&lyrics=C1&variant=guitar&theme=light&lang=en');
  page = p.page;
  await test('a translation\'s own words under the borrowed sheet; the guitar sheet from the app\'s setting', async () => {
    assert((await page.locator('.sheet-no:not(.sheet-spacer)').textContent()).trim() === 'C1', 'the translation\'s number: ' + await page.locator('.sheet-no:not(.sheet-spacer)').textContent());
    assert(/但願榮耀/.test(await page.locator('.sheet-title').textContent()), 'its title');
    assert(await page.locator('.sheet-bar .seg .tb[title^="Guitar"]').getAttribute('aria-pressed') === 'true', 'guitar');
  });
  await p.ctx.close();

  await test('no errors on the page', async () => { assert(!errors.length, errors.join(' | ')); });
  await browser.close();
  server.kill();
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
