// The Bible references of a hymn ("Ephesians 2:5-6,18,19-22") as links to the Recovery Version text, the way
// hymnal.net links them: https://text.recoveryversion.bible/66_Revelation_5.htm#Rev5-12, one page per chapter, an
// anchor per verse. Only the link is made; the verse text itself is not copied (it is copyrighted).
//
// A hymn's verses are a list separated by commas (or semicolons); a part without a book goes on from the one before:
// "Ephesians 2:5-6,18,19-22" is Ephesians 2:5-6, 2:18 and 2:19-22, and "Psalms 42,43" is two chapters. A part that
// can't be read (a book name not known, like the Slovak or Farsi ones) stays plain text. English book names are read,
// and Portuguese and Spanish ones too. The same rules, and the same book table, are in the Android app
// (content/Scripture.java).

const BASE = 'https://text.recoveryversion.bible/';

// file name, anchor code, chapters, names (English | Portuguese | Spanish); the index + 1 is the book's number
const BOOKS = [
  ["Genesis", "Gen", 50, "Genesis|Gênesis|Génesis"],
  ["Exodus", "Exo", 40, "Exodus|Êxodo|Éxodo"],
  ["Leviticus", "Lev", 27, "Leviticus|Levítico"],
  ["Numbers", "Num", 36, "Numbers|Números"],
  ["Deuteronomy", "Deu", 34, "Deuteronomy|Deuteronômio|Deuteronomio"],
  ["Joshua", "Jos", 24, "Joshua|Josué"],
  ["Judges", "Jud", 21, "Judges|Juízes|Jueces"],
  ["Ruth", "Rut", 4, "Ruth|Rute|Rut"],
  ["1Samuel", "FSa", 31, "1 Samuel"],
  ["2Samuel", "SSa", 24, "2 Samuel"],
  ["1Kings", "FKi", 22, "1 Kings|1 Reis|1 Reyes"],
  ["2Kings", "SKi", 25, "2 Kings|2 Reis|2 Reyes"],
  ["1Chronicles", "FCh", 29, "1 Chronicles|1 Crônicas|1 Crónicas"],
  ["2Chronicles", "SCh", 36, "2 Chronicles|2 Crônicas|2 Crónicas"],
  ["Ezra", "Ezr", 10, "Ezra|Esdras"],
  ["Nehemiah", "Neh", 13, "Nehemiah|Neemias|Nehemías"],
  ["Esther", "Est", 10, "Esther|Ester"],
  ["Job", "Job", 42, "Job|Jó"],
  ["Psalms", "Psa", 150, "Psalms|Psalm|Salmos|Salmo"],
  ["Proverbs", "Pro", 31, "Proverbs|Provérbios|Proverbios"],
  ["Ecclesiastes", "Ecc", 12, "Ecclesiastes|Eclesiastes|Eclesiastés"],
  ["SongofSongs", "Son", 8, "Song of Songs|Song of Solomon|Cântico dos Cânticos|Cantares|Cantar de los Cantares"],
  ["Isaiah", "Isa", 66, "Isaiah|Isaías"],
  ["Jeremiah", "Jer", 52, "Jeremiah|Jeremias|Jeremías"],
  ["Lamentations", "Lam", 5, "Lamentations|Lamentações|Lamentaciones"],
  ["Ezekiel", "Eze", 48, "Ezekiel|Ezequiel"],
  ["Daniel", "Dan", 12, "Daniel"],
  ["Hosea", "Hos", 14, "Hosea|Oseias|Oseas"],
  ["Joel", "Joe", 3, "Joel"],
  ["Amos", "Amo", 9, "Amos|Amós"],
  ["Obadiah", "Oba", 1, "Obadiah|Obadias|Abdías"],
  ["Jonah", "Jon", 4, "Jonah|Jonas|Jonás"],
  ["Micah", "Mic", 7, "Micah|Miqueias|Miqueas"],
  ["Nahum", "Nah", 3, "Nahum|Naum|Nahúm"],
  ["Habakkuk", "Hab", 3, "Habakkuk|Habacuque|Habacuc"],
  ["Zephaniah", "Zep", 3, "Zephaniah|Sofonias|Sofonías"],
  ["Haggai", "Hag", 2, "Haggai|Ageu|Hageo"],
  ["Zechariah", "Zec", 14, "Zechariah|Zacarias|Zacarías"],
  ["Malachi", "Mal", 4, "Malachi|Malaquias|Malaquías"],
  ["Matthew", "Mat", 28, "Matthew|Mateus|Mateo"],
  ["Mark", "Mar", 16, "Mark|Marcos"],
  ["Luke", "Luk", 24, "Luke|Lucas"],
  ["John", "Joh", 21, "John|João|Juan"],
  ["Acts", "Act", 28, "Acts|Atos|Hechos"],
  ["Romans", "Rom", 16, "Romans|Romanos"],
  ["1Corinthians", "FCo", 16, "1 Corinthians|1 Coríntios|1 Corintios"],
  ["2Corinthians", "SCo", 13, "2 Corinthians|2 Coríntios|2 Corintios"],
  ["Galatians", "Gal", 6, "Galatians|Gálatas"],
  ["Ephesians", "Eph", 6, "Ephesians|Efésios|Efesios"],
  ["Philippians", "Phi", 4, "Philippians|Filipenses"],
  ["Colossians", "Col", 4, "Colossians|Colossenses|Colosenses"],
  ["1Thessalonians", "FTh", 5, "1 Thessalonians|1 Tessalonicenses|1 Tesalonicenses"],
  ["2Thessalonians", "STh", 3, "2 Thessalonians|2 Tessalonicenses|2 Tesalonicenses"],
  ["1Timothy", "FTi", 6, "1 Timothy|1 Timóteo|1 Timoteo"],
  ["2Timothy", "STi", 4, "2 Timothy|2 Timóteo|2 Timoteo"],
  ["Titus", "Tit", 3, "Titus|Tito"],
  ["Philemon", "Phm", 1, "Philemon|Filemom|Filemón"],
  ["Hebrews", "Heb", 13, "Hebrews|Hebreus|Hebreos"],
  ["James", "Jam", 5, "James|Tiago|Santiago"],
  ["1Peter", "FPe", 5, "1 Peter|1 Pedro"],
  ["2Peter", "SPe", 3, "2 Peter|2 Pedro"],
  ["1John", "FJo", 5, "1 John|1 João|1 Juan"],
  ["2John", "SJo", 1, "2 John|2 João|2 Juan"],
  ["3John", "TJo", 1, "3 John|3 João|3 Juan"],
  ["Jude", "Jde", 1, "Jude|Judas"],
  ["Revelation", "Rev", 22, "Revelation|Apocalipse|Apocalipsis"],
];

const key = (name) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const BOOK_OF = new Map();
BOOKS.forEach((b, i) => b[3].split('|').forEach((name) => BOOK_OF.set(key(name), i)));

// a part without a book: "2:5-6" (chapter and verses) or "18", "19-22", "3a" (verses, or chapters)
const CHAPTER_VERSE = /^(\d+):\s*(\d+)[a-z]?(?:\s*[-–—]\s*(?:(\d+):\s*)?(\d+)[a-z]?)?$/;
const NUMBERS = /^(\d+)[a-z]?(?:\s*[-–—]\s*(\d+)[a-z]?)?$/;
// a part with a book: the name (maybe with a leading 1, 2 or 3) and the rest
const WITH_BOOK = /^((?:[123]\s*)?\p{L}[\p{L}\s.'’-]*?)\s*(\d.*)?$/u;

// the page of the chapter, at the verse when there is one; null when the book has no such chapter
function url(book, chapter, verse) {
  if (chapter < 1 || chapter > BOOKS[book][2] || verse < 0) return null;
  const [file, abbr] = BOOKS[book];
  const page = BASE + String(book + 1).padStart(2, '0') + '_' + file + '_' + chapter + '.htm';
  return verse === 0 ? page : page + '#' + abbr + chapter + '-' + verse;
}

// The references of a hymn's verses, in order: [{text, url}], url null when a part can't be made a link.
export function parseScripture(verses) {
  const refs = [];
  if (!verses) return refs;
  let book = -1;            // the book of the part before, -1 when none
  let chapter = 0;          // its chapter
  let verseSeen = false;    // did the part before name a verse (then a bare number goes on with verses)
  for (const raw of verses.split(/[,;]/)) {
    const text = raw.trim();
    if (!text) continue;
    let m;
    if (book >= 0 && (m = CHAPTER_VERSE.exec(text))) {
      chapter = parseInt(m[1], 10);
      verseSeen = true;
      refs.push({text, url: url(book, chapter, parseInt(m[2], 10))});
    } else if (book >= 0 && (m = NUMBERS.exec(text))) {
      const n = parseInt(m[1], 10);
      if (BOOKS[book][2] === 1) {
        refs.push({text, url: url(book, 1, n)});
      } else if (verseSeen) {
        refs.push({text, url: url(book, chapter, n)});
      } else {
        chapter = n;        // "Psalms 42,43": goes on with chapters
        refs.push({text, url: url(book, n, 0)});
      }
    } else if ((m = WITH_BOOK.exec(text)) && BOOK_OF.has(key(m[1]))) {
      book = BOOK_OF.get(key(m[1]));
      const rest = (m[2] || '').trim();
      let cv, num;
      chapter = 0;
      verseSeen = false;
      if (!rest) {
        refs.push({text, url: url(book, 1, 0)});                        // the whole book: its first page
      } else if ((cv = CHAPTER_VERSE.exec(rest))) {
        chapter = parseInt(cv[1], 10);
        verseSeen = true;
        refs.push({text, url: url(book, chapter, parseInt(cv[2], 10))});
      } else if ((num = NUMBERS.exec(rest))) {
        const n = parseInt(num[1], 10);
        if (BOOKS[book][2] === 1) {                                     // "Jude 24": a verse of a book with one chapter
          chapter = 1;
          verseSeen = true;
          refs.push({text, url: url(book, 1, n)});
        } else {                                                        // "Psalms 42" or "Revelation 18-21": the chapter, or the first
          chapter = n;
          refs.push({text, url: url(book, n, 0)});
        }
      } else {
        refs.push({text, url: null});
      }
    } else {
      book = -1;                                                        // a book not known: plain text, the next part starts over
      refs.push({text, url: null});
    }
  }
  return refs;
}
