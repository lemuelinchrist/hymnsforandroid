package com.lemuelinchrist.android.hymns.content.sheetmusic;

import android.content.ActivityNotFoundException;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.MenuItem;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import android.util.Base64;
import android.util.Log;
import java.io.OutputStream;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.preference.PreferenceManager;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import com.lemuelinchrist.android.hymns.HymnGroup;
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
    private WebView webview;
    private SharedPreferences sharedPreferences;
    /** Preference: in the dark theme, show the sheet on light paper (set by the viewer's paper button). */
    private static final String LIGHT_PAPER = "sheetLightPaper";
    private Insets cutout = Insets.NONE;   // the camera cutout's safe insets, in pixels
    private int keyboard = 0;              // the height of the on-screen keyboard, in pixels
    private ChordEdits chordEdits;
    // Save MIDI: the file the viewer made, kept while the reader chooses where it goes
    private byte[] pendingFile;
    private ActivityResultLauncher<String> saveMidiLauncher;
    // while the chord editor is open, Back closes it instead of the sheet
    private final OnBackPressedCallback closeEditorOnBack = new OnBackPressedCallback(false) {
        @Override
        public void handleOnBackPressed() {
            if (webview != null) webview.evaluateJavascript("window.closeEditor && closeEditor()", null);
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
        String selectedHymnId = extras == null ? null : extras.getString("selectedHymnId");
        String lyricsHymnId = extras == null ? null : extras.getString("lyricsHymnId");
        String tune = extras == null ? null : extras.getString("tune");

        webview = findViewById(R.id.sheet_music_image);
        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(this);
        chordEdits = new ChordEdits(this);
        saveMidiLauncher = registerForActivityResult(new ActivityResultContracts.CreateDocument("audio/midi"), this::writePendingFile);
        getOnBackPressedDispatcher().addCallback(this, closeEditorOnBack);

        if (selectedHymnId == null || !hasMei(selectedHymnId)) {
            Toast.makeText(this, R.string.sorry_sheet_music_not_available, Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        loadNewViewer(selectedHymnId, lyricsHymnId, tune);

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
     * The viewer (assets/viewer) is the web app's sheet with its toolbar (tools/web/src, copied in by app/build.gradle;
     * the page around it is tools/web/android): it renders assets/sheetMei/<id>.mei with Verovio to fit the screen
     * width. Assets are served over https by WebViewAssetLoader, since the page fetches the MEI file, and res/raw for
     * the tune, whose tempo the sheet is played at.
     */
    private void loadNewViewer(String hymnId, String lyricsHymnId, String tune) {
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/res/", new WebViewAssetLoader.ResourcesPathHandler(this))
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
        // the viewer keeps its settings as the web app does (the zoom, Both hands and its style, light paper)
        webview.getSettings().setDomStorageEnabled(true);
        // the sheet is played when the reader presses Play
        webview.getSettings().setMediaPlaybackRequiresUserGesture(true);
        webview.addJavascriptInterface(new EditsBridge(hymnId), "HymnsEdits");
        String variant = "guitarSvg".equals(sharedPreferences.getString("sheetMusicType", "pianoSvg")) ? "guitar" : "piano";
        boolean dark = Theme.isNight(this);
        String theme = !dark ? "light" : Theme.isBlack(this) ? "black" : "dark";
        // the hymn's book colour (of the hymn shown, which may borrow another book's sheet): the viewer's accent
        String accent = "";
        try {
            HymnGroup group = HymnGroup.getHymnGroupFromID(lyricsHymnId != null ? lyricsHymnId : hymnId);
            accent = "&accent=" + Uri.encode(hex(group.getDayColor())) + "&accentNight=" + Uri.encode(hex(group.getNightColor()));
        } catch (Exception e) {
            // an unknown book: the viewer keeps its own accent
        }
        webview.loadUrl("https://" + WebViewAssetLoader.DEFAULT_DOMAIN + "/assets/viewer/index.html?id="
                + Uri.encode(hymnId) + "&variant=" + variant + "&theme=" + theme
                + (dark && sharedPreferences.getBoolean(LIGHT_PAPER, false) ? "&paper=light" : "")
                + accent
                + (lyricsHymnId != null ? "&lyrics=" + Uri.encode(lyricsHymnId) : "")
                + (tune != null ? "&tune=" + Uri.encode(tune) : "")
                + "&lang=" + getString(R.string.ui_language));
    }

    private static String hex(int color) {
        return String.format(Locale.ROOT, "#%06x", color & 0xFFFFFF);
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

        /** The bar's paper button (dark theme only): the sheet on light paper, kept for the next sheet. */
        @JavascriptInterface
        public void setLightPaper(boolean on) {
            sharedPreferences.edit().putBoolean(LIGHT_PAPER, on).apply();
        }

        /** Save MIDI: the sheet as a MIDI file (base64), saved where the reader chooses. */
        @JavascriptInterface
        public void saveFile(String name, String base64) {
            byte[] data;
            try {
                data = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                return;
            }
            String fileName = name != null && name.matches("[\\w.-]{1,80}") ? name : "sheet.mid";
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                pendingFile = data;
                try {
                    saveMidiLauncher.launch(fileName);
                } catch (ActivityNotFoundException e) {
                    pendingFile = null;
                    Toast.makeText(SheetMusicActivity.this, R.string.file_not_saved_there, Toast.LENGTH_LONG).show();
                }
            });
        }

        /**
         * Print in the viewer's menu: the page as it is now (the viewer has laid it out for paper and hidden the rest)
         * goes to Android's printing; when the job is done or cancelled the viewer is told (window.afterPrint) and
         * shows the sheet for the screen again.
         */
        @JavascriptInterface
        public void print(String title) {
            String job = title != null && !title.trim().isEmpty() ? title.trim() : getString(R.string.app_name);
            runOnUiThread(() -> {
                if (webview == null || isFinishing() || isDestroyed()) return;
                WebView page = webview;
                PrintDocumentAdapter inner = page.createPrintDocumentAdapter(job);
                PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
                    @Override
                    public void onStart() {
                        inner.onStart();
                    }

                    @Override
                    public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancel,
                                         LayoutResultCallback callback, Bundle extras) {
                        inner.onLayout(oldAttributes, newAttributes, cancel, callback, extras);
                    }

                    @Override
                    public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancel,
                                        WriteResultCallback callback) {
                        inner.onWrite(pages, destination, cancel, callback);
                    }

                    @Override
                    public void onFinish() {
                        inner.onFinish();
                        page.evaluateJavascript("window.afterPrint && window.afterPrint()", null);
                    }
                };
                try {
                    PrintManager printManager = (PrintManager) getSystemService(PRINT_SERVICE);
                    printManager.print(job, adapter, new PrintAttributes.Builder().build());
                } catch (RuntimeException e) {
                    Log.e(getClass().getName(), "Could not print the sheet", e);
                    page.evaluateJavascript("window.afterPrint && window.afterPrint()", null);
                }
            });
        }

        @JavascriptInterface
        public void setEditing(boolean on) {
            runOnUiThread(() -> closeEditorOnBack.setEnabled(on));
        }
    }

    private void writePendingFile(Uri uri) {
        byte[] data = pendingFile;
        pendingFile = null;
        if (uri == null || data == null) return;
        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new IOException("no stream");
            out.write(data);
            Toast.makeText(this, R.string.midi_saved, Toast.LENGTH_SHORT).show();
        } catch (IOException | RuntimeException e) {
            Log.e(getClass().getName(), "Could not save the MIDI file", e);
            Toast.makeText(this, R.string.file_not_saved_there, Toast.LENGTH_LONG).show();
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

    /** Leaving the viewer (Back, Home, another app, the screen off) stops the sheet: a looping sheet must not play on behind the app. */
    @Override
    protected void onPause() {
        if (webview != null) {
            webview.evaluateJavascript("window.stopPlaying && stopPlaying()", null);
            webview.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webview != null) webview.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webview != null) {
            // a WebView that is only dropped keeps running (and its audio playing) until the process ends
            ViewGroup parent = (ViewGroup) webview.getParent();
            if (parent != null) parent.removeView(webview);
            webview.destroy();
            webview = null;
        }
        super.onDestroy();
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
