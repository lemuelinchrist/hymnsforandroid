package com.lemuelinchrist.android.hymns.content;

import android.content.Context;
import android.content.SharedPreferences;
import android.preference.PreferenceManager;
import android.transition.TransitionManager;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.widget.TextView;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.style.BookColors;

/**
 * Folds a card of the hymn page (JUKEBOX, LISTEN AND LINKS) into its title row, as OTHER LANGUAGES folds
 * ({@link OtherLanguagesSection}): a tap on the row "TITLE          Hide ▴" hides the rest of the card, and "Show ▾"
 * brings it back. The choice is a preference kept for every hymn; the pages next to this one, already built by the
 * pager, follow it. Folding the jukebox does not stop it.
 */
public final class CardFold {
    /** Preferences: the card is folded on every hymn. */
    public static final String JUKEBOX = "jukeboxFolded", LINKS = "linksFolded";

    private final SharedPreferences prefs;
    private final String key;
    private final View body;
    private final TextView action;
    private final Context context;
    // kept in a field: SharedPreferences only holds its listeners weakly
    private final SharedPreferences.OnSharedPreferenceChangeListener listener;

    /**
     * header: the title row (tapped to fold); action: its "Hide ▴" / "Show ▾", in the book's colour; body: what folds away.
     */
    public static CardFold attach(Context context, HymnGroup group, View header, TextView action, View body, String key) {
        return new CardFold(context, group, header, action, body, key);
    }

    private CardFold(Context context, HymnGroup group, View header, TextView action, View body, String key) {
        this.context = context;
        this.prefs = PreferenceManager.getDefaultSharedPreferences(context);
        this.key = key;
        this.body = body;
        this.action = action;
        action.setTextColor(BookColors.accent(context, group));
        listener = (p, changed) -> {
            if (key.equals(changed)) show(p.getBoolean(key, false));
        };
        header.setOnClickListener(v -> {
            animateNextChange(header);
            // the listener folds this page and the ones next to it
            prefs.edit().putBoolean(key, !prefs.getBoolean(key, false)).apply();
        });
        show(prefs.getBoolean(key, false));
        header.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
            @Override
            public void onViewAttachedToWindow(View v) {
                prefs.registerOnSharedPreferenceChangeListener(listener);
                show(prefs.getBoolean(key, false));
            }

            @Override
            public void onViewDetachedFromWindow(View v) {
                prefs.unregisterOnSharedPreferenceChangeListener(listener);
            }
        });
        if (header.isAttachedToWindow()) prefs.registerOnSharedPreferenceChangeListener(listener);
    }

    private void show(boolean folded) {
        body.setVisibility(folded ? View.GONE : View.VISIBLE);
        action.setText(context.getString(folded ? R.string.otherLanguagesShow : R.string.otherLanguagesHide)
                + (folded ? "  ▾" : "  ▴"));
    }

    /** The cards below slide up or down instead of jumping, on the page tapped. */
    private static void animateNextChange(View from) {
        ViewParent parent = from.getParent();
        while (parent instanceof ViewGroup) {
            if (((ViewGroup) parent).getId() == R.id.lyric_container) {
                TransitionManager.beginDelayedTransition((ViewGroup) parent);
                return;
            }
            parent = parent.getParent();
        }
    }
}
