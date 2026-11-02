package com.lemuelinchrist.android.hymns.content;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The Bible references of a hymn ("Ephesians 2:5-6,18,19-22") as links to the Recovery Version text, the way
 * hymnal.net links them: {@code https://text.recoveryversion.bible/66_Revelation_5.htm#Rev5-12}, one page per chapter,
 * an anchor per verse. Only the link is made; the verse text itself is not copied (it is copyrighted).
 * <p>
 * A hymn's verses are a list separated by commas (or semicolons); a part without a book goes on from the one before:
 * "Ephesians 2:5-6,18,19-22" is Ephesians 2:5-6, 2:18 and 2:19-22, and "Psalms 42,43" is two chapters. A part that
 * can't be read (a book name not known, like the Slovak or Farsi ones) stays plain text. English book names are read,
 * and Portuguese and Spanish ones too, for the books of those languages. The same rules are in the web app
 * (tools/web/src/scripture.js).
 */
public final class Scripture {

    /** A reference as it is shown, and its link (null when it can't be made one). */
    public static final class Ref {
        public final String text;
        public final String url;

        Ref(String text, String url) {
            this.text = text;
            this.url = url;
        }
    }

    private static final String BASE = "https://text.recoveryversion.bible/";

    // file name, anchor code, chapters, names (English | Portuguese | Spanish); the index + 1 is the book's number
    private static final String[][] BOOKS = {
            {"Genesis", "Gen", "50", "Genesis|Gênesis|Génesis"},
            {"Exodus", "Exo", "40", "Exodus|Êxodo|Éxodo"},
            {"Leviticus", "Lev", "27", "Leviticus|Levítico"},
            {"Numbers", "Num", "36", "Numbers|Números"},
            {"Deuteronomy", "Deu", "34", "Deuteronomy|Deuteronômio|Deuteronomio"},
            {"Joshua", "Jos", "24", "Joshua|Josué"},
            {"Judges", "Jud", "21", "Judges|Juízes|Jueces"},
            {"Ruth", "Rut", "4", "Ruth|Rute|Rut"},
            {"1Samuel", "FSa", "31", "1 Samuel"},
            {"2Samuel", "SSa", "24", "2 Samuel"},
            {"1Kings", "FKi", "22", "1 Kings|1 Reis|1 Reyes"},
            {"2Kings", "SKi", "25", "2 Kings|2 Reis|2 Reyes"},
            {"1Chronicles", "FCh", "29", "1 Chronicles|1 Crônicas|1 Crónicas"},
            {"2Chronicles", "SCh", "36", "2 Chronicles|2 Crônicas|2 Crónicas"},
            {"Ezra", "Ezr", "10", "Ezra|Esdras"},
            {"Nehemiah", "Neh", "13", "Nehemiah|Neemias|Nehemías"},
            {"Esther", "Est", "10", "Esther|Ester"},
            {"Job", "Job", "42", "Job|Jó"},
            {"Psalms", "Psa", "150", "Psalms|Psalm|Salmos|Salmo"},
            {"Proverbs", "Pro", "31", "Proverbs|Provérbios|Proverbios"},
            {"Ecclesiastes", "Ecc", "12", "Ecclesiastes|Eclesiastes|Eclesiastés"},
            {"SongofSongs", "Son", "8", "Song of Songs|Song of Solomon|Cântico dos Cânticos|Cantares|Cantar de los Cantares"},
            {"Isaiah", "Isa", "66", "Isaiah|Isaías"},
            {"Jeremiah", "Jer", "52", "Jeremiah|Jeremias|Jeremías"},
            {"Lamentations", "Lam", "5", "Lamentations|Lamentações|Lamentaciones"},
            {"Ezekiel", "Eze", "48", "Ezekiel|Ezequiel"},
            {"Daniel", "Dan", "12", "Daniel"},
            {"Hosea", "Hos", "14", "Hosea|Oseias|Oseas"},
            {"Joel", "Joe", "3", "Joel"},
            {"Amos", "Amo", "9", "Amos|Amós"},
            {"Obadiah", "Oba", "1", "Obadiah|Obadias|Abdías"},
            {"Jonah", "Jon", "4", "Jonah|Jonas|Jonás"},
            {"Micah", "Mic", "7", "Micah|Miqueias|Miqueas"},
            {"Nahum", "Nah", "3", "Nahum|Naum|Nahúm"},
            {"Habakkuk", "Hab", "3", "Habakkuk|Habacuque|Habacuc"},
            {"Zephaniah", "Zep", "3", "Zephaniah|Sofonias|Sofonías"},
            {"Haggai", "Hag", "2", "Haggai|Ageu|Hageo"},
            {"Zechariah", "Zec", "14", "Zechariah|Zacarias|Zacarías"},
            {"Malachi", "Mal", "4", "Malachi|Malaquias|Malaquías"},
            {"Matthew", "Mat", "28", "Matthew|Mateus|Mateo"},
            {"Mark", "Mar", "16", "Mark|Marcos"},
            {"Luke", "Luk", "24", "Luke|Lucas"},
            {"John", "Joh", "21", "John|João|Juan"},
            {"Acts", "Act", "28", "Acts|Atos|Hechos"},
            {"Romans", "Rom", "16", "Romans|Romanos"},
            {"1Corinthians", "FCo", "16", "1 Corinthians|1 Coríntios|1 Corintios"},
            {"2Corinthians", "SCo", "13", "2 Corinthians|2 Coríntios|2 Corintios"},
            {"Galatians", "Gal", "6", "Galatians|Gálatas"},
            {"Ephesians", "Eph", "6", "Ephesians|Efésios|Efesios"},
            {"Philippians", "Phi", "4", "Philippians|Filipenses"},
            {"Colossians", "Col", "4", "Colossians|Colossenses|Colosenses"},
            {"1Thessalonians", "FTh", "5", "1 Thessalonians|1 Tessalonicenses|1 Tesalonicenses"},
            {"2Thessalonians", "STh", "3", "2 Thessalonians|2 Tessalonicenses|2 Tesalonicenses"},
            {"1Timothy", "FTi", "6", "1 Timothy|1 Timóteo|1 Timoteo"},
            {"2Timothy", "STi", "4", "2 Timothy|2 Timóteo|2 Timoteo"},
            {"Titus", "Tit", "3", "Titus|Tito"},
            {"Philemon", "Phm", "1", "Philemon|Filemom|Filemón"},
            {"Hebrews", "Heb", "13", "Hebrews|Hebreus|Hebreos"},
            {"James", "Jam", "5", "James|Tiago|Santiago"},
            {"1Peter", "FPe", "5", "1 Peter|1 Pedro"},
            {"2Peter", "SPe", "3", "2 Peter|2 Pedro"},
            {"1John", "FJo", "5", "1 John|1 João|1 Juan"},
            {"2John", "SJo", "1", "2 John|2 João|2 Juan"},
            {"3John", "TJo", "1", "3 John|3 João|3 Juan"},
            {"Jude", "Jde", "1", "Jude|Judas"},
            {"Revelation", "Rev", "22", "Revelation|Apocalipse|Apocalipsis"},
    };

    private static final Map<String, Integer> BOOK_OF = new HashMap<>();

    static {
        for (int i = 0; i < BOOKS.length; i++) {
            for (String name : BOOKS[i][3].split("\\|")) BOOK_OF.put(key(name), i);
        }
    }

    // a part without a book: "2:5-6" (chapter and verses) or "18", "19-22", "3a" (verses, or chapters)
    private static final Pattern CHAPTER_VERSE = Pattern.compile("(\\d+):\\s*(\\d+)[a-z]?(?:\\s*[-–—]\\s*(?:(\\d+):\\s*)?(\\d+)[a-z]?)?");
    private static final Pattern NUMBERS = Pattern.compile("(\\d+)[a-z]?(?:\\s*[-–—]\\s*(\\d+)[a-z]?)?");
    // a part with a book: the name (maybe with a leading 1, 2 or 3) and the rest
    private static final Pattern WITH_BOOK = Pattern.compile("((?:[123]\\s*)?\\p{L}[\\p{L}\\s.'’-]*?)\\s*(\\d.*)?");

    private Scripture() {}

    /** The book's name as it is looked up: lower case, no accents, no spaces or marks ("1 Coríntios" is "1corintios"). */
    static String key(String name) {
        String plain = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return plain.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
    }

    /** The references of a hymn's verses, in order, each with its link when it has one. */
    public static List<Ref> parse(String verses) {
        List<Ref> refs = new ArrayList<>();
        if (verses == null) return refs;
        int book = -1;          // the book of the part before, -1 when none
        int chapter = 0;        // its chapter
        boolean verseSeen = false; // did the part before name a verse (then a bare number goes on with verses)
        for (String raw : verses.split("[,;]")) {
            String text = raw.trim();
            if (text.isEmpty()) continue;
            Matcher m;
            if (book >= 0 && (m = CHAPTER_VERSE.matcher(text)).matches()) {
                chapter = Integer.parseInt(m.group(1));
                verseSeen = true;
                refs.add(new Ref(text, url(book, chapter, Integer.parseInt(m.group(2)))));
            } else if (book >= 0 && (m = NUMBERS.matcher(text)).matches()) {
                int n = Integer.parseInt(m.group(1));
                if (chapters(book) == 1) {
                    refs.add(new Ref(text, url(book, 1, n)));
                } else if (verseSeen) {
                    refs.add(new Ref(text, url(book, chapter, n)));
                } else {
                    chapter = n;    // "Psalms 42,43": goes on with chapters
                    refs.add(new Ref(text, url(book, n, 0)));
                }
            } else if ((m = WITH_BOOK.matcher(text)).matches() && BOOK_OF.containsKey(key(m.group(1)))) {
                book = BOOK_OF.get(key(m.group(1)));
                String rest = m.group(2) == null ? "" : m.group(2).trim();
                Matcher cv = CHAPTER_VERSE.matcher(rest);
                Matcher num = NUMBERS.matcher(rest);
                chapter = 0;
                verseSeen = false;
                if (rest.isEmpty()) {
                    refs.add(new Ref(text, url(book, 1, 0)));                    // the whole book: its first page
                } else if (cv.matches()) {
                    chapter = Integer.parseInt(cv.group(1));
                    verseSeen = true;
                    refs.add(new Ref(text, url(book, chapter, Integer.parseInt(cv.group(2)))));
                } else if (num.matches()) {
                    int n = Integer.parseInt(num.group(1));
                    if (chapters(book) == 1) {          // "Jude 24": a verse of a book with one chapter
                        chapter = 1;
                        verseSeen = true;
                        refs.add(new Ref(text, url(book, 1, n)));
                    } else {                            // "Psalms 42" or "Revelation 18-21": the chapter, or the first
                        chapter = n;
                        refs.add(new Ref(text, url(book, n, 0)));
                    }
                } else {
                    refs.add(new Ref(text, null));
                }
            } else {
                book = -1;                              // a book not known: plain text, and the next part starts over
                refs.add(new Ref(text, null));
            }
        }
        return refs;
    }

    private static int chapters(int book) {
        return Integer.parseInt(BOOKS[book][2]);
    }

    /** The page of the chapter, at the verse when there is one; null when the book has no such chapter. */
    static String url(int book, int chapter, int verse) {
        if (chapter < 1 || chapter > chapters(book) || verse < 0) return null;
        String[] b = BOOKS[book];
        String page = String.format(Locale.ROOT, "%s%02d_%s_%d.htm", BASE, book + 1, b[0], chapter);
        return verse == 0 ? page : page + "#" + b[1] + chapter + "-" + verse;
    }
}
