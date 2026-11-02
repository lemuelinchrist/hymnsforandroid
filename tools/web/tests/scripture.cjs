// node tools/web/tests/scripture.cjs : the Bible references of a hymn as links (src/scripture.js; the same cases as the
// Android app's ScriptureTest), and how many of the references in the database can be read
const assert = require('assert');
const path = require('path');
const {execFileSync} = require('child_process');

const RV = 'https://text.recoveryversion.bible/';
let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}

(async () => {
  const {parseScripture} = await import(path.join(__dirname, '..', 'src', 'scripture.js'));
  const one = (v) => parseScripture(v)[0];
  const urls = (v) => parseScripture(v).map((r) => r.url && r.url.replace(RV, ''));
  const texts = (v) => parseScripture(v).map((r) => r.text);

  test('a verse or a range links to its first verse', () => {
    assert.deepStrictEqual(urls('Revelation 5:12-13,'), ['66_Revelation_5.htm#Rev5-12']);
    assert.deepStrictEqual(texts('Revelation 5:12-13,'), ['Revelation 5:12-13']);
    assert.strictEqual(one('Acts 9:6').url, RV + '44_Acts_9.htm#Act9-6');
    assert.strictEqual(one('Job 23:12b').url, RV + '18_Job_23.htm#Job23-12');
  });
  test('numbered books use their own anchor codes', () => {
    assert.strictEqual(one('1 Corinthians 15:43').url, RV + '46_1Corinthians_15.htm#FCo15-43');
    assert.strictEqual(one('2 Timothy 1:7').url, RV + '55_2Timothy_1.htm#STi1-7');
    assert.strictEqual(one('1 Samuel 3:1').url, RV + '09_1Samuel_3.htm#FSa3-1');
    assert.strictEqual(one('3 John 4').url, RV + '64_3John_1.htm#TJo1-4');
    assert.strictEqual(one('Song of Songs 2:4-7a').url, RV + '22_SongofSongs_2.htm#Son2-4');
  });
  test('a part without a book goes on from the part before', () => {
    assert.deepStrictEqual(urls('Ephesians 2:5-6,18,19-22,'),
      ['49_Ephesians_2.htm#Eph2-5', '49_Ephesians_2.htm#Eph2-18', '49_Ephesians_2.htm#Eph2-19']);
    assert.deepStrictEqual(texts('Ephesians 2:5-6,18,19-22,'), ['Ephesians 2:5-6', '18', '19-22']);
    assert.deepStrictEqual(urls('Ján 1:29; 3:14; 12:24'), [null, null, null]);
    assert.strictEqual(parseScripture('John 1:29; 3:14')[1].url, RV + '43_John_3.htm#Joh3-14');
  });
  test('several books in one place', () => {
    assert.deepStrictEqual(urls('Proverbs 4:18,Matthew 13:43,Daniel 12:3,'),
      ['20_Proverbs_4.htm#Pro4-18', '40_Matthew_13.htm#Mat13-43', '27_Daniel_12.htm#Dan12-3']);
  });
  test('a chapter alone and a book alone link to their page', () => {
    assert.strictEqual(one('Psalms 42,').url, RV + '19_Psalms_42.htm');
    assert.strictEqual(one('Revelation 18-21').url, RV + '66_Revelation_18.htm');
    assert.strictEqual(one('Song of Songs,').url, RV + '22_SongofSongs_1.htm');
    assert.strictEqual(parseScripture('Psalms 42,43')[1].url, RV + '19_Psalms_43.htm');
  });
  test('a book with one chapter takes the number for a verse', () => {
    assert.strictEqual(one('Jude 24').url, RV + '65_Jude_1.htm#Jde1-24');
    assert.strictEqual(one('Philemon 4-5').url, RV + '57_Philemon_1.htm#Phm1-4');
  });
  test('Portuguese and Spanish names are read', () => {
    assert.strictEqual(one('2 Timóteo 1:7,').url, RV + '55_2Timothy_1.htm#STi1-7');
    assert.strictEqual(one('Filipenses 3:17').url, RV + '50_Philippians_3.htm#Phi3-17');
    assert.strictEqual(one('Apocalipsis 5:12').url, RV + '66_Revelation_5.htm#Rev5-12');
    assert.strictEqual(one('1 Coríntios 15:43').url, RV + '46_1Corinthians_15.htm#FCo15-43');
    assert.strictEqual(one('Cantares 2:4').url, RV + '22_SongofSongs_2.htm#Son2-4');
  });
  test('what cannot be read stays plain text', () => {
    assert.strictEqual(one('Psalms 200').url, null);
    assert.strictEqual(one('11:3a').url, null);
    assert.strictEqual(one('Žalm 23:1').url, null);
    assert.deepStrictEqual(parseScripture(null), []);
    assert.deepStrictEqual(parseScripture(''), []);
    assert.deepStrictEqual(parseScripture(' , ; '), []);
    assert.strictEqual(parseScripture('Žalm 23:1, 18')[1].url, null);
  });
  test('every English book name of the 66 is found', () => {
    const names = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
      '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes',
      'Song of Songs', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah',
      'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans',
      '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
      '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude',
      'Revelation'];
    assert.strictEqual(names.length, 66);
    names.forEach((n, i) => {
      const u = one(n + ' 1:1').url;
      assert.ok(u && u.startsWith(RV + String(i + 1).padStart(2, '0') + '_'), n + ' -> ' + u);
    });
  });

  // how much of the data can be read: every reference of the English books' hymns must link (the others are other languages)
  test('every reference of the English, New Songs, Children and Be Filled hymns links', () => {
    const db = path.join(__dirname, '..', '..', '..', 'app', 'src', 'main', 'assets', 'hymns.sqlite');
    const out = execFileSync('sqlite3', ['-separator', '\t', db,
      "select _id, verse from hymns where hymn_group in ('E','NS','CH','BF','POR') and verse is not null and verse != ''"], {encoding: 'utf8'});
    let refs = 0, plain = [];
    for (const line of out.split('\n').filter(Boolean)) {
      const [id, verse] = line.split('\t');
      for (const r of parseScripture(verse)) { refs++; if (!r.url) plain.push(id + ': ' + r.text); }
    }
    console.log('      ' + refs + ' references, ' + plain.length + ' without a link' + (plain.length ? ': ' + plain.slice(0, 12).join(' | ') : ''));
    assert.strictEqual(plain.length, 0, plain.slice(0, 20).join(' | '));
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
