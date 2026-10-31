package com.lemuelinchrist.android.hymns.style;

import android.content.Context;
import android.content.res.TypedArray;
import android.graphics.Color;
import androidx.core.content.ContextCompat;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;

/**
 * A book's colours in the current theme: the colours themselves are in HymnGroup (one place when adding a book), how
 * a theme uses them is in its XML (attrs.xml: hymnAccentNight, hymnToolbarDim, hymnButtonBarDim, hymnBarColor, and
 * the drawer's drawerHighlightShare, drawerHighlightTextDarken). The only code that mixes the two.
 */
public final class BookColors {

    private BookColors() {
    }

    /** Stanza numbers, the chorus and "Hide": the day colour, or the lighter night colour at night. */
    public static int accent(Context context, HymnGroup group) {
        TypedArray a = context.obtainStyledAttributes(new int[]{R.attr.hymnAccentNight});
        boolean night = a.getBoolean(0, false);
        a.recycle();
        return night ? group.getNightColor() : group.getDayColor();
    }

    public static int toolbar(Context context, HymnGroup group) {
        return bar(context, group, R.attr.hymnToolbarDim);
    }

    /** The pill holding the hymn's buttons. */
    public static int buttonBar(Context context, HymnGroup group) {
        return bar(context, group, R.attr.hymnButtonBarDim);
    }

    /** The current book's row in the drawer: a light tint of its accent. */
    public static int drawerHighlight(Context context, HymnGroup group) {
        return mix(accent(context, group), drawerBackground(context), number(context, R.attr.drawerHighlightShare));
    }

    /** The current book's name in the drawer: its accent, a little darker by day so it reads on the tint. */
    public static int drawerHighlightText(Context context, HymnGroup group) {
        float darken = number(context, R.attr.drawerHighlightTextDarken);
        return darken == 0 ? accent(context, group) : mix(accent(context, group), Color.BLACK, 1 - darken);
    }

    private static int drawerBackground(Context context) {
        return ContextCompat.getColor(context, R.color.drawer_background);
    }

    /** A colour of the theme, e.g. R.attr.hymnHighlight. */
    public static int color(Context context, int attr) {
        TypedArray a = context.obtainStyledAttributes(new int[]{attr});
        int color = a.getColor(0, Color.TRANSPARENT);
        a.recycle();
        return color;
    }

    private static int bar(Context context, HymnGroup group, int dimAttr) {
        int override = color(context, R.attr.hymnBarColor);
        if (Color.alpha(override) != 0) return override;
        float dim = number(context, dimAttr);
        return dim == 0 ? group.getDayColor() : mix(group.getDayColor(), color(context, R.attr.hymnCardBackground), 1 - dim);
    }

    private static float number(Context context, int attr) {
        TypedArray a = context.obtainStyledAttributes(new int[]{attr});
        float value = a.getFloat(0, 0);
        a.recycle();
        return value;
    }

    /** a in the share t, b in the rest */
    private static int mix(int a, int b, float t) {
        return Color.rgb(Math.round(Color.red(a) * t + Color.red(b) * (1 - t)),
                Math.round(Color.green(a) * t + Color.green(b) * (1 - t)),
                Math.round(Color.blue(a) * t + Color.blue(b) * (1 - t)));
    }
}
