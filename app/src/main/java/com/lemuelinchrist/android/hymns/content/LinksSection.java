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
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.HymnSwitcher;
import com.lemuelinchrist.android.hymns.HymnsActivity;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.style.BookColors;

import java.util.ArrayList;

/**
 * The card at the bottom of a hymn for links that open outside the app (below the details card): today the hymn's
 * piano videos ("Piano videos: 1st tune ↗ · 2nd tune ↗", its parent's when it has none), then its own YouTube and
 * SoundCloud links (the youth books), all from the {@code link} table (kinds piano, youtube, soundcloud).
 * The card hides itself when there is nothing to show.
 */
public class LinksSection extends ContentComponent<View> {
    private static final String ARROW = " \u2197";
    private static final String HYMN = "hymn:";   // an address that is a hymn of the app, not a web page

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
        ArrayList<String[]> youtube = new ArrayList<>();
        ArrayList<String[]> soundcloud = new ArrayList<>();
        ArrayList<String[]> newTunes = new ArrayList<>();         // {id, "hymn:" + id}
        ArrayList<String[]> newTuneRecordings = new ArrayList<>(); // {"BF455 – label", address}
        HymnsDao dao = new HymnsDao(context);
        try {
            dao.open();
            videos = dao.getLinksOrParent(hymn.getHymnId(), hymn.getParentHymn(), "piano");
            youtube = dao.getLinks(hymn.getHymnId(), "youtube");
            soundcloud = dao.getLinks(hymn.getHymnId(), "soundcloud");
            if (youtube.isEmpty() && soundcloud.isEmpty()) {
                // no recording of its own: the nearest hymn above it that has one (an English hymn's for a translation, ...)
                String ancestor = dao.getLinkedAncestor(hymn.getParentHymn());
                if (ancestor != null && !ancestor.equals(hymn.getHymnId())) {
                    String language = HymnGroup.getHymnGroupFromID(ancestor).getLanguage();
                    boolean sameLanguage = language.equals(hymn.getHymnGroup().getLanguage());
                    youtube = inherited(dao.getLinks(ancestor, "youtube"), sameLanguage ? null : language);
                    soundcloud = inherited(dao.getLinks(ancestor, "soundcloud"), sameLanguage ? null : language);
                }
            }
            for (String id : dao.getNewTunes(hymn.getHymnId())) {
                newTunes.add(new String[]{id, HYMN + id});
                ArrayList<String[]> recordings = dao.getLinks(id, "youtube");
                recordings.addAll(dao.getLinks(id, "soundcloud"));
                for (String[] r : recordings) {
                    String label = r[0] == null ? "" : r[0].trim();
                    newTuneRecordings.add(new String[]{label.isEmpty() ? id : id + " \u2013 " + label, r[1].trim()});
                }
            }
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
        addLinks("YouTube", youtube);
        addLinks("SoundCloud", soundcloud);
        // another tune for this hymn's words: the tunes themselves (open in the app), then their recordings
        if (!newTunes.isEmpty()) addRow("New tunes", newTunes.toArray(new String[0][]));
        if (!newTuneRecordings.isEmpty()) addRow("New tune recordings", newTuneRecordings.toArray(new String[0][]));
        if (table.getChildCount() == 0) view.setVisibility(View.GONE);
    }

    /**
     * Links taken from a hymn above this one. In another language each is labelled with that language, so nobody takes
     * an English recording for a Spanish one: "English ↗", "English 1 ↗ · English 2 ↗", "English – label ↗".
     */
    private static ArrayList<String[]> inherited(ArrayList<String[]> links, String language) {
        if (language == null) return links;
        ArrayList<String[]> labelled = new ArrayList<>();
        for (int i = 0; i < links.size(); i++) {
            String label = links.get(i)[0] == null ? "" : links.get(i)[0].trim();
            String shown = !label.isEmpty() ? language + " \u2013 " + label
                    : links.size() == 1 ? language : language + " " + (i + 1);
            labelled.add(new String[]{shown, links.get(i)[1]});
        }
        return labelled;
    }

    /** One row for the links of a kind: "Link 1 ↗ · Link 2 ↗" ("Link ↗" when there is one, its label when it has one). */
    private void addLinks(String label, ArrayList<String[]> links) {
        if (links.isEmpty()) return;
        String[][] parts = new String[links.size()][];
        for (int i = 0; i < parts.length; i++) {
            String shown = links.get(i)[0] == null ? "" : links.get(i)[0].trim();
            if (shown.isEmpty()) shown = links.size() == 1 ? "Link" : "Link " + (i + 1);
            parts[i] = new String[]{shown, links.get(i)[1].trim()};
        }
        addRow(label, parts);
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
            final String address = parts[i][1];
            final boolean inApp = address.startsWith(HYMN);
            text.append(parts[i][0]).append(inApp ? "" : ARROW);
            text.setSpan(new ClickableSpan() {
                @Override
                public void onClick(@NonNull View widget) {
                    if (inApp) {
                        HymnSwitcher hymnSwitcher = HymnsActivity.getHymnSwitcher();
                        if (hymnSwitcher != null) hymnSwitcher.switchToRelatedHymn(address.substring(HYMN.length()));
                    } else {
                        context.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(address)));
                    }
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
