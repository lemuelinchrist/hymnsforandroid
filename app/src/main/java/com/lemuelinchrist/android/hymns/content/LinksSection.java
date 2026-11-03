package com.lemuelinchrist.android.hymns.content;

import android.content.Intent;
import android.net.Uri;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.TextPaint;
import android.text.method.LinkMovementMethod;
import android.text.style.ClickableSpan;
import android.util.TypedValue;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.TableLayout;
import android.widget.TableRow;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.style.BookColors;

import java.util.ArrayList;

/**
 * The card at the bottom of a hymn for links that open outside the app (below the details card): today the hymn's
 * piano videos ("Piano videos: 1st tune ↗ · 2nd tune ↗", its parent's when it has none), from the {@code link} table.
 * The card hides itself when there is nothing to show.
 */
public class LinksSection extends ContentComponent<View> {
    private static final String ARROW = " \u2197";

    private final TableLayout table;
    private final float size;

    public LinksSection(Hymn hymn, Fragment parentFragment, View card, float lyricSize) {
        super(hymn, parentFragment, card);
        this.table = card.findViewById(R.id.linksTable);
        // for reference, so a little smaller than the lyrics, as the details card is
        this.size = lyricSize - 2;
    }

    public void display() {
        if (hymn == null) {
            view.setVisibility(View.GONE);
            return;
        }
        ArrayList<String[]> videos = new ArrayList<>();
        HymnsDao dao = new HymnsDao(context);
        try {
            dao.open();
            videos = dao.getLinksOrParent(hymn.getHymnId(), hymn.getParentHymn(), "piano");
        } catch (Exception e) {
            // no videos then
        } finally {
            dao.close();
        }

        if (!videos.isEmpty()) {
            String[][] parts = new String[videos.size()][];
            for (int i = 0; i < parts.length; i++) {
                parts[i] = new String[]{videos.get(i)[0].trim(), embedAddress(videos.get(i)[1])};
            }
            addRow("Piano videos", parts);
        }
        if (table.getChildCount() == 0) view.setVisibility(View.GONE);
    }

    /** The table keeps the watch address of a video; the card has always opened its embed address. */
    private static String embedAddress(String url) {
        return url.trim().replace("https://www.youtube.com/watch?v=", "https://www.youtube.com/embed/");
    }

    /** One row, label | links: parts are {shown text, address}, joined by " · ". */
    private void addRow(String label, String[][] parts) {
        TableRow row = (TableRow) LayoutInflater.from(context).inflate(R.layout.detail_row, table, false);
        TextView labelView = row.findViewById(R.id.detailLabel);
        labelView.setText(label);
        labelView.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        TextView valueView = row.findViewById(R.id.detailValue);
        valueView.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);

        SpannableStringBuilder text = new SpannableStringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) text.append(" \u00b7 ");
            int start = text.length();
            text.append(parts[i][0]).append(ARROW);
            final String address = parts[i][1];
            text.setSpan(new ClickableSpan() {
                @Override
                public void onClick(@NonNull View widget) {
                    context.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(address)));
                }

                @Override
                public void updateDrawState(@NonNull TextPaint ds) {
                    ds.setColor(BookColors.accent(context, hymn.getHymnGroup()));
                    ds.setUnderlineText(true);
                }
            }, start, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        valueView.setText(text);
        // links and selecting text don't go together
        valueView.setTextIsSelectable(false);
        valueView.setMovementMethod(LinkMovementMethod.getInstance());
        table.addView(row);
    }
}
