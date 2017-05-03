package com.lemuelinchrist.android.hymns.sheetmusic;

import android.content.Context;
import android.util.AttributeSet;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebView;

/**
 * Created by lcantos on 2/5/2017.
 */

// this class is a workaround of the bug where webview doesn't respond to touch events after zooming in and out
// copied from: http://stackoverflow.com/questions/4529093/android-zoompicker-breaks-ontouchlistener
public class WebViewWorkaround extends WebView {
    private GestureDetector gestureDetector;
    public WebViewWorkaround(Context context) {
        super(context);
    }
    public WebViewWorkaround(Context context, AttributeSet attrs) {
        super(context, attrs);
    }
    public WebViewWorkaround(Context context, AttributeSet attrs, int defStyle) {
        super(context, attrs, defStyle);
    }
    @Override
    protected void onScrollChanged(int l, int t, int oldl, int oldt) {
        super.onScrollChanged(l, t, oldl, oldt);
    }

    @Override
    public boolean onTouchEvent(MotionEvent ev) {
        return gestureDetector.onTouchEvent(ev) || super.onTouchEvent(ev);
    }


    public void setGestureDetector(GestureDetector gestureDetector) {
        this.gestureDetector = gestureDetector;
    }
}