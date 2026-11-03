package com.lemuelinchrist.android.hymns;

import android.content.Context;
import android.content.SharedPreferences;

import com.lemuelinchrist.android.hymns.content.ContentArea;
import com.lemuelinchrist.android.hymns.content.FaveButton;
import com.lemuelinchrist.android.hymns.logbook.LogBook;

import java.util.HashSet;
import java.util.Set;

/**
 * Brings what a person saved under the old book codes up to date, once: in 2026-11 Burmese MY became BUR, Russian R
 * became RUS and French Youth FY became FRY. History and Favorites hold hymn IDs, and the hidden books (Settings,
 * Languages (Hymn Books)) hold book codes. Chord edits are not touched: they are kept per sheet, and no MY, R or FY hymn
 * has a sheet of its own (they use their parent's).
 */
public final class CodeMigration {

    static final String DONE = "codesMigrated2026_11";

    private CodeMigration() {}

    /** Runs once per installation; safe to run again. */
    public static void run(Context context, SharedPreferences preferences) {
        if (preferences.getBoolean(DONE, false)) return;

        LogBook.migrateCodes(context, ContentArea.HISTORY_LOGBOOK_FILE);
        LogBook.migrateCodes(context, FaveButton.FAVE_LOG_BOOK_FILE);

        SharedPreferences.Editor editor = preferences.edit();
        Set<String> hidden = preferences.getStringSet("disableLanguages", null);
        if (hidden != null) {
            Set<String> current = migrateHidden(hidden);
            if (!current.equals(hidden)) editor.putStringSet("disableLanguages", current);
        }
        editor.putBoolean(DONE, true).apply();
    }

    /** The hidden books with their current codes (MY is BUR...). */
    static Set<String> migrateHidden(Set<String> hidden) {
        Set<String> current = new HashSet<>();
        for (String code : hidden) {
            String now = HymnGroup.currentCode(code);
            current.add(now == null ? code : now);
        }
        return current;
    }
}
