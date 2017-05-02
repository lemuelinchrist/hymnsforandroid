package com.lemuelinchrist.android.hymns.sheetmusic;

import android.content.Context;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebView;

/**
 * Created by lcantos on 2/5/2017.
 */

// this class is a workaround of the bug where webview doesn't respond to touch events after zooming in and out
// copied from: http://stackoverflow.com/questions/4529093/android-zoompicker-breaks-ontouchlistener
public class WebViewWorkaround extends WebView {

    WebTouchListener wtl;

    public WebViewWorkaround(Context context) {
        super(context);
    }

    public WebViewWorkaround(Context context, AttributeSet attrs, int defStyle) {
        super(context, attrs, defStyle);
    }

    public WebViewWorkaround(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public void resetTouchListener() {

        if(this.wtl == null) {
            this.wtl = new WebTouchListener();
        }
        this.setOnTouchListener(wtl);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {

        this.resetTouchListener();
        return super.dispatchTouchEvent(event);
    }

    class WebTouchListener implements OnTouchListener {

        @Override
        public boolean onTouch(View v, MotionEvent event) {

            WebView.HitTestResult hr = ((WebViewWorkaround)v).getHitTestResult();
            //Log.i(TAG, "getExtra = "+ hr.getExtra() + "\t\t Type=" + hr.getType());

            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                System.out.println(hr.getExtra() + " " + hr.getType());
            }

            // TODO Auto-generated method stub
            return false;
        }


    }
}