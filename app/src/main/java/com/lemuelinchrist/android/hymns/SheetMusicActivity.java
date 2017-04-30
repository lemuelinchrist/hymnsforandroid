package com.lemuelinchrist.android.hymns;

import android.app.Activity;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Bundle;
import android.support.v7.widget.Toolbar;
import android.webkit.WebView;

/**
 * Created by lemuel on 30/4/2017.
 */

public class SheetMusicActivity extends Activity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.sheet_music_activity);
        WebView webview = (WebView) findViewById(R.id.sheet_music_image);
        webview.getSettings().setBuiltInZoomControls(true);
        webview.loadUrl("file:///android_asset/svg/BF3.svg");

        AssetManager assetManager = getAssets();


    }
}
