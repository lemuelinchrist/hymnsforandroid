package com.lemuelinchrist.android.hymns.content;

import android.content.Context;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;

/**
 * Lays out variable-width pill/chip views in centred rows, wrapping to the next line when a row is full, with uniform
 * horizontal and vertical spacing. Used by {@link JukeboxCard} for its category row without needing a
 * MaterialComponents theme.
 */
public class WrapLayout extends ViewGroup {
    private final int hGap;
    private final int vGap;

    public WrapLayout(Context context) {
        this(context, null);
    }

    public WrapLayout(Context context, AttributeSet attrs) {
        super(context, attrs);
        hGap = dp(context, 6);
        vGap = dp(context, 6);
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int mode = MeasureSpec.getMode(widthMeasureSpec);
        int avail = mode == MeasureSpec.UNSPECIFIED
                ? Integer.MAX_VALUE
                : Math.max(0, MeasureSpec.getSize(widthMeasureSpec) - getPaddingLeft() - getPaddingRight());
        int x = 0, y = 0, rowH = 0, maxW = 0;
        boolean any = false;
        for (int i = 0, n = getChildCount(); i < n; i++) {
            View c = getChildAt(i);
            if (c.getVisibility() == GONE) continue;
            measureChild(c, widthMeasureSpec, heightMeasureSpec);
            int cw = c.getMeasuredWidth(), ch = c.getMeasuredHeight();
            if (x > 0 && x + cw > avail) {
                maxW = Math.max(maxW, x - hGap);
                y += rowH + vGap;
                x = 0;
                rowH = 0;
            }
            x += cw + hGap;
            rowH = Math.max(rowH, ch);
            any = true;
        }
        if (x > 0) maxW = Math.max(maxW, x - hGap);
        int totalW = maxW + getPaddingLeft() + getPaddingRight();
        int totalH = getPaddingTop() + getPaddingBottom() + (any ? y + rowH : 0);
        setMeasuredDimension(resolveSize(totalW, widthMeasureSpec), resolveSize(totalH, heightMeasureSpec));
    }

    /** Each row is centred in the width. */
    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        boolean rtl = getLayoutDirection() == LAYOUT_DIRECTION_RTL;
        int width = r - l;
        int avail = Math.max(0, width - getPaddingLeft() - getPaddingRight());
        int y = getPaddingTop();
        int n = getChildCount();
        int i = 0;
        while (i < n) {
            // the row: children from i while they fit
            int x = 0, rowH = 0, j = i;
            while (j < n) {
                View c = getChildAt(j);
                if (c.getVisibility() != GONE) {
                    int cw = c.getMeasuredWidth();
                    if (x > 0 && x + cw > avail) break;
                    x += cw + hGap;
                    rowH = Math.max(rowH, c.getMeasuredHeight());
                }
                j++;
            }
            int rowW = Math.max(0, x - hGap);
            int offset = Math.max(0, (avail - rowW) / 2);
            int cx = 0;
            for (int k = i; k < j; k++) {
                View c = getChildAt(k);
                if (c.getVisibility() == GONE) continue;
                int cw = c.getMeasuredWidth(), ch = c.getMeasuredHeight();
                int left = rtl ? width - getPaddingRight() - offset - cx - cw : getPaddingLeft() + offset + cx;
                c.layout(left, y, left + cw, y + ch);
                cx += cw + hGap;
            }
            y += rowH + vGap;
            i = j;
        }
    }

    private static int dp(Context context, float value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, context.getResources().getDisplayMetrics()));
    }
}
