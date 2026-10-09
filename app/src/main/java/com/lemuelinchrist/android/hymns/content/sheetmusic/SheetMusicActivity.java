package com.lemuelinchrist.android.hymns.content.sheetmusic;

import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.ShareActionProvider;
import androidx.appcompat.widget.Toolbar;
import androidx.core.graphics.Insets;
import androidx.core.view.MenuItemCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.preference.PreferenceManager;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import com.lemuelinchrist.android.hymns.R;

import java.io.IOException;
import java.io.InputStream;

/**
 * Created by lemuel on 30/4/2017.
 */

public class SheetMusicActivity extends AppCompatActivity {
    private static final String MEI_FOLDER = "sheetMei";
    private static final String VIEWER_CLOSE_SCHEME = "hymnsviewer";
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
        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(this);

        if (sharedPreferences.getBoolean("newSheetMusicViewer", false) && hasMei(selectedHymnId)) {
            loadNewViewer(selectedHymnId);
        } else {
            webview.getSettings().setBuiltInZoomControls(true);
            // disable zoom buttons
            webview.getSettings().setDisplayZoomControls(false);
            webview.loadUrl("file:///android_asset/"+legacySheetMusic.getSvgFolder()+"/" + selectedHymnId + ".svg");
            // zoom out by default
            webview.getSettings().setUseWideViewPort(true);
            webview.getSettings().setLoadWithOverviewMode(true);
            webview.setInitialScale(1);
        }


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

    private boolean hasMei(String hymnId) {
        try (InputStream ignored = getAssets().open(MEI_FOLDER + "/" + hymnId + ".mei")) {
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * The new viewer (assets/viewer) renders assets/sheetMei/<id>.mei with Verovio to fit the screen width.
     * Assets are served over https by WebViewAssetLoader, since the page fetches the MEI file.
     */
    private void loadNewViewer(String hymnId) {
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webview.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            // the viewer's back button navigates to hymnsviewer://close
            @Override
            public boolean shouldOverrideUrlLoading(@NonNull WebView view, @NonNull WebResourceRequest request) {
                return closeIfRequested(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {   // before API 24
                return closeIfRequested(Uri.parse(url));
            }
        });
        webview.getSettings().setJavaScriptEnabled(true);
        webview.getSettings().setAllowFileAccess(false);
        String variant = "guitarSvg".equals(legacySheetMusic.getSvgFolder()) ? "guitar" : "piano";
        boolean dark = sharedPreferences.getBoolean("nightMode", false);
        webview.loadUrl("https://" + WebViewAssetLoader.DEFAULT_DOMAIN + "/assets/viewer/index.html?id="
                + Uri.encode(hymnId) + "&variant=" + variant + "&dark=" + (dark ? "1" : "0"));
    }

    private boolean closeIfRequested(Uri url) {
        if (!VIEWER_CLOSE_SCHEME.equals(url.getScheme())) return false;
        finish();
        return true;
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
