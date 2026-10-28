package com.lemuelinchrist.android.hymns.dao;

import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.Log;

import com.lemuelinchrist.android.hymns.search.SearchText;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The {@code search} table: one row per hymn with its first lines, subject, people, music and all of its stanzas in
 * search form ({@link SearchText#norm}). It is built on the phone, in the background, the first time the app runs
 * after an update, so the download stays small (about 1.2 s in a release build on an emulator, 3.5 s in a debug
 * build, a few seconds on a slow phone).
 *
 * <p>It lives in its own file, search.sqlite, so building it never locks hymns.sqlite while the hymn pages read it,
 * and the file is only renamed into place once it is complete. Its user_version is the app's versionCode: an update
 * rebuilds it from the new hymns.sqlite.
 *
 * @since 2026-10-23
 */
public final class SearchIndex {

    private static final String TAG = SearchIndex.class.getSimpleName();
    private static final String FILE = "search.sqlite";
    private static final ExecutorService builder = Executors.newSingleThreadExecutor();
    private static final List<Runnable> waiting = new ArrayList<>();
    private static SQLiteDatabase db;
    private static boolean building;

    private SearchIndex() {
    }

    /** The search database if it is ready, else null (and it starts being built). */
    public static synchronized SQLiteDatabase get(Context context) {
        if (db == null) prepare(context, null);
        return db;
    }

    /**
     * Makes sure the search table exists, building it in the background if needed. {@code onReady} (may be null)
     * runs on the main thread once it is ready.
     */
    public static synchronized void prepare(Context context, Runnable onReady) {
        if (db != null) {
            if (onReady != null) new Handler(Looper.getMainLooper()).post(onReady);
            return;
        }
        if (onReady != null) waiting.add(onReady);
        if (building) return;
        building = true;
        Context app = context.getApplicationContext();
        builder.execute(() -> {
            SQLiteDatabase ready = null;
            try {
                ready = openOrBuild(app);
            } catch (RuntimeException e) {
                Log.e(TAG, "could not build the search table", e);
            }
            List<Runnable> toRun;
            synchronized (SearchIndex.class) {
                db = ready;
                building = false;
                toRun = new ArrayList<>(waiting);
                waiting.clear();
            }
            Handler main = new Handler(Looper.getMainLooper());
            for (Runnable r : toRun) main.post(r);
        });
    }

    private static SQLiteDatabase openOrBuild(Context context) {
        int version = appVersion(context);
        File file = context.getDatabasePath(FILE);
        if (file.exists()) {
            SQLiteDatabase existing = SQLiteDatabase.openDatabase(file.getPath(), null, SQLiteDatabase.OPEN_READONLY);
            if (existing.getVersion() == version) return existing;
            existing.close();
        }

        // copies hymns.sqlite out of the app first, if this is a new install or an update
        HymnsSqliteHelper.getInstance(context);
        File hymns = context.getDatabasePath("hymns.sqlite");
        File temp = context.getDatabasePath(FILE + ".tmp");
        context.deleteDatabase(FILE + ".tmp");
        long start = System.currentTimeMillis();
        SQLiteDatabase source = SQLiteDatabase.openDatabase(hymns.getPath(), null, SQLiteDatabase.OPEN_READONLY);
        SQLiteDatabase target = SQLiteDatabase.openOrCreateDatabase(temp, null);
        try {
            build(source, target);
            target.setVersion(version);
        } finally {
            source.close();
            target.close();
        }
        context.deleteDatabase(FILE);
        if (!temp.renameTo(file)) throw new IllegalStateException("could not rename " + temp);
        new File(temp.getPath() + "-journal").delete();
        Log.i(TAG, "search table built in " + (System.currentTimeMillis() - start) + " ms");
        return SQLiteDatabase.openDatabase(file.getPath(), null, SQLiteDatabase.OPEN_READONLY);
    }

    // id, the book, the number and the first line as shown, then the search form of each part of the hymn. A hymn
    // with a parent takes the parent's author, composer, key, tune, subject and stanzas where it has none, as
    // HymnsDao.get does, so a translation is found by the tune or author shown on its page.
    static void build(SQLiteDatabase source, SQLiteDatabase target) {
        Map<String, String[]> hymns = readHymns(source);
        target.beginTransaction();
        try {
            target.execSQL("DROP TABLE IF EXISTS search");
            target.execSQL("CREATE TABLE search (id TEXT PRIMARY KEY, grp TEXT, no INTEGER, line TEXT, first TEXT,"
                    + " chorus TEXT, subject TEXT, people TEXT, music TEXT, body TEXT)");
            SQLiteStatement insert = target.compileStatement("INSERT INTO search VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

            // the stanzas sorted by hymn ID, like the hymns, so the stanzas of each hymn are read alongside it
            Set<String> withStanzas = new HashSet<>();
            Cursor stanzas = source.rawQuery("SELECT parent_hymn, text FROM stanza WHERE parent_hymn NOT NULL"
                    + " ORDER BY parent_hymn, n_order", null);
            try {
                boolean moreStanzas = stanzas.moveToFirst();
                StringBuilder body = new StringBuilder();
                for (Map.Entry<String, String[]> hymn : hymns.entrySet()) {
                    String id = hymn.getKey();
                    String[] h = inherited(hymns, id);
                    while (moreStanzas && stanzas.getString(0).compareTo(id) < 0) moreStanzas = stanzas.moveToNext();
                    body.setLength(0);
                    while (moreStanzas && stanzas.getString(0).equals(id)) {
                        if (body.length() > 0) body.append(" | ");
                        body.append(SearchText.norm(stanzas.getString(1)));
                        moreStanzas = stanzas.moveToNext();
                    }
                    if (body.length() > 0) withStanzas.add(id);
                    String line = h[FIRST].isEmpty() ? h[CHORUS] : h[FIRST];
                    insert.bindString(1, id);
                    insert.bindString(2, h[GROUP].trim());
                    insert.bindLong(3, number(h[NO]));
                    insert.bindString(4, line);
                    insert.bindString(5, SearchText.norm(h[FIRST]));
                    insert.bindString(6, SearchText.norm(h[CHORUS]));
                    insert.bindString(7, SearchText.norm(h[MAIN_CATEGORY] + " " + h[SUB_CATEGORY]));
                    insert.bindString(8, SearchText.norm(h[AUTHOR] + " " + h[COMPOSER]));
                    insert.bindString(9, SearchText.norm(h[KEY] + " " + h[TUNE]));
                    insert.bindString(10, body.toString());
                    insert.executeInsert();
                }
            } finally {
                stanzas.close();
            }

            // a hymn without stanzas shows those of its nearest forebear that has them
            SQLiteStatement copyBody = target.compileStatement(
                    "UPDATE search SET body = (SELECT body FROM search WHERE id = ?) WHERE id = ?");
            for (String id : hymns.keySet()) {
                if (withStanzas.contains(id)) continue;
                String from = hymns.get(id)[PARENT];
                for (int depth = 0; !from.isEmpty() && hymns.containsKey(from) && depth < 10; depth++) {
                    if (withStanzas.contains(from)) {
                        copyBody.bindString(1, from);
                        copyBody.bindString(2, id);
                        copyBody.executeUpdateDelete();
                        break;
                    }
                    from = hymns.get(from)[PARENT];
                }
            }
            target.setTransactionSuccessful();
        } finally {
            target.endTransaction();
        }
    }

    private static final String[] COLUMNS = {"hymn_group", "no", "first_stanza_line", "first_chorus_line",
            "main_category", "sub_category", "author", "composer", "key", "tune", "parent_hymn"};
    private static final int GROUP = 0, NO = 1, FIRST = 2, CHORUS = 3, MAIN_CATEGORY = 4, SUB_CATEGORY = 5,
            AUTHOR = 6, COMPOSER = 7, KEY = 8, TUNE = 9, PARENT = 10;

    // every hymn's own columns (never null), sorted by hymn ID
    private static Map<String, String[]> readHymns(SQLiteDatabase source) {
        Map<String, String[]> hymns = new LinkedHashMap<>();
        Cursor c = source.rawQuery("SELECT _id, " + TextUtils.join(", ", COLUMNS) + " FROM hymns ORDER BY _id", null);
        try {
            while (c.moveToNext()) {
                String[] h = new String[COLUMNS.length];
                for (int i = 0; i < h.length; i++) h[i] = text(c, i + 1).trim();
                hymns.put(c.getString(0), h);
            }
        } finally {
            c.close();
        }
        return hymns;
    }

    // the hymn's columns with the empty ones its parents fill in (the subject comes with its sub-category)
    private static String[] inherited(Map<String, String[]> hymns, String id) {
        String[] h = hymns.get(id).clone();
        String parent = h[PARENT];
        for (int depth = 0; !parent.isEmpty() && hymns.containsKey(parent) && depth < 10; depth++) {
            String[] p = hymns.get(parent);
            for (int field : new int[]{AUTHOR, COMPOSER, KEY, TUNE}) {
                if (h[field].isEmpty()) h[field] = p[field];
            }
            if (h[MAIN_CATEGORY].isEmpty()) {
                h[MAIN_CATEGORY] = p[MAIN_CATEGORY];
                h[SUB_CATEGORY] = p[SUB_CATEGORY];
            }
            parent = p[PARENT];
        }
        return h;
    }

    private static long number(String no) {
        try {
            return Long.parseLong(no.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static int appVersion(Context context) {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return 0;
        }
    }

    private static String text(Cursor cursor, int column) {
        String s = cursor.getString(column);
        return s == null ? "" : s;
    }
}
