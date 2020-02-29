package com.lemuelinchrist.android.hymns.sheetmusic;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.ShareActionProvider;
import androidx.core.view.MenuItemCompat;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.R;

/**
 * Created by lemuel on 30/4/2017.
 */

public class SheetMusicActivity extends AppCompatActivity {
    private WebView webview;
    private ShareActionProvider shareActionProvider;
    private LegacySheetMusic legacySheetMusic;
    private SharedPreferences sharedPreferences;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.sheet_music_activity);

        ActionBar actionBar = getSupportActionBar();
        actionBar.hide();

        // get selected hymn group
        Bundle extras = getIntent().getExtras();
        String selectedHymnId = (String) extras.get("selectedHymnId");
        legacySheetMusic = new LegacySheetMusic(this,selectedHymnId);

        webview = findViewById(R.id.sheet_music_image);
        webview.getSettings().setBuiltInZoomControls(true);
        webview.loadUrl("file:///android_asset/svg/" + selectedHymnId + ".svg");
        // zoom out by default
        webview.getSettings().setUseWideViewPort(true);
        webview.getSettings().setLoadWithOverviewMode(true);
        webview.setInitialScale(1);

        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(this);
        if(sharedPreferences.getBoolean("keepDisplayOn",false)) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.sheet_music_menu, menu);
        MenuItem item = menu.findItem(R.id.sheet_music_share);
        shareActionProvider = (ShareActionProvider) MenuItemCompat.getActionProvider(item);

        try {
            shareActionProvider.setShareIntent(legacySheetMusic.shareSvgAsIntent());
        } catch (Exception e) {
            Log.e(getClass().getName(),"something went wrong! ",e);
        }
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        switch (item.getItemId()) {
            // Respond to the action bar's Up/Home button
            case android.R.id.home:
                finish();
                return true;
        }
        return super.onOptionsItemSelected(item);
    }
}
