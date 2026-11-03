package com.lemuelinchrist.android.hymns.content;

import android.content.SharedPreferences;
import android.view.View;
import android.widget.ImageButton;
import androidx.fragment.app.Fragment;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.entities.Hymn;

/**
 * The YouTube button in the button bar: it searches YouTube for the hymn ({@link YouTubeSearchLauncher}). It is shown
 * only when Settings → YouTube Button is on. (The hymn's own piano videos are in the links card, {@link LinksSection}.)
 *
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public class YoutubeButton extends ContentComponent<ImageButton> {

    /** The setting: the button is shown and searches YouTube. Off by default. */
    public static final String SEARCH = "youtubeSearch";
    /** The setting until v5.8.2: "disabled", "piano" (the hymn's videos) or "search". */
    private static final String OLD_SETTING = "youtubeButton";

    public YoutubeButton(final Hymn hymn, final Fragment parentFragment, ImageButton imageButton) {
        super(hymn, parentFragment, imageButton);

        if (!PreferenceManager.getDefaultSharedPreferences(context).getBoolean(SEARCH, false)) {
            imageButton.setVisibility(View.GONE);
        }

        imageButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                logToHistory();
                new YouTubeSearchLauncher(context).launch(hymn);
            }
        });
    }

    /**
     * Turns the old three-way setting into the switch, once: "search" is on, "disabled" and "piano" are off (the piano
     * videos are in the links card now).
     */
    public static void migrateSetting(SharedPreferences preferences) {
        if (!preferences.contains(OLD_SETTING)) return;
        boolean search = "search".equals(preferences.getString(OLD_SETTING, "disabled"));
        preferences.edit().putBoolean(SEARCH, search).remove(OLD_SETTING).apply();
    }
}
