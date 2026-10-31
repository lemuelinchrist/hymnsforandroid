package com.lemuelinchrist.android.hymns.style;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.preference.PreferenceManager;
import androidx.appcompat.app.AppCompatDelegate;
import com.lemuelinchrist.android.hymns.HymnGroup;

/**
 * The hymn page's colours. The setting "theme" (Settings, Theme) is System default, Light, Dark or Black; the other
 * screens follow it through the day/night resources (values-night), the hymn page through this enum, which also has
 * Black: today's pure black page, kept for reading in a dark room on OLED phones.
 *
 * Dark follows Material's dark theme: dark grey rather than black, the cards a little lighter, off-white text, the
 * books' lighter night colours, and the bars in a dimmed book colour.
 */
public enum Theme {

    LIGHT(Color.WHITE, Color.WHITE, 0xFF4e4e4e, 0xFFEEF1F4) {
        @Override
        public int getActionBarColor(HymnGroup hymnGroup) {
            return hymnGroup.getDayColor();
        }

        @Override
        public int getButtonBarColor(HymnGroup hymnGroup) {
            return hymnGroup.getDayColor();
        }

        @Override
        public int getTextColor(HymnGroup hymnGroup) {
            return hymnGroup.getDayColor();
        }
    },
    DARK(0xFF121316, 0xFF1d1f23, 0xFFe3e4e7, 0xFF2e3137) {
        @Override
        public int getActionBarColor(HymnGroup hymnGroup) {
            return mix(hymnGroup.getDayColor(), getCardColor(), 0.55f);
        }

        @Override
        public int getButtonBarColor(HymnGroup hymnGroup) {
            return mix(hymnGroup.getDayColor(), getCardColor(), 0.7f);
        }
    },
    BLACK(Color.BLACK, Color.BLACK, 0xFFcccccc, 0xFF2A2A2A) {
        @Override
        public int getActionBarColor(HymnGroup hymnGroup) {
            return Color.BLACK;
        }

        @Override
        public int getButtonBarColor(HymnGroup hymnGroup) {
            return Color.BLACK;
        }
    };

    public static final String PREFERENCE = "theme";
    public static final String SYSTEM = "system", LIGHT_CHOICE = "light", DARK_CHOICE = "dark", BLACK_CHOICE = "black";

    private final int pageColor;
    private final int cardColor;
    private final int textColor;
    private final int badgeColor;

    Theme(int pageColor, int cardColor, int textColor, int badgeColor) {
        this.pageColor = pageColor;
        this.cardColor = cardColor;
        this.textColor = textColor;
        this.badgeColor = badgeColor;
    }

    /** The theme in use: the setting, with System default (and Dark, Black) resolved by the context's night mode. */
    public static Theme of(Context context) {
        boolean night = (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        if (!night) return LIGHT;
        return BLACK_CHOICE.equals(choice(context)) ? BLACK : DARK;
    }

    private static String choice(Context context) {
        return PreferenceManager.getDefaultSharedPreferences(context).getString(PREFERENCE, SYSTEM);
    }

    /**
     * Sets the app's night mode from the setting; on a first start after the update, the old Night Mode switch
     * (nightMode) becomes Dark. Changing the night mode recreates the open screens.
     */
    public static void apply(Context context) {
        SharedPreferences preferences = PreferenceManager.getDefaultSharedPreferences(context);
        if (!preferences.contains(PREFERENCE)) {
            preferences.edit().putString(PREFERENCE, preferences.getBoolean("nightMode", false) ? DARK_CHOICE : SYSTEM).apply();
        }
        apply(choice(context));
    }

    public static void apply(String choice) {
        int mode;
        if (LIGHT_CHOICE.equals(choice)) mode = AppCompatDelegate.MODE_NIGHT_NO;
        else if (DARK_CHOICE.equals(choice) || BLACK_CHOICE.equals(choice)) mode = AppCompatDelegate.MODE_NIGHT_YES;
        else mode = AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;
        if (AppCompatDelegate.getDefaultNightMode() != mode) AppCompatDelegate.setDefaultNightMode(mode);
    }

    public boolean isNight() {
        return this != LIGHT;
    }

    /** Behind the cards. */
    public int getPageColor() {
        return pageColor;
    }

    public int getCardColor() {
        return cardColor;
    }

    public int getTextColor() {
        return textColor;
    }

    public int getTextBackgroundColor() {
        return cardColor;
    }

    /** The count beside OTHER LANGUAGES. */
    public int getBadgeColor() {
        return badgeColor;
    }

    public ColorDrawable getActionBarDrawable(HymnGroup hymnGroup) {
        return new ColorDrawable(getActionBarColor(hymnGroup));
    }

    public abstract int getActionBarColor(HymnGroup hymnGroup);

    /** The pill holding the hymn's buttons. */
    public abstract int getButtonBarColor(HymnGroup hymnGroup);

    /** Stanza numbers, the chorus and the "Hide" link: the book's colour, its lighter tone at night. */
    public int getTextColor(HymnGroup hymnGroup) {
        return hymnGroup.getNightColor();
    }

    /** a in the share t, b in the rest */
    static int mix(int a, int b, float t) {
        return Color.rgb(Math.round(Color.red(a) * t + Color.red(b) * (1 - t)),
                Math.round(Color.green(a) * t + Color.green(b) * (1 - t)),
                Math.round(Color.blue(a) * t + Color.blue(b) * (1 - t)));
    }
}
