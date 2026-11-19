package com.lemuelinchrist.android.hymns.content.sheetmusic;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import com.lemuelinchrist.android.hymns.logbook.ChordEdits;

import java.util.regex.Pattern;

/**
 * Plays a hymn's sheet music for the Play button, in a WebView nobody sees: assets/viewer/play.html runs the sheet
 * viewer's own player (tools/web/android/play.js), so the sound is the one the viewer's Play makes. It is used for a
 * hymn with no MIDI file and for a sheet of our own. The page loops the sheet until {@link #stop()}.
 * One player at a time; its WebView is dropped after a while without playing.
 */
public final class SheetPlayer {
    private static final String TAG = "SheetPlayer";
    private static final Pattern SHEET_ID = Pattern.compile("[A-Za-z0-9_-]{1,32}");
    private static final long IDLE_MS = 2 * 60 * 1000L;
    private static SheetPlayer instance;

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable dropWebView = this::drop;
    private WebView webview;
    private boolean ready;
    private String wanted;   // the sheet to play as soon as the page is loaded

    private SheetPlayer(Context context) {
        this.context = context.getApplicationContext();
    }

    public static synchronized SheetPlayer get(Context context) {
        if (instance == null) instance = new SheetPlayer(context);
        return instance;
    }

    /** Whether the sheet is being played (or is about to). */
    public boolean isPlaying() {
        return wanted != null;
    }

    /** Plays the sheet (assets/sheetMei/&lt;id&gt;.mei) from the start. Call it on the main thread. */
    public void play(String sheetId) {
        if (sheetId == null || !SHEET_ID.matcher(sheetId).matches()) return;
        handler.removeCallbacks(dropWebView);
        wanted = sheetId;
        if (webview == null) {
            create();
        } else if (ready) {
            run("sheetPlay('" + sheetId + "')");
        }
    }

    public void stop() {
        wanted = null;
        if (webview != null && ready) run("sheetStop()");
        handler.removeCallbacks(dropWebView);
        handler.postDelayed(dropWebView, IDLE_MS);
    }

    private void run(String js) {
        webview.evaluateJavascript(js, null);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void create() {
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context))
                .build();
        webview = new WebView(context);
        webview.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(@NonNull WebView view, @NonNull WebResourceRequest request) {
                return true;   // only our own page
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                ready = true;
                if (wanted != null) run("sheetPlay('" + wanted + "')");
            }
        });
        webview.getSettings().setJavaScriptEnabled(true);
        webview.getSettings().setAllowFileAccess(false);
        webview.getSettings().setDomStorageEnabled(true);   // the viewer's saved settings (Both hands)
        webview.getSettings().setMediaPlaybackRequiresUserGesture(false);   // the Play button was the tap, in the app
        webview.addJavascriptInterface(new Bridge(), "HymnsPlay");
        ready = false;
        webview.loadUrl("https://" + WebViewAssetLoader.DEFAULT_DOMAIN + "/assets/viewer/play.html");
    }

    private void drop() {
        if (webview != null && wanted == null) {
            webview.destroy();
            webview = null;
            ready = false;
        }
    }

    /** What play.js asks of the app. It is called on the page's own thread. */
    private class Bridge {
        @JavascriptInterface
        public String edits(String id) {
            return new ChordEdits(context).getBars(id);
        }

        @JavascriptInterface
        public void failed(String message) {
            Log.e(TAG, "could not play the sheet: " + message);
        }
    }
}
