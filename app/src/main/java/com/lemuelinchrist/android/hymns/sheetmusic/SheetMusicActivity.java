package com.lemuelinchrist.android.hymns.sheetmusic;

import android.content.Intent;
import android.os.Bundle;
import android.support.v4.view.MenuItemCompat;
import android.support.v7.app.ActionBar;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.ShareActionProvider;
import android.util.Log;
import android.view.GestureDetector;

import android.view.Menu;
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
    private ShareActionProvider shareActionProvider;
    private SheetMusic sheetMusic;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.sheet_music_activity);

        actionBar = getSupportActionBar();
        actionBar.setDisplayHomeAsUpEnabled(true);

        // get selected hymn group
        Bundle extras = getIntent().getExtras();
        String selectedHymnId = (String) extras.get("selectedHymnId");
        sheetMusic = new SheetMusic(this,selectedHymnId);

        actionBar.setTitle(selectedHymnId);

        webview = (WebViewWorkaround) findViewById(R.id.sheet_music_image);
        webview.setGestureDetector(new GestureDetector(new CustomeGestureDetector()));
        webview.getSettings().setBuiltInZoomControls(true);
        webview.loadUrl("file:///android_asset/svg/" + selectedHymnId + ".svg");
        // zoom out by default
        webview.getSettings().setUseWideViewPort(true);
        webview.getSettings().setLoadWithOverviewMode(true);
        webview.setInitialScale(1);


    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.sheet_music_menu, menu);
        MenuItem item = menu.findItem(R.id.sheet_music_share);
        shareActionProvider = (ShareActionProvider) MenuItemCompat.getActionProvider(item);

        try {
            shareActionProvider.setShareIntent(sheetMusic.shareAsIntent());
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

    public void hideActionBar() {
        // Hide Actionbar
        actionBar.hide();
        webview.invalidate();
    }

    public void showActionBar() {
        // Show Actionbar
        actionBar.show();
        webview.invalidate();
    }

    private class CustomeGestureDetector extends GestureDetector.SimpleOnGestureListener {
        @Override
        public boolean onSingleTapUp(MotionEvent e) {
            super.onSingleTapUp(e);
            if(actionBar.isShowing()) {
                hideActionBar();
            } else {
                showActionBar();
            }

            return false;
        }

        @Override
        public boolean onFling(MotionEvent e1, MotionEvent e2, float velocityX, float velocityY) {
            if (e1 == null || e2 == null) return false;
            if (e1.getPointerCount() > 1 || e2.getPointerCount() > 1) return false;
            else {
                try {
                    if (e1.getY() - e2.getY() > 20) {
                        hideActionBar();

                        return false;
                    } else if (e2.getY() - e1.getY() > 20) {
                        showActionBar();

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
