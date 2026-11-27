package com.lemuelinchrist.android.hymns.content;

import android.content.SharedPreferences;
import android.view.ContextThemeWrapper;
import android.view.View;
import android.widget.ImageButton;
import androidx.appcompat.widget.PopupMenu;
import androidx.fragment.app.Fragment;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.entities.Hymn;

/**
 * The YouTube button in the button bar: a tap opens a drop-down to search YouTube or SoundCloud for the hymn ({@link YouTubeSearchLauncher}). It is shown
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
                showMenu(v, hymn);
            }
        });
    }

    /** The drop-down under the button: search YouTube or SoundCloud for the hymn, each with its icon. */
    private void showMenu(View anchor, final Hymn hymn) {
        // the DayNight overlay gives the menu readable text in Light, Dark and Black (it showed pale text on a pale menu)
        PopupMenu menu = new PopupMenu(new ContextThemeWrapper(context, androidx.appcompat.R.style.ThemeOverlay_AppCompat_DayNight), anchor);
        menu.getMenu().add(0, R.id.search_youtube, 0, R.string.search_youtube).setIcon(R.drawable.ic_youtube_24dp);
        menu.getMenu().add(0, R.id.search_soundcloud, 1, R.string.search_soundcloud).setIcon(R.drawable.ic_soundcloud_24dp);
        menu.setForceShowIcon(true);
        menu.setOnMenuItemClickListener(item -> {
            YouTubeSearchLauncher launcher = new YouTubeSearchLauncher(context);
            if (item.getItemId() == R.id.search_soundcloud) launcher.launchSoundCloud(hymn);
            else launcher.launch(hymn);
            return true;
        });
        menu.show();
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
