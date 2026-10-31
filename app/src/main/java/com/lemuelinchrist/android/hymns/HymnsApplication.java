package com.lemuelinchrist.android.hymns;

import android.app.Application;
import com.lemuelinchrist.android.hymns.style.Theme;

/**
 * Sets the night mode from the Theme setting before any screen opens, including the ones opened from outside the app
 * (a favorites backup file).
 */
public class HymnsApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        Theme.apply(this);
    }
}
