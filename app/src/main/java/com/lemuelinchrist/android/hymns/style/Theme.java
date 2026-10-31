package com.lemuelinchrist.android.hymns.style;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.preference.PreferenceManager;
import androidx.appcompat.app.AppCompatDelegate;
import com.lemuelinchrist.android.hymns.R;

/**
 * The Theme setting (Settings, Theme): System default, Light, Dark or Black. This class only chooses: the colours are
 * in XML, like CSS beside HTML. The night mode picks values/ or values-night/ (themes.xml: the hymn page's colour
 * roles, attrs.xml; colors.xml: the other screens), and Black is an overlay over Dark (ThemeOverlay.Hymns.Black) for
 * the hymn screen: the pre-v5.8 black night mode, kept for reading in a dark room on OLED phones. The book colours
 * stay in HymnGroup; {@link BookColors} uses them as the theme says.
 */
public final class Theme {
    public static final String PREFERENCE = "theme";
    public static final String SYSTEM = "system", LIGHT = "light", DARK = "dark", BLACK = "black";

    private Theme() {
    }

    public static String choice(Context context) {
        return PreferenceManager.getDefaultSharedPreferences(context).getString(PREFERENCE, SYSTEM);
    }

    /** Dark or Black, or System default with the phone dark. */
    public static boolean isNight(Context context) {
        return (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    public static boolean isBlack(Context context) {
        return BLACK.equals(choice(context));
    }

    /**
     * Sets the app's night mode from the setting; on a first start after the update, the old Night Mode switch
     * (nightMode) becomes Dark. Changing the night mode recreates the open screens.
     */
    public static void apply(Context context) {
        SharedPreferences preferences = PreferenceManager.getDefaultSharedPreferences(context);
        if (!preferences.contains(PREFERENCE)) {
            preferences.edit().putString(PREFERENCE, preferences.getBoolean("nightMode", false) ? DARK : SYSTEM).apply();
        }
        apply(choice(context));
    }

    public static void apply(String choice) {
        int mode;
        if (LIGHT.equals(choice)) mode = AppCompatDelegate.MODE_NIGHT_NO;
        else if (DARK.equals(choice) || BLACK.equals(choice)) mode = AppCompatDelegate.MODE_NIGHT_YES;
        else mode = AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;
        if (AppCompatDelegate.getDefaultNightMode() != mode) AppCompatDelegate.setDefaultNightMode(mode);
    }

    /** Black over Dark, for the hymn screen: call before its views are made. */
    public static void applyOverlay(Activity activity) {
        if (isBlack(activity)) activity.getTheme().applyStyle(R.style.ThemeOverlay_Hymns_Black, true);
    }
}
