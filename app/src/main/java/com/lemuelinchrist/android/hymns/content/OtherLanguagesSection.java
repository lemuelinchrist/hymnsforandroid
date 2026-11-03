package com.lemuelinchrist.android.hymns.content;

import android.content.SharedPreferences;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.transition.TransitionManager;
import android.util.TypedValue;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.widget.GridLayout;
import android.widget.TextView;
import androidx.fragment.app.Fragment;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.HymnSwitcher;
import com.lemuelinchrist.android.hymns.HymnsActivity;
import com.lemuelinchrist.android.hymns.NoSuchHymnGroupException;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.style.BookColors;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The other languages' numbers at the top of a hymn, under the subject: a row "OTHER LANGUAGES 18 Hide" and a grid of
 * code + number ("CS 305", "FR 115"), in the drawer's order, so a brother can call a hymn in several languages at a
 * glance. A tap on a number opens that hymn. Hide folds the grid into the one row; the choice is kept for every hymn
 * ({@link #FOLDED}). The section removes itself when the hymn has no related hymns in an enabled language.
 *
 * <p>It is one part of the header card: {@link LyricsArea} writes the subject above it, and the buttons below it are
 * their own components.
 */
public class OtherLanguagesSection extends ContentComponent<ViewGroup> {
    /** Preference: the numbers are folded away on every hymn. */
    public static final String FOLDED = "otherLanguagesFolded";

    private final Set<String> disabledLanguages;
    private final SharedPreferences sharedPreferences;
    private final float fontSize;
    private GridLayout grid;
    private TextView action;
    // the pages next to this one are already built: they follow a fold made here (kept in a field, because
    // SharedPreferences only holds listeners weakly)
    private final SharedPreferences.OnSharedPreferenceChangeListener foldListener = (prefs, key) -> {
        if (FOLDED.equals(key) && grid != null) showFolded(prefs.getBoolean(FOLDED, false));
    };

    public OtherLanguagesSection(Hymn hymn, Fragment parentFragment, ViewGroup container) {
        super(hymn, parentFragment, container);
        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context);
        disabledLanguages = sharedPreferences.getStringSet("disableLanguages", new HashSet<String>());
        fontSize = Float.parseFloat(sharedPreferences.getString("FontSize", "18f"));
    }

    public void display() {
        List<String> relatedIds = enabledRelatedIds();
        if (relatedIds.isEmpty()) {
            view.setVisibility(View.GONE);
            return;
        }
        view.removeAllViews();
        view.addView(createFoldRow(relatedIds.size()));
        grid = createGrid(relatedIds);
        view.addView(grid);
        showFolded(sharedPreferences.getBoolean(FOLDED, false));
        sharedPreferences.registerOnSharedPreferenceChangeListener(foldListener);
    }

    /** Related hymns whose language is known and not switched off in the settings, in the drawer's order. */
    private List<String> enabledRelatedIds() {
        List<String> ids = new ArrayList<>();
        List<String> related = hymn.getRelated();
        if (related == null) return ids;
        for (String id : related) {
            try {
                if (!disabledLanguages.contains(HymnGroup.getHymnGroupFromID(id).name())) ids.add(id);
            } catch (NoSuchHymnGroupException e) {
                // a language this version doesn't know: leave it out
            }
        }
        Collections.sort(ids, (a, b) -> {
            try {
                int byGroup = HymnGroup.getHymnGroupFromID(a).compareTo(HymnGroup.getHymnGroupFromID(b));
                if (byGroup != 0) return byGroup;
            } catch (NoSuchHymnGroupException e) {
                throw new IllegalStateException(e);   // already filtered out above
            }
            return Integer.compare(number(a), number(b));
        });
        return ids;
    }

    private static int number(String id) {
        try {
            return Integer.parseInt(HymnGroup.getHymnNoFromID(id).replaceAll("[^0-9]", ""));
        } catch (NumberFormatException e) {
            return Integer.MAX_VALUE;
        }
    }

    /** "OTHER LANGUAGES 18          Hide ▴" (other_languages_row.xml); Hide/Show in the book's colour, like the buttons. */
    private View createFoldRow(int count) {
        View row = LayoutInflater.from(context).inflate(R.layout.other_languages_row, view, false);
        row.setOnClickListener(v -> {
            boolean folded = !sharedPreferences.getBoolean(FOLDED, false);
            animateNextChange();
            // the listener folds this page and the ones next to it
            sharedPreferences.edit().putBoolean(FOLDED, folded).apply();
        });
        ((TextView) row.findViewById(R.id.otherLanguagesCount)).setText(String.valueOf(count));
        action = row.findViewById(R.id.otherLanguagesAction);
        action.setTextColor(BookColors.accent(context, hymn.getHymnGroup()));
        return row;
    }

    /** The numbers (other_languages_cell.xml), sized from the font size. */
    private GridLayout createGrid(List<String> ids) {
        float numberSize = Math.max(12, fontSize - 4);
        float codeSize = numberSize * 0.82f;
        GridLayout grid = new GridLayout(context);
        grid.setColumnCount(columns(numberSize));
        grid.setPadding(0, dp(2), 0, dp(4));

        // the codes get one width, so the numbers line up in columns
        Paint codePaint = new Paint();
        codePaint.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        codePaint.setTextSize(sp(codeSize));
        int codeWidth = Math.round(codePaint.measureText("MW")) + dp(5);

        LayoutInflater inflater = LayoutInflater.from(context);
        for (final String id : ids) {
            HymnGroup group;
            try {
                group = HymnGroup.getHymnGroupFromID(id);
            } catch (NoSuchHymnGroupException e) {
                throw new IllegalStateException(e);   // already filtered out in enabledRelatedIds()
            }
            View cell = inflater.inflate(R.layout.other_languages_cell, grid, false);
            cell.setContentDescription(group.getSimpleName() + " " + HymnGroup.getHymnNoFromID(id));
            cell.setOnClickListener(v -> {
                HymnSwitcher hymnSwitcher = HymnsActivity.getHymnSwitcher();
                if (hymnSwitcher != null) hymnSwitcher.switchToRelatedHymn(id);
            });

            TextView codeView = cell.findViewById(R.id.otherLanguagesCode);
            codeView.setText(group.name());
            codeView.setTextSize(TypedValue.COMPLEX_UNIT_SP, codeSize);
            codeView.setWidth(codeWidth);

            TextView numberView = cell.findViewById(R.id.otherLanguagesNumber);
            numberView.setText(HymnGroup.getHymnNoFromID(id));
            numberView.setTextSize(TypedValue.COMPLEX_UNIT_SP, numberSize);

            GridLayout.LayoutParams params = new GridLayout.LayoutParams(
                    GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f));
            params.width = 0;
            grid.addView(cell, params);
        }
        return grid;
    }

    /** As many columns as fit the card at this text size: 4 on most phones at the default size. */
    private int columns(float numberSize) {
        int availableDp = context.getResources().getConfiguration().screenWidthDp - 70;
        int cellDp = Math.round(numberSize * 4.5f + 14);
        return Math.max(2, Math.min(8, availableDp / cellDp));
    }

    private void showFolded(boolean folded) {
        grid.setVisibility(folded ? View.GONE : View.VISIBLE);
        action.setText(context.getString(folded ? R.string.otherLanguagesShow : R.string.otherLanguagesHide)
                + (folded ? "  ▾" : "  ▴"));
    }

    /** Let the lyrics slide up or down instead of jumping, when this page is the one tapped. */
    private void animateNextChange() {
        ViewParent parent = view.getParent();
        while (parent instanceof ViewGroup) {
            if (((ViewGroup) parent).getId() == R.id.lyric_container) {
                TransitionManager.beginDelayedTransition((ViewGroup) parent);
                return;
            }
            parent = parent.getParent();
        }
    }

    private int dp(float v) {
        return Math.round(v * context.getResources().getDisplayMetrics().density);
    }

    private float sp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, context.getResources().getDisplayMetrics());
    }
}
