package com.lemuelinchrist.android.hymns;

import android.app.Application;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.content.YoutubeButton;
import com.lemuelinchrist.android.hymns.style.Theme;

/**
 * Sets the night mode from the Theme setting before any screen opens, including the ones opened from outside the app
 * (a favorites backup file), and brings an old YouTube Button setting up to date.
 */
public class HymnsApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        YoutubeButton.migrateSetting(PreferenceManager.getDefaultSharedPreferences(this));
        Theme.apply(this);
    }
}
