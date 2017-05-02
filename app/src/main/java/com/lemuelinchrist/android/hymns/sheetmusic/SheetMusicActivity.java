package com.lemuelinchrist.android.hymns.sheetmusic;

import android.os.Bundle;
import android.support.v7.app.ActionBar;
import android.support.v7.app.AppCompatActivity;
import android.util.Log;
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
        webview.getSettings().setBuiltInZoomControls(true);
        webview.loadUrl("file:///android_asset/svg/" + selectedHymnId + ".svg");
        // we use onTouch because onClick doesn't work
        webview.setOnTouchListener(new View.OnTouchListener() {
            private final static long MAX_TOUCH_DURATION = 100;
            private long m_DownTime=0;
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                Log.d(getClass().getName(),"webview touched: " + event.getAction());

                switch (event.getAction()) {

                    case MotionEvent.ACTION_DOWN:
                        m_DownTime = event.getEventTime(); //init time

                        break;

                    case MotionEvent.ACTION_UP:
                        if(event.getEventTime() - m_DownTime <= MAX_TOUCH_DURATION)
                            //On click action
                            onClick();
                            break;
                    default:
                        break; //No-Op
                }
                return false;
            }
        });


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

}
