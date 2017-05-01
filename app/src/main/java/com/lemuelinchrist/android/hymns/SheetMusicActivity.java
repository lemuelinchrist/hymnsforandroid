package com.lemuelinchrist.android.hymns;

import android.app.Activity;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Bundle;
import android.support.v7.app.ActionBar;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.webkit.WebView;

/**
 * Created by lemuel on 30/4/2017.
 */

public class SheetMusicActivity extends AppCompatActivity {
    private ActionBar actionBar;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.sheet_music_activity);

//        actionBar = getSupportActionBar();
//        actionBar.setDisplayHomeAsUpEnabled(true);

        // get selected hymn group
        Bundle extras = getIntent().getExtras();
        String selectedHymnId = (String) extras.get("selectedHymnId");

        WebView webview = (WebView) findViewById(R.id.sheet_music_image);
        webview.getSettings().setBuiltInZoomControls(true);
        webview.loadUrl("file:///android_asset/svg/" + selectedHymnId + ".svg");





    }
}
