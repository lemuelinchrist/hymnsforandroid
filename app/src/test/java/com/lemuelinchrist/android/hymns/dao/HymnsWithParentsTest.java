package com.lemuelinchrist.android.hymns.dao;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.File;

import static org.junit.Assert.*;

// the Search tab's Authors, Tunes and Subjects lists show what each hymn's page shows, parents' values included
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class HymnsWithParentsTest {

    private SQLiteDatabase db;

    @Before
    public void open() {
        File hymns = new File("src/main/assets/hymns.sqlite");
        assertTrue("run the build first: " + hymns.getAbsolutePath(), hymns.exists());
        db = SQLiteDatabase.openDatabase(hymns.getPath(), null, SQLiteDatabase.OPEN_READONLY);
    }

    @After
    public void close() {
        db.close();
    }

    private String[] row(String id, String... columns) {
        Cursor c = db.rawQuery("select " + String.join(", ", columns) + " from " + HymnsDao.HYMNS_WITH_PARENTS
                + " where _id = ?", new String[]{id});
        try {
            assertTrue(id, c.moveToFirst());
            String[] values = new String[columns.length];
            for (int i = 0; i < values.length; i++) values[i] = c.getString(i);
            return values;
        } finally {
            c.close();
        }
    }

    private int count(String where) {
        Cursor c = db.rawQuery("select count(*) from " + HymnsDao.HYMNS_WITH_PARENTS + " where " + where, null);
        try {
            c.moveToFirst();
            return c.getInt(0);
        } finally {
            c.close();
        }
    }

    @Test
    public void aTranslationShowsItsParentsAuthorAndTune() {
        // FR1 has no author or tune of its own: its page shows those of E7
        String[] fr1 = row("FR1", "author", "tune", "first_stanza_line");
        String[] e7 = row("E7", "author", "tune");
        assertEquals(e7[0], fr1[0]);
        assertEquals(e7[1], fr1[1]);
        assertNotNull(fr1[2]);
    }

    @Test
    public void ownValuesComeFirst() {
        Cursor c = db.rawQuery("select h.author, w.author from hymns h join " + HymnsDao.HYMNS_WITH_PARENTS
                + " w on w._id = h._id where nullif(h.author, '') is not null", null);
        try {
            while (c.moveToNext()) assertEquals(c.getString(0), c.getString(1));
        } finally {
            c.close();
        }
    }

    @Test
    public void everyHymnOnceAndTranslatedBooksHaveAuthors() {
        assertEquals(count("1"), count("_id in (select _id from hymns)"));
        assertTrue(count("hymn_group = 'FR' and author is not null") > 200);
        assertTrue(count("hymn_group = 'R' and main_category is not null") > 500);
    }

    @Test
    public void theSubCategoryComesWithItsSubject() {
        Cursor c = db.rawQuery("select w._id from " + HymnsDao.HYMNS_WITH_PARENTS + " w join hymns h on h._id = w._id"
                + " join hymns p on p._id = h.parent_hymn where nullif(h.main_category, '') is null"
                + " and nullif(p.main_category, '') is not null"
                + " and ifnull(w.sub_category, '') != ifnull(p.sub_category, '')", null);
        try {
            assertEquals(0, c.getCount());
        } finally {
            c.close();
        }
    }
}
