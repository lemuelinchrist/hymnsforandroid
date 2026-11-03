package com.lemuelinchrist.android.hymns.style;

import android.content.Context;
import android.graphics.Typeface;
import android.widget.TextView;

import androidx.core.content.res.ResourcesCompat;

import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.NoSuchHymnGroupException;
import com.lemuelinchrist.android.hymns.R;

/**
 * The font a book's text is shown in. Most books use the phone's own font; Urdu is read in Nastaliq, which Android
 * doesn't have (its Arabic-script font is Naskh, the style of Arabic and Farsi), so the app brings Noto Nastaliq Urdu.
 *
 * @since 2026-10-29
 */
public class ScriptFont {

    private static Typeface nastaliq;

    /** Sets the book's font on the view, or the default one (rows of a list are reused for other books). */
    public static void apply(TextView view, HymnGroup group) {
        view.setTypeface(group == HymnGroup.UR ? nastaliq(view.getContext()) : Typeface.DEFAULT);
    }

    /** The same for a hymn ID such as "UR8"; anything that isn't a hymn ID gets the default font. */
    public static void apply(TextView view, String hymnId) {
        HymnGroup group = null;
        try {
            if (hymnId != null && hymnId.length() > 1) group = HymnGroup.getHymnGroupFromID(hymnId);
        } catch (NoSuchHymnGroupException e) {
            // not a hymn ID
        }
        apply(view, group);
    }

    private static Typeface nastaliq(Context context) {
        if (nastaliq == null) nastaliq = ResourcesCompat.getFont(context, R.font.noto_nastaliq_urdu);
        return nastaliq;
    }
}
