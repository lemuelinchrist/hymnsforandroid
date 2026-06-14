package com.lemuelinchrist.android.hymns.content.sheetmusic;

import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.ShareActionProvider;
import androidx.appcompat.widget.Toolbar;
import androidx.core.graphics.Insets;
import androidx.core.view.MenuItemCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
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

        // Apply window insets to handle edge-to-edge but hide system bars for true immersive mode
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.sheet_music_layout), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            // No padding needed because we are going full screen!
            return insets;
        });

        // Use modern WindowInsetsController to hide system bars (Full Screen)
        androidx.core.view.WindowInsetsControllerCompat controller = ViewCompat.getWindowInsetsController(getWindow().getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }

        // Make sure your theme has an ActionBar
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }


        // get selected hymn group
        Bundle extras = getIntent().getExtras();
        String selectedHymnId = (String) extras.get("selectedHymnId");
        legacySheetMusic = new LegacySheetMusic(this,selectedHymnId);

        webview = findViewById(R.id.sheet_music_image);
        webview.getSettings().setBuiltInZoomControls(true);
        // disable zoom buttons
        webview.getSettings().setDisplayZoomControls(false);
        webview.loadUrl("file:///android_asset/"+legacySheetMusic.getSvgFolder()+"/" + selectedHymnId + ".svg");
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
        hideSystemUI();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode=WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
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

    private void hideSystemUI() {
        // Enables regular immersive mode.
        // For "lean back" mode, remove SYSTEM_UI_FLAG_IMMERSIVE.
        // Or for "sticky immersive," replace it with SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        View decorView = getWindow().getDecorView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            decorView.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE |
                            // Set the content to appear under the system bars so that the
                            // content doesn't resize when the system bars hide and show.
                            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            // Hide the nav bar and status bar
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }
}
