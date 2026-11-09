package com.lemuelinchrist.android.hymns.settings;

import android.content.Context;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.os.LocaleListCompat;
import com.lemuelinchrist.android.hymns.R;

import java.util.Locale;

/**
 * The Language setting of Settings: the language of the app's own texts (menus, buttons, labels, book names), not of
 * the hymns. "Phone's language" (the default) follows the phone; English, 繁體中文 and 简体中文 are written in their
 * own language, so someone who lands in a language they cannot read still finds theirs. The choice is kept by
 * AppCompat (autoStoreLocales in the manifest; Android 13 and later keep it themselves and also offer it under the
 * phone's App languages), and the open screens are made again in the new language.
 */
public final class LanguageSetting {
    /** the language tags of the choices after "Phone's language": the folders values (English), b+zh+Hant, b+zh+Hans */
    private static final String[] TAGS = {"en", "zh-Hant", "zh-Hans"};
    private static final int[] NAMES = {R.string.language_name_en, R.string.language_name_zh_hant, R.string.language_name_zh_hans};

    private LanguageSetting() {
    }

    /** The name of the current choice, for the Language row. */
    public static String currentName(Context context) {
        int choice = current();
        return context.getString(choice < 0 ? R.string.language_follow_phone : NAMES[choice]);
    }

    public static void showDialog(Context context, Runnable onChange) {
        String[] items = new String[TAGS.length + 1];
        items[0] = context.getString(R.string.language_follow_phone);
        for (int i = 0; i < TAGS.length; i++) items[i + 1] = context.getString(NAMES[i]);
        new AlertDialog.Builder(context)
                .setTitle(R.string.settings_app_language)
                .setSingleChoiceItems(items, current() + 1, (dialog, which) -> {
                    dialog.dismiss();
                    if (which == current() + 1) return;
                    // AppCompat makes the open screens again in the new language
                    AppCompatDelegate.setApplicationLocales(which == 0 ? LocaleListCompat.getEmptyLocaleList()
                            : LocaleListCompat.forLanguageTags(TAGS[which - 1]));
                    onChange.run();
                })
                .setNegativeButton(R.string.cancel, null)
                .show();
    }

    /** The index in TAGS of the chosen language; -1 for the phone's language. */
    static int current() {
        LocaleListCompat chosen = AppCompatDelegate.getApplicationLocales();
        if (chosen.isEmpty() || chosen.get(0) == null) return -1;
        return indexOf(chosen.get(0));
    }

    /**
     * "zh-Hant", "zh-TW", "zh-HK" and "zh-MO" are Traditional, the other Chinese Simplified; any other language
     * English.
     */
    static int indexOf(Locale locale) {
        if (!"zh".equals(locale.getLanguage())) return 0;
        String script = locale.getScript();
        if ("Hant".equals(script)) return 1;
        if ("Hans".equals(script)) return 2;
        String country = locale.getCountry();
        return "TW".equals(country) || "HK".equals(country) || "MO".equals(country) ? 1 : 2;
    }
}
