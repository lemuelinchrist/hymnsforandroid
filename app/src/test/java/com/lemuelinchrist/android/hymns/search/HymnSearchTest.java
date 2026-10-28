package com.lemuelinchrist.android.hymns.search;

import android.database.sqlite.SQLiteDatabase;

import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.dao.SearchIndexTestAccess;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.File;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.Assert.*;

// Robolectric runs the real SQLite, so the search table is built from the app's database as on the phone
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class HymnSearchTest {

    // built once per test run into a file: Robolectric closes every database after each test
    private static final File TABLE = new File("build/tmp/search-test.sqlite");
    private static boolean built;
    private SQLiteDatabase db;

    @Before
    public void openTable() {
        if (!built) {
            File hymns = new File("src/main/assets/hymns.sqlite");
            assertTrue("run the build first: " + hymns.getAbsolutePath(), hymns.exists());
            TABLE.getParentFile().mkdirs();
            TABLE.delete();
            SQLiteDatabase source = SQLiteDatabase.openDatabase(hymns.getPath(), null, SQLiteDatabase.OPEN_READONLY);
            SQLiteDatabase target = SQLiteDatabase.openOrCreateDatabase(TABLE, null);
            long start = System.currentTimeMillis();
            SearchIndexTestAccess.build(source, target);
            System.out.println("search table built in " + (System.currentTimeMillis() - start) + " ms");
            source.close();
            target.close();
            built = true;
        }
        db = SQLiteDatabase.openDatabase(TABLE.getPath(), null, SQLiteDatabase.OPEN_READONLY);
    }

    @After
    public void close() {
        db.close();
    }

    private List<HymnSearch.Result> search(String typed, HymnGroup current, String... hidden) {
        return HymnSearch.search(db, HymnSearch.parse(typed), current, Arrays.asList(hidden));
    }

    @Test
    public void readsWordsAndQuotedPhrases() {
        assertEquals(Arrays.asList("ancient of days", "glory"), HymnSearch.parse("\"Ancient of Days,\" glory").terms);
        assertEquals(Arrays.asList("jesus", "lord"), HymnSearch.parse("Jésus  LORD jesus").terms);
        assertEquals(Collections.singletonList("o lord"), HymnSearch.parse("“O Lord”").terms);
        assertTrue(HymnSearch.parse(" ,.! ").isEmpty());
    }

    @Test
    public void readsHymnNumbersAndIds() {
        assertEquals("NS151", HymnSearch.hymnIdOf("ns 151", HymnGroup.E));
        assertEquals("E8", HymnSearch.hymnIdOf("e8", HymnGroup.C));
        assertEquals("C123", HymnSearch.hymnIdOf("123", HymnGroup.C));
        assertNull(HymnSearch.hymnIdOf("XX 1", HymnGroup.E));
        assertNull(HymnSearch.hymnIdOf("love 1", HymnGroup.E));
    }

    @Test
    public void theFirstLineComesFirst() {
        List<HymnSearch.Result> r = search("glory be to god the father", HymnGroup.E);
        assertEquals("E1", r.get(0).id);
        assertEquals(HymnSearch.Where.FIRST, r.get(0).where);
    }

    @Test
    public void oneRowPerHymn() {
        List<HymnSearch.Result> r = search("lord", HymnGroup.E);
        Set<String> ids = new HashSet<>();
        for (HymnSearch.Result x : r) assertTrue("twice: " + x.id, ids.add(x.id));
        assertTrue(r.size() > 1000);
    }

    @Test
    public void everyWordMustBeFoundInAnyOrder() {
        for (HymnSearch.Result x : search("father glory", HymnGroup.E)) {
            String row = SearchIndexTestAccess.row(db, x.id);
            assertTrue(x.id, row.contains("father") && row.contains("glory"));
        }
    }

    @Test
    public void aPhraseInQuotesMustBeFoundTogether() {
        List<HymnSearch.Result> words = search("ancient days", HymnGroup.E);
        List<HymnSearch.Result> phrase = search("\"ancient of days\"", HymnGroup.E);
        assertFalse(phrase.isEmpty());
        assertTrue(phrase.size() <= words.size());
        for (HymnSearch.Result x : phrase) assertTrue(x.id, SearchIndexTestAccess.row(db, x.id).contains("ancient of days"));
    }

    @Test
    public void theCurrentBookComesFirstAmongEquals() {
        List<HymnSearch.Result> r = search("lord", HymnGroup.NS);
        for (int i = 1; i < r.size(); i++) {
            HymnSearch.Result a = r.get(i - 1), b = r.get(i);
            if (a.score == b.score) assertFalse(b.id, a.group != HymnGroup.NS && b.group == HymnGroup.NS);
        }
        assertEquals(HymnGroup.NS, r.get(0).group);
    }

    @Test
    public void hiddenBooksAreLeftOut() {
        for (HymnSearch.Result x : search("lord", HymnGroup.E, "E", "NS")) {
            assertNotEquals(HymnGroup.E, x.group);
            assertNotEquals(HymnGroup.NS, x.group);
        }
    }

    @Test
    public void caseAndAccentsAreIgnoredInEveryAlphabet() {
        assertFalse(search("бог", HymnGroup.R).isEmpty());
        assertEquals(search("бог", HymnGroup.R).size(), search("БОГ", HymnGroup.R).size());
        assertFalse(search("jesus", HymnGroup.FR).isEmpty());
        boolean french = false;
        for (HymnSearch.Result x : search("jesus", HymnGroup.FR)) french |= x.group == HymnGroup.FR;
        assertTrue("jesus finds Jésus", french);
    }

    @Test
    public void findsAuthorsSubjectsAndTunes() {
        List<HymnSearch.Result> r = search("watchman nee", HymnGroup.E);
        assertFalse(r.isEmpty());
        boolean byAuthor = false;
        for (HymnSearch.Result x : r) byAuthor |= x.where == HymnSearch.Where.PEOPLE;
        assertTrue(byAuthor);
    }

    @Test
    public void aHymnFindsWhatItTakesFromItsParent() {
        // FR1 has no author or tune of its own: its page shows those of E7
        String fr1 = SearchIndexTestAccess.row(db, "FR1");
        assertTrue(fr1, fr1.contains("margaret jenkins harris"));
        assertTrue(fr1, fr1.contains("334321444254323"));
        boolean found = false;
        for (HymnSearch.Result x : search("margaret jenkins harris", HymnGroup.FR)) found |= x.id.equals("FR1");
        assertTrue(found);
        // BF401 has no stanzas of its own: it shows those of E293
        assertTrue(SearchIndexTestAccess.row(db, "BF401").contains("cleansed in our savior s precious blood"));
    }

    @Test
    public void shortWordsOnlyCountWhole() {
        assertTrue(HymnSearch.isShortWord("c"));
        assertTrue(HymnSearch.isShortWord("de"));
        assertFalse(HymnSearch.isShortWord("god"));
        assertFalse(HymnSearch.isShortWord("神"));
        assertTrue(HymnSearch.found("o god our help", "o"));
        assertFalse(HymnSearch.found("our god", "o"));
        assertTrue(HymnSearch.found("our god", "god"));
        List<HymnSearch.Result> r = search("c major", HymnGroup.E);
        assertFalse(r.isEmpty());
        int english = 0;
        for (HymnSearch.Result x : r) if (x.group == HymnGroup.E) english++;
        assertTrue("c major in English: " + english, english > 100 && english < 300);
        assertEquals(HymnSearch.Where.MUSIC, r.get(0).where);
        assertFalse(search("神", HymnGroup.C).isEmpty());
    }

    @Test
    public void searchIsQuick() {
        long start = System.currentTimeMillis();
        search("love lord", HymnGroup.E);
        long ms = System.currentTimeMillis() - start;
        System.out.println("love lord: " + ms + " ms");
        assertTrue(ms < 2000);
    }

    @Test
    public void foldKeepsEveryCharacterInPlace() {
        String text = "Jésus, ΘΕΟΣ ς Бог";
        String folded = SearchText.fold(text);
        assertEquals(text.length(), folded.length());
        assertEquals("jesus, θεοσ σ бог", folded);
    }

}
