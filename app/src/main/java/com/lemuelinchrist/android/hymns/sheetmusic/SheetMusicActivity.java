package com.lemuelinchrist.android.hymns.sheetmusic;

import android.os.Bundle;
import android.support.v7.app.ActionBar;
import android.support.v7.app.AppCompatActivity;
import android.util.Log;
import android.view.GestureDetector;
import android.view.MenuItem;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;

import com.lemuelinchrist.android.hymns.R;

/**
 * Created by lemuel on 30/4/2017.
 */

public class SheetMusicActivity extends AppCompatActivity {
    private ActionBar actionBar;
    private WebViewWorkaround webview;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_ACTION_BAR_OVERLAY);
        setContentView(R.layout.sheet_music_activity);

        actionBar = getSupportActionBar();
        actionBar.setDisplayHomeAsUpEnabled(true);

        // get selected hymn group
        Bundle extras = getIntent().getExtras();
        String selectedHymnId = (String) extras.get("selectedHymnId");
        actionBar.setTitle(selectedHymnId);
        actionBar.hide();

        webview = (WebViewWorkaround) findViewById(R.id.sheet_music_image);
        webview.setGestureDetector(new GestureDetector(new CustomeGestureDetector()));
        webview.getSettings().setBuiltInZoomControls(true);
        webview.loadUrl("file:///android_asset/svg/" + selectedHymnId + ".svg");


    }

    public void onClick() {
        if(actionBar.isShowing()) {
            actionBar.hide();
        } else {
            actionBar.show();
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

    private class CustomeGestureDetector extends GestureDetector.SimpleOnGestureListener {
        @Override
        public boolean onFling(MotionEvent e1, MotionEvent e2, float velocityX, float velocityY) {
            if(e1 == null || e2 == null) return false;
            if(e1.getPointerCount() > 1 || e2.getPointerCount() > 1) return false;
            else {
                try {
                    if(e1.getY() - e2.getY() > 20 ) {
                        // Hide Actionbar
                        getSupportActionBar().hide();
                        webview.invalidate();
                        return false;
                    }
                    else if (e2.getY() - e1.getY() > 20 ) {
                        // Show Actionbar
                        getSupportActionBar().show();
                        webview.invalidate();
                        return false;
                    }

                } catch (Exception e) {
                    webview.invalidate();
                }
                return false;
            }


        }
    }

}
