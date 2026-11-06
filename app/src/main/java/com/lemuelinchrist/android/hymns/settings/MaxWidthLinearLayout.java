package com.lemuelinchrist.android.hymns.settings;

import android.content.Context;
import android.content.res.TypedArray;
import android.util.AttributeSet;
import android.view.View;
import android.widget.LinearLayout;
import com.lemuelinchrist.android.hymns.R;

/**
 * A vertical column that is never wider than {@code maxContentWidth}. Put it in a ScrollView with
 * {@code layout_gravity="center_horizontal"} and the Settings and About pages become a centred column on a tablet or an
 * unfolded phone, instead of cards stretched across the screen; on a phone it fills the width as usual.
 */
public class MaxWidthLinearLayout extends LinearLayout {
    private final int maxWidth;

    public MaxWidthLinearLayout(Context context, AttributeSet attrs) {
        super(context, attrs);
        TypedArray a = context.obtainStyledAttributes(attrs, R.styleable.MaxWidthLinearLayout);
        try {
            maxWidth = a.getDimensionPixelSize(R.styleable.MaxWidthLinearLayout_maxContentWidth, Integer.MAX_VALUE);
        } finally {
            a.recycle();
        }
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int width = View.MeasureSpec.getSize(widthMeasureSpec);
        if (width > maxWidth) {
            widthMeasureSpec = View.MeasureSpec.makeMeasureSpec(maxWidth, View.MeasureSpec.getMode(widthMeasureSpec));
        }
        super.onMeasure(widthMeasureSpec, heightMeasureSpec);
    }
}
