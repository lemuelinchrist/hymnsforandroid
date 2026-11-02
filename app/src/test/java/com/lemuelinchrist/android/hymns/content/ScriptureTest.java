package com.lemuelinchrist.android.hymns.content;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.List;

import org.junit.Test;

public class ScriptureTest {

    private static final String RV = "https://text.recoveryversion.bible/";

    private static void assertRef(Scripture.Ref ref, String text, String url) {
        assertEquals(text, ref.text);
        assertEquals(url, ref.url == null ? null : ref.url);
    }

    @Test
    public void aVerseOrARangeLinksToItsFirstVerse() {
        List<Scripture.Ref> refs = Scripture.parse("Revelation 5:12-13,");
        assertEquals(1, refs.size());
        assertRef(refs.get(0), "Revelation 5:12-13", RV + "66_Revelation_5.htm#Rev5-12");
        assertRef(Scripture.parse("Acts 9:6").get(0), "Acts 9:6", RV + "44_Acts_9.htm#Act9-6");
        assertRef(Scripture.parse("Job 23:12b").get(0), "Job 23:12b", RV + "18_Job_23.htm#Job23-12");
    }

    @Test
    public void numberedBooksUseTheirOwnAnchorCodes() {
        assertRef(Scripture.parse("1 Corinthians 15:43").get(0), "1 Corinthians 15:43", RV + "46_1Corinthians_15.htm#FCo15-43");
        assertRef(Scripture.parse("2 Timothy 1:7").get(0), "2 Timothy 1:7", RV + "55_2Timothy_1.htm#STi1-7");
        assertRef(Scripture.parse("1 Samuel 3:1").get(0), "1 Samuel 3:1", RV + "09_1Samuel_3.htm#FSa3-1");
        assertRef(Scripture.parse("3 John 4").get(0), "3 John 4", RV + "64_3John_1.htm#TJo1-4");
        assertRef(Scripture.parse("Song of Songs 2:4-7a").get(0), "Song of Songs 2:4-7a", RV + "22_SongofSongs_2.htm#Son2-4");
    }

    @Test
    public void aPartWithoutABookGoesOnFromThePartBefore() {
        List<Scripture.Ref> refs = Scripture.parse("Ephesians 2:5-6,18,19-22,");
        assertEquals(3, refs.size());
        assertRef(refs.get(0), "Ephesians 2:5-6", RV + "49_Ephesians_2.htm#Eph2-5");
        assertRef(refs.get(1), "18", RV + "49_Ephesians_2.htm#Eph2-18");
        assertRef(refs.get(2), "19-22", RV + "49_Ephesians_2.htm#Eph2-19");

        refs = Scripture.parse("Ján 1:29; 3:14; 12:24");   // a book we don't know: plain text
        assertEquals(3, refs.size());
        for (Scripture.Ref ref : refs) assertNull(ref.url);

        refs = Scripture.parse("John 1:29; 3:14");         // a new chapter of the same book
        assertRef(refs.get(1), "3:14", RV + "43_John_3.htm#Joh3-14");
    }

    @Test
    public void severalBooksInOnePlace() {
        List<Scripture.Ref> refs = Scripture.parse("Proverbs 4:18,Matthew 13:43,Daniel 12:3,");
        assertEquals(3, refs.size());
        assertRef(refs.get(1), "Matthew 13:43", RV + "40_Matthew_13.htm#Mat13-43");
        assertRef(refs.get(2), "Daniel 12:3", RV + "27_Daniel_12.htm#Dan12-3");
    }

    @Test
    public void aChapterAloneAndABookAloneLinkToTheirPage() {
        assertRef(Scripture.parse("Psalms 42,").get(0), "Psalms 42", RV + "19_Psalms_42.htm");
        assertRef(Scripture.parse("Revelation 18-21").get(0), "Revelation 18-21", RV + "66_Revelation_18.htm");
        assertRef(Scripture.parse("Song of Songs,").get(0), "Song of Songs", RV + "22_SongofSongs_1.htm");
        List<Scripture.Ref> psalms = Scripture.parse("Psalms 42,43");   // goes on with chapters
        assertRef(psalms.get(1), "43", RV + "19_Psalms_43.htm");
    }

    @Test
    public void aBookWithOneChapterTakesTheNumberForAVerse() {
        assertRef(Scripture.parse("Jude 24").get(0), "Jude 24", RV + "65_Jude_1.htm#Jde1-24");
        assertRef(Scripture.parse("Philemon 4-5").get(0), "Philemon 4-5", RV + "57_Philemon_1.htm#Phm1-4");
    }

    @Test
    public void portugueseAndSpanishNamesAreRead() {
        assertRef(Scripture.parse("2 Timóteo 1:7,").get(0), "2 Timóteo 1:7", RV + "55_2Timothy_1.htm#STi1-7");
        assertRef(Scripture.parse("Filipenses 3:17").get(0), "Filipenses 3:17", RV + "50_Philippians_3.htm#Phi3-17");
        assertRef(Scripture.parse("Apocalipsis 5:12").get(0), "Apocalipsis 5:12", RV + "66_Revelation_5.htm#Rev5-12");
        assertRef(Scripture.parse("1 Coríntios 15:43").get(0), "1 Coríntios 15:43", RV + "46_1Corinthians_15.htm#FCo15-43");
        assertRef(Scripture.parse("Cantares 2:4").get(0), "Cantares 2:4", RV + "22_SongofSongs_2.htm#Son2-4");
    }

    @Test
    public void whatCannotBeReadStaysPlainText() {
        assertNull(Scripture.parse("Psalms 200").get(0).url);          // no such chapter
        assertNull(Scripture.parse("11:3a").get(0).url);               // no book before it
        assertNull(Scripture.parse("Žalm 23:1").get(0).url);
        assertTrue(Scripture.parse(null).isEmpty());
        assertTrue(Scripture.parse("").isEmpty());
        assertTrue(Scripture.parse(" , ; ").isEmpty());
        List<Scripture.Ref> refs = Scripture.parse("Žalm 23:1, 18");   // an unknown book: the next number is not guessed
        assertNull(refs.get(1).url);
    }

    @Test
    public void everyBookHasItsOwnNumberAndNames() {
        // 66 books, each found by its English name
        String[] names = {"Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
                "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
                "Ecclesiastes", "Song of Songs", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
                "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark",
                "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians",
                "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
                "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"};
        assertEquals(66, names.length);
        for (int i = 0; i < names.length; i++) {
            String url = Scripture.parse(names[i] + " 1:1").get(0).url;
            assertTrue(names[i] + " -> " + url, url != null && url.startsWith(RV + String.format("%02d_", i + 1)));
        }
    }
}
