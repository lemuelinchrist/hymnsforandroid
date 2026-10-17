package com.lemuelinchrist.android.hymns.content;

import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.ReplacementSpan;
import android.text.style.StyleSpan;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import androidx.preference.PreferenceManager;
import com.google.android.material.chip.ChipGroup;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.HymnSwitcher;
import com.lemuelinchrist.android.hymns.HymnsActivity;
import com.lemuelinchrist.android.hymns.NoSuchHymnGroupException;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.style.Theme;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The card at the bottom of a hymn: an "ALSO IN" label and one tappable pill per related hymn
 * (language name, hymn number, and a dot in the language's colour). A tap opens that hymn.
 * The card removes itself when the hymn has no related hymns in an enabled language.
 */
public class RelatedHymnsCard extends ContentComponent<ViewGroup> {
    private final Theme theme;
    private final Set<String> disabledLanguages;

    public RelatedHymnsCard(Hymn hymn, Fragment parentFragment, ViewGroup container) {
        super(hymn, parentFragment, container);
        SharedPreferences sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context);
        theme = Theme.isNightModePreferred(sharedPreferences.getBoolean("nightMode", false));
        disabledLanguages = sharedPreferences.getStringSet("disableLanguages", new HashSet<String>());
    }

    public void display() {
        List<String> relatedIds = enabledRelatedIds();
        if (relatedIds.isEmpty()) {
            ((ViewGroup) view.getParent()).removeView(view);
            return;
        }
        boolean night = theme == Theme.DARK;
        int textColor = theme.getTextColor();
        int mutedColor = (textColor & 0x00FFFFFF) | 0xB3000000;
        int fill = night ? 0xFF1A1A1A : 0xFFF3F5F8;
        int stroke = night ? 0xFF3A3A3A : 0xFFC9D1DC;

        TextView label = new TextView(context);
        label.setText("ALSO IN");
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        label.setLetterSpacing(0.08f);
        label.setTextColor(mutedColor);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setPadding(0, dp(12), 0, dp(10));

        ChipGroup wrap = new ChipGroup(context);
        wrap.setChipSpacing(dp(8));
        for (String id : relatedIds) {
            wrap.addView(createChip(id, night, textColor, mutedColor, fill, stroke));
        }

        view.removeAllViews();
        view.addView(label);
        view.addView(wrap);
    }

    /** Related hymns whose language is known and not switched off in the settings. */
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
        return ids;
    }

    private TextView createChip(final String id, boolean night, int textColor, int mutedColor, int fill, int stroke) {
        HymnGroup group;
        try {
            group = HymnGroup.getHymnGroupFromID(id);
        } catch (NoSuchHymnGroupException e) {
            throw new IllegalStateException(e);   // already filtered out in enabledRelatedIds()
        }
        SpannableStringBuilder sb = new SpannableStringBuilder();
        int start = sb.length();
        sb.append(" ");   // the dot is drawn over this one character
        sb.setSpan(new DotSpan(night ? group.getNightColor() : group.getDayColor(), dp(10), dp(8)),
                start, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        start = sb.length();
        sb.append(group.getSimpleName()).append("  ");
        sb.setSpan(new ForegroundColorSpan(mutedColor), start, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        start = sb.length();
        sb.append(HymnGroup.getHymnNoFromID(id));
        sb.setSpan(new ForegroundColorSpan(textColor), start, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        sb.setSpan(new StyleSpan(Typeface.BOLD), start, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);

        TextView chip = new TextView(context);
        chip.setText(sb);
        chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        chip.setSingleLine(true);
        chip.setPadding(dp(13), dp(8), dp(13), dp(8));
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(fill);
        pill.setCornerRadius(dp(40));
        pill.setStroke(dp(1), stroke);
        chip.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33808080), pill, null));
        chip.setClickable(true);
        chip.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                HymnSwitcher hymnSwitcher = HymnsActivity.getHymnSwitcher();
                if (hymnSwitcher != null) hymnSwitcher.switchToRelatedHymn(id);
            }
        });
        return chip;
    }

    private int dp(float v) {
        return Math.round(v * context.getResources().getDisplayMetrics().density);
    }

    /** A filled circle of a fixed size, centred on the lower-case letters, in front of a language name. */
    private static class DotSpan extends ReplacementSpan {
        private final int color, diameter, gap;

        DotSpan(int color, int diameter, int gap) {
            this.color = color;
            this.diameter = diameter;
            this.gap = gap;
        }

        @Override
        public int getSize(@NonNull Paint paint, CharSequence text, int start, int end, Paint.FontMetricsInt fm) {
            return diameter + gap;
        }

        @Override
        public void draw(@NonNull Canvas canvas, CharSequence text, int start, int end, float x, int top, int y, int bottom, @NonNull Paint paint) {
            int oldColor = paint.getColor();
            paint.setColor(color);
            paint.setAntiAlias(true);
            float centerY = y + paint.getFontMetrics().ascent * 0.3f;
            canvas.drawCircle(x + diameter / 2f, centerY, diameter / 2f, paint);
            paint.setColor(oldColor);
        }
    }
}
