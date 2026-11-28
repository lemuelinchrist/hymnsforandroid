package com.lemuelinchrist.android.hymns.content.sheetmusic;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import com.lemuelinchrist.android.hymns.logbook.ChordEdits;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.regex.Pattern;

/**
 * Plays a hymn's sheet music for the Play button, in a WebView nobody sees: assets/viewer/play.html runs the sheet
 * viewer's own player (tools/web/android/play.js), so the sound is the one the viewer's Play makes. It is used for a
 * hymn with no MIDI file and for a sheet of our own. The page loops the sheet until {@link #stop()}.
 * The jukebox card plays through it too, in a style it chooses ({@link #play(String, Options, Listener)}): it is told the
 * bar that sounds and when the play stops. One player at a time; its WebView is dropped after a while without playing.
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
    private String wantedJs;   // and how: the page's call
    private int playNo;   // the number of the play now; the page's word about an older one is not listened to
    private Listener listener;   // who started it (the jukebox), told when it stops

    /** What the jukebox wants to know of its play. Called on the main thread. */
    public interface Listener {
        /** It stopped: the end, Stop, or another play took the player. */
        void onSheetStopped();

        /** The bar that sounds now, of how many the sheet has. */
        void onSheetBar(int bar, int bars);
    }

    /** How the jukebox plays a sheet: a style of jukebox.js (its STYLES ids), again and again or once, the tempo's factor, optional shuffle seed and Chorale walk. */
    public static final class Options {
        public final String style;
        public final boolean loop;
        public final double speed;
        public final int seed;
        public final boolean walk;

        public Options(String style, boolean loop, double speed) {
            this(style, loop, speed, 0, false);
        }

        public Options(String style, boolean loop, double speed, int seed, boolean walk) {
            this.style = style;
            this.loop = loop;
            this.speed = speed;
            this.seed = seed;
            this.walk = walk;
        }
    }

    private SheetPlayer(Context context) {
        this.context = context.getApplicationContext();
    }

    public static synchronized SheetPlayer get(Context context) {
        if (instance == null) instance = new SheetPlayer(context);
        return instance;
    }

    /** Stops playback only if a sheet player already exists and is active. */
    public static synchronized void stopIfActive() {
        if (instance != null && instance.isPlaying()) {
            instance.stop();
        }
    }

    /** Whether the sheet is being played (or is about to). */
    public boolean isPlaying() {
        return wanted != null;
    }

    /** Plays the sheet (assets/sheetMei/&lt;id&gt;.mei) from the start, again and again. Call it on the main thread. */
    public void play(String sheetId) {
        play(sheetId, null, null);
    }

    /**
     * Plays the sheet in the jukebox's way: from the start, or, when the same listener's play of the same sheet goes
     * on, from where it is with the new options. The listener is told when it stops. Call it on the main thread.
     */
    public void play(String sheetId, @Nullable Options options, @Nullable Listener l) {
        if (sheetId == null || !SHEET_ID.matcher(sheetId).matches()) return;
        handler.removeCallbacks(dropWebView);
        if (listener != l) tellStopped();
        listener = l;
        playNo++;
        wanted = sheetId;
        wantedJs = "sheetPlay('" + sheetId + "'" + (options == null ? "" : ", " + optionsJs(options)) + ")";
        if (webview == null) {
            create();
        } else if (ready) {
            run(wantedJs);
        }
    }

    public void stop() {
        playNo++;
        wanted = null;
        if (webview != null && ready) run("sheetStop()");
        handler.removeCallbacks(dropWebView);
        handler.postDelayed(dropWebView, IDLE_MS);
        tellStopped();
    }

    private void tellStopped() {
        Listener l = listener;
        listener = null;
        if (l != null) l.onSheetStopped();
    }

    private String optionsJs(Options o) {
        try {
            JSONObject obj = new JSONObject().put("style", o.style).put("loop", o.loop).put("speed", o.speed).put("n", playNo);
            if (o.seed > 0) obj.put("seed", o.seed);
            if (o.walk) obj.put("walk", true);
            return obj.toString();
        } catch (JSONException e) {
            return "{}";
        }
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
                if (wanted != null) run(wantedJs);
            }
        });
        webview.getSettings().setJavaScriptEnabled(true);
        webview.getSettings().setAllowFileAccess(false);
        webview.getSettings().setDomStorageEnabled(true);   // the viewer's saved settings (Both hands)
        webview.getSettings().setMediaPlaybackRequiresUserGesture(false);   // the Play button was the tap, in the app
        webview.addJavascriptInterface(new Bridge(), "HymnsPlay");
        webview.setWebChromeClient(new AudioLog());
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

    /** Copies the player's audio lines (player.js logAudioStats: glitches, latency) to logcat, tag HymnsAudio. */
    static final class AudioLog extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            String text = m.message();
            if (text != null && text.startsWith("audio-stats ")) Log.i("HymnsAudio", text.substring(12));
            return true;
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

        /** The jukebox's play n came to its end (or could not start). */
        @JavascriptInterface
        public void ended(final int n) {
            handler.post(() -> {
                if (n != playNo || wanted == null) return;
                wanted = null;
                handler.removeCallbacks(dropWebView);
                handler.postDelayed(dropWebView, IDLE_MS);
                tellStopped();
            });
        }

        /** The bar the jukebox's play n is at. */
        @JavascriptInterface
        public void bar(final int n, final int bar, final int bars) {
            handler.post(() -> {
                if (n == playNo && listener != null) listener.onSheetBar(bar, bars);
            });
        }
    }
}
