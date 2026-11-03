package com.lemuelinchrist.android.hymns.dao;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

// lets the search tests build the table in memory (SearchIndex.build is package-private)
public final class SearchIndexTestAccess {

    private SearchIndexTestAccess() {
    }

    public static void build(SQLiteDatabase source, SQLiteDatabase target) {
        SearchIndex.build(source, target);
    }

    /** All the search text of one hymn, joined. */
    public static String row(SQLiteDatabase db, String id) {
        Cursor c = db.rawQuery("SELECT first || ' ' || chorus || ' ' || subject || ' ' || people || ' ' || music"
                + " || ' ' || body FROM search WHERE id = ?", new String[]{id});
        try {
            return c.moveToFirst() ? c.getString(0) : "";
        } finally {
            c.close();
        }
    }
}
