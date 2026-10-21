package com.lemuelinchrist.android.hymns.logbook;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.List;

import static org.junit.Assert.*;

public class FavoritesBackupTest {

    private static List<String> ids(String text) {
        return FavoritesBackup.findHymnIds(text);
    }

    @Test
    public void readsTheFirstWordOfEachLine() {
        String text = "My favorite hymns (Hymns For Android): 3 hymns\n\n" +
                "To put them back: open this file with the Hymns app,\n\n" +
                "E8 – Praise God, from whom all blessings flow;\n" +
                "C100 – 主已復活，\n" +
                "FY18 – Viens, goûte et vois : le Seigneur est bon !\n";
        assertEquals(Arrays.asList("E8", "C100", "FY18"), ids(text));
    }

    @Test
    public void ignoresEmailQuotingAndOtherLines() {
        String text = "Fwd: My favorite hymns\r\n\r\n> E1 – Glory be to God the Father,\r\n>> NS47 – Known of my Father\r\n" +
                "- FR216 – Gloire\r\n\r\nSent from my iPhone\r\n";
        assertEquals(Arrays.asList("E1", "NS47", "FR216"), ids(text));
    }

    @Test
    public void onlyTheFirstWordCountsOnALineWithAFirstLine() {
        // "E2" and "C215" inside the first line are not favorites
        assertEquals(Collections.singletonList("E1"), ids("E1 – sing E2, C215 and more"));
    }

    @Test
    public void readsTheOldCommaFormat() {
        assertEquals(Arrays.asList("E1", "C215", "NS10012"), ids("E1,C215,NS10012,"));
        assertEquals(Arrays.asList("e1", "C215", "NS151"), ids("e1, C215 ,NS151;"));
    }

    @Test
    public void keepsTheFirstOfRepeatedHymns() {
        assertEquals(Arrays.asList("E1", "E8"), ids("E1 – a\nE8 – b\nE1 – c"));
    }

    @Test
    public void findsNothingInOtherText() {
        assertTrue(ids("").isEmpty());
        assertTrue(ids("Hello,\nSee you at 7.\nPraise the Lord!").isEmpty());
        assertTrue(ids("ABCD1234 – too many letters\n12 – no letters").isEmpty());
    }

    @Test
    public void backupTextListsTheFavoritesInOrder() {
        HymnRecord[] favorites = {
                new HymnRecord("E8", "E", "Praise God, from whom all blessings flow; ", new Date(2)),
                new HymnRecord("C100", "C", "主已復活，", new Date(1)),
                new HymnRecord("FR216", "FR", null, new Date(0)),
        };
        String text = FavoritesBackup.formatBackupText(favorites);

        assertTrue(text, text.startsWith("My favorite hymns (Hymns For Android): 3 hymns\n"));
        assertTrue(text, text.endsWith("\n\nE8 – Praise God, from whom all blessings flow;\nC100 – 主已復活，\nFR216\n"));
        assertTrue(FavoritesBackup.formatBackupText(new HymnRecord[]{favorites[0]}).contains(": 1 hymn\n"));
    }

    @Test
    public void restoreReadsBackWhatBackUpWrote() {
        // a first line that starts with a hymn-number-like word, or has commas, must not confuse it
        HymnRecord[] favorites = {
                new HymnRecord("NS47", "NS", "Known of my Father before time began,", new Date(3)),
                new HymnRecord("E1", "E", "E2, C215, glory", new Date(2)),
                new HymnRecord("SW10", "SW", "Yesu, Yesu, Yesu", new Date(1)),
                new HymnRecord("BF100", "BF", null, new Date(0)),
        };
        assertEquals(Arrays.asList("NS47", "E1", "SW10", "BF100"), ids(FavoritesBackup.formatBackupText(favorites)));
        assertTrue(ids(FavoritesBackup.formatBackupText(new HymnRecord[0])).isEmpty());
    }
}
