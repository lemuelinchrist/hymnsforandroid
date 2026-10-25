package com.lemuelinchrist.android.hymns.dao;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;

import com.lemuelinchrist.android.hymns.search.SearchText;

/**
 * Builds the {@code search} table: one row per hymn with its first lines, subject, people, music and all of its
 * stanzas in search form ({@link SearchText#norm}). Built on the phone after the database is copied from the app,
 * so the download stays small. See docs/v5.8/v5.8-report.md.
 *
 * @since 2026-10-23
 */
public final class SearchIndex {

    private SearchIndex() {
    }

    public static void build(SQLiteDatabase db) {
        db.beginTransaction();
        try {
            db.execSQL("DROP TABLE IF EXISTS search");
            db.execSQL("CREATE TABLE search (id TEXT PRIMARY KEY, grp TEXT, first TEXT, chorus TEXT, subject TEXT,"
                    + " people TEXT, music TEXT, body TEXT)");
            SQLiteStatement insert = db.compileStatement("INSERT INTO search VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

            // both lists sorted by hymn ID, so the stanzas of each hymn are read alongside it
            Cursor hymns = db.rawQuery("SELECT _id, hymn_group, first_stanza_line, first_chorus_line, main_category,"
                    + " sub_category, author, composer, key, tune FROM hymns ORDER BY _id", null);
            Cursor stanzas = db.rawQuery("SELECT parent_hymn, text FROM stanza WHERE parent_hymn NOT NULL"
                    + " ORDER BY parent_hymn, n_order", null);
            try {
                boolean moreStanzas = stanzas.moveToFirst();
                StringBuilder body = new StringBuilder();
                while (hymns.moveToNext()) {
                    String id = hymns.getString(0);
                    while (moreStanzas && stanzas.getString(0).compareTo(id) < 0) moreStanzas = stanzas.moveToNext();
                    body.setLength(0);
                    while (moreStanzas && stanzas.getString(0).equals(id)) {
                        if (body.length() > 0) body.append(" | ");
                        body.append(SearchText.norm(stanzas.getString(1)));
                        moreStanzas = stanzas.moveToNext();
                    }
                    insert.bindString(1, id);
                    insert.bindString(2, text(hymns, 1));
                    insert.bindString(3, SearchText.norm(text(hymns, 2)));
                    insert.bindString(4, SearchText.norm(text(hymns, 3)));
                    insert.bindString(5, SearchText.norm(text(hymns, 4) + " " + text(hymns, 5)));
                    insert.bindString(6, SearchText.norm(text(hymns, 6) + " " + text(hymns, 7)));
                    insert.bindString(7, SearchText.norm(text(hymns, 8) + " " + text(hymns, 9)));
                    insert.bindString(8, body.toString());
                    insert.executeInsert();
                }
            } finally {
                hymns.close();
                stanzas.close();
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    private static String text(Cursor cursor, int column) {
        String s = cursor.getString(column);
        return s == null ? "" : s;
    }
}
