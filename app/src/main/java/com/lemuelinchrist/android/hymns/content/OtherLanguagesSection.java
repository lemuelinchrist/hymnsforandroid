package com.lemuelinchrist.android.hymns.content;

import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.transition.TransitionManager;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.fragment.app.Fragment;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.HymnSwitcher;
import com.lemuelinchrist.android.hymns.HymnsActivity;
import com.lemuelinchrist.android.hymns.NoSuchHymnGroupException;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.style.Theme;

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

    private final Theme theme;
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
        theme = Theme.isNightModePreferred(sharedPreferences.getBoolean("nightMode", false));
        disabledLanguages = sharedPreferences.getStringSet("disableLanguages", new HashSet<String>());
        fontSize = Float.parseFloat(sharedPreferences.getString("FontSize", "18f"));
    }

    public void display() {
        List<String> relatedIds = enabledRelatedIds();
        if (relatedIds.isEmpty()) {
            view.setVisibility(View.GONE);
            return;
        }
        boolean night = theme == Theme.DARK;
        int textColor = theme.getTextColor();
        int mutedColor = muted(textColor);
        // Hide/Show in the book's colour, like the buttons
        int accent = night ? hymn.getHymnGroup().getNightColor() : hymn.getHymnGroup().getDayColor();

        view.removeAllViews();
        view.addView(createFoldRow(relatedIds.size(), mutedColor, accent, night));
        grid = createGrid(relatedIds, textColor, mutedColor);
        view.addView(grid);
        showFolded(sharedPreferences.getBoolean(FOLDED, false));
        sharedPreferences.registerOnSharedPreferenceChangeListener(foldListener);
    }

    /** The text colour, a little see-through: labels and codes. */
    public static int muted(int textColor) {
        return (textColor & 0x00FFFFFF) | 0xB3000000;
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

    private View createFoldRow(int count, int mutedColor, int accent, boolean night) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(4), 0, dp(4));
        row.setMinimumHeight(dp(36));
        row.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33808080), null, roundRect(0xFFFFFFFF, 0)));
        row.setClickable(true);
        row.setOnClickListener(v -> {
            boolean folded = !sharedPreferences.getBoolean(FOLDED, false);
            animateNextChange();
            // the listener folds this page and the ones next to it
            sharedPreferences.edit().putBoolean(FOLDED, folded).apply();
        });

        TextView title = new TextView(context);
        title.setText(R.string.otherLanguages);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        title.setLetterSpacing(0.08f);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(mutedColor);
        row.addView(title);

        TextView badge = new TextView(context);
        badge.setText(String.valueOf(count));
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        badge.setTextColor(mutedColor);
        badge.setPadding(dp(7), 0, dp(7), 0);
        badge.setBackground(roundRect(night ? 0xFF2A2A2A : 0xFFEEF1F4, dp(10)));
        LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        badgeParams.leftMargin = dp(8);
        row.addView(badge, badgeParams);

        action = new TextView(context);
        action.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        action.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        action.setTextColor(accent);
        action.setGravity(Gravity.END);
        row.addView(action, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        return row;
    }

    private GridLayout createGrid(List<String> ids, int textColor, int mutedColor) {
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

        for (final String id : ids) {
            HymnGroup group;
            try {
                group = HymnGroup.getHymnGroupFromID(id);
            } catch (NoSuchHymnGroupException e) {
                throw new IllegalStateException(e);   // already filtered out in enabledRelatedIds()
            }
            LinearLayout cell = new LinearLayout(context);
            cell.setOrientation(LinearLayout.HORIZONTAL);
            cell.setGravity(Gravity.CENTER_VERTICAL);
            cell.setPadding(dp(3), dp(5), dp(3), dp(5));
            cell.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33808080), null, roundRect(0xFFFFFFFF, dp(4))));
            cell.setClickable(true);
            cell.setContentDescription(group.getSimpleName() + " " + HymnGroup.getHymnNoFromID(id));
            cell.setOnClickListener(v -> {
                HymnSwitcher hymnSwitcher = HymnsActivity.getHymnSwitcher();
                if (hymnSwitcher != null) hymnSwitcher.switchToRelatedHymn(id);
            });

            TextView codeView = new TextView(context);
            codeView.setText(group.name());
            codeView.setTextSize(TypedValue.COMPLEX_UNIT_SP, codeSize);
            codeView.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
            codeView.setTextColor(mutedColor);
            codeView.setWidth(codeWidth);
            cell.addView(codeView);

            TextView numberView = new TextView(context);
            numberView.setText(HymnGroup.getHymnNoFromID(id));
            numberView.setTextSize(TypedValue.COMPLEX_UNIT_SP, numberSize);
            numberView.setTypeface(Typeface.DEFAULT_BOLD);
            numberView.setTextColor(textColor);
            numberView.setSingleLine(true);
            cell.addView(numberView);

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

    private GradientDrawable roundRect(int color, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(radius);
        return shape;
    }

    private int dp(float v) {
        return Math.round(v * context.getResources().getDisplayMetrics().density);
    }

    private float sp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, context.getResources().getDisplayMetrics());
    }
}
