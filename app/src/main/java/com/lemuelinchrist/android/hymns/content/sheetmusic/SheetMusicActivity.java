package com.lemuelinchrist.android.hymns.content.sheetmusic;

import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.MenuItem;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.preference.PreferenceManager;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.logbook.ChordEdits;
import com.lemuelinchrist.android.hymns.style.Theme;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/**
 * Created by lemuel on 30/4/2017.
 */

public class SheetMusicActivity extends AppCompatActivity {
    private static final String MEI_FOLDER = "sheetMei";
    private static final String VIEWER_CLOSE_SCHEME = "hymnsviewer";
    // chord editing needs room for the sheet and the editor below it: tablets and unfolded phones
    private static final int EDITING_MIN_WIDTH_DP = 600;
    private WebView webview;
    private SharedPreferences sharedPreferences;
    private Insets cutout = Insets.NONE;   // the camera cutout's safe insets, in pixels
    private int keyboard = 0;              // the height of the on-screen keyboard, in pixels
    private ChordEdits chordEdits;
    // while the chord editor is open, Back closes it instead of the sheet
    private final OnBackPressedCallback closeEditorOnBack = new OnBackPressedCallback(false) {
        @Override
        public void handleOnBackPressed() {
            webview.evaluateJavascript("window.closeEditor && closeEditor()", null);
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.sheet_music_activity);

        // Apply window insets to handle edge-to-edge but hide system bars for true immersive mode
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.sheet_music_layout), (v, insets) -> {
            // No padding needed because we are going full screen! The new viewer keeps its bar clear of the camera
            // cutout itself, so it is told where the cutout is.
            cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            sendCutoutToViewer();
            keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            v.post(this::sendKeyboardToViewer);   // once the layout has taken the keyboard into account
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
        String lyricsHymnId = (String) extras.get("lyricsHymnId");

        webview = findViewById(R.id.sheet_music_image);
        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(this);
        chordEdits = new ChordEdits(this);
        getOnBackPressedDispatcher().addCallback(this, closeEditorOnBack);

        if (!hasMei(selectedHymnId)) {
            Toast.makeText(this, "Sorry! Sheet music not available", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        loadNewViewer(selectedHymnId, lyricsHymnId);

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
    private void loadNewViewer(String hymnId, String lyricsHymnId) {
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webview.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            // the viewer's back button navigates to hymnsviewer://close; no other page may load (they would see
            // the chord edits bridge)
            @Override
            public boolean shouldOverrideUrlLoading(@NonNull WebView view, @NonNull WebResourceRequest request) {
                return closeIfRequested(request.getUrl()) || !isViewerPage(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {   // before API 24
                return closeIfRequested(Uri.parse(url)) || !isViewerPage(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                sendCutoutToViewer();   // the insets usually arrive before the page can take them
            }
        });
        webview.getSettings().setJavaScriptEnabled(true);
        webview.getSettings().setAllowFileAccess(false);
        webview.addJavascriptInterface(new EditsBridge(hymnId), "HymnsEdits");
        boolean editable = getResources().getConfiguration().smallestScreenWidthDp >= EDITING_MIN_WIDTH_DP;
        String variant = "guitarSvg".equals(sharedPreferences.getString("sheetMusicType", "pianoSvg")) ? "guitar" : "piano";
        boolean dark = Theme.of(this).isNight();
        webview.loadUrl("https://" + WebViewAssetLoader.DEFAULT_DOMAIN + "/assets/viewer/index.html?id="
                + Uri.encode(hymnId) + "&variant=" + variant + "&dark=" + (dark ? "1" : "0")
                + (lyricsHymnId != null ? "&lyrics=" + Uri.encode(lyricsHymnId) : "")
                + (editable ? "&edit=1" : ""));
    }

    private static boolean isViewerPage(Uri url) {
        return "https".equals(url.getScheme()) && WebViewAssetLoader.DEFAULT_DOMAIN.equals(url.getHost());
    }

    /**
     * window.HymnsEdits in the viewer page: this device's chord edits of the sheet being shown (ChordEdits), and
     * whether the editor is open. The page calls it on its own thread.
     */
    private class EditsBridge {
        private final String sheetId;

        EditsBridge(String sheetId) {
            this.sheetId = sheetId;
        }

        @JavascriptInterface
        public String get(String id) {
            return sheetId.equals(id) ? chordEdits.getBars(id) : "{}";
        }

        @JavascriptInterface
        public boolean put(String id, String bars) {
            return sheetId.equals(id) && chordEdits.putBars(id, bars);
        }

        @JavascriptInterface
        public void setEditing(boolean on) {
            runOnUiThread(() -> closeEditorOnBack.setEnabled(on));
        }
    }

    /** Tells the viewer page where the camera cutout is (CSS pixels), so the bar and music stay clear of it. */
    private void sendCutoutToViewer() {
        if (webview == null) return;
        float density = getResources().getDisplayMetrics().density;
        webview.evaluateJavascript(String.format(Locale.ROOT, "window.setInsets && setInsets(%.1f, %.1f, %.1f, %.1f)",
                cutout.top / density, cutout.right / density, cutout.bottom / density, cutout.left / density), null);
    }

    /**
     * Tells the viewer how much of it the on-screen keyboard covers (CSS pixels), so the chord editor stays above it.
     * Where the window shrinks for the keyboard instead, nothing is covered.
     */
    private void sendKeyboardToViewer() {
        if (webview == null) return;
        int[] at = new int[2];
        webview.getLocationOnScreen(at);
        int screenBottom = getWindow().getDecorView().getHeight();
        int covered = keyboard == 0 ? 0 : Math.max(0, at[1] + webview.getHeight() - (screenBottom - keyboard));
        float density = getResources().getDisplayMetrics().density;
        webview.evaluateJavascript(String.format(Locale.ROOT, "window.setKeyboard && setKeyboard(%.1f)", covered / density), null);
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
