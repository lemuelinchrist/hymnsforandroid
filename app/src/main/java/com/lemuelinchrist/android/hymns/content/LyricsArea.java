package com.lemuelinchrist.android.hymns.content;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.preference.PreferenceManager;
import android.text.Html;
import android.text.SpannableString;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.TextPaint;
import android.text.method.LinkMovementMethod;
import android.text.style.ClickableSpan;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TableLayout;
import android.widget.TableRow;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.core.widget.NestedScrollView;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.HymnsActivity;
import com.lemuelinchrist.android.hymns.NoSuchHymnGroupException;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.entities.Stanza;
import com.lemuelinchrist.android.hymns.style.HymnTextFormatter;
import com.lemuelinchrist.android.hymns.style.ScriptFont;
import com.lemuelinchrist.android.hymns.style.BookColors;
import java.util.*;

/**
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public class LyricsArea extends ContentComponent<NestedScrollView> {
    private final TextView subjectHeader;
    private final ViewGroup stanzaView;
    private final OtherLanguagesSection otherLanguages;
    private final LinksSection links;
    private final TableLayout detailsTable;
    private final SharedPreferences sharedPreferences;
    private int columnNo=0;
    private LinearLayout currentTextLinearLayout;
    private static float fontSize;
    private final Set<String> disabledLanguages;


    public LyricsArea(Hymn hymn, Fragment parentFragment, NestedScrollView view) {
        super(hymn, parentFragment, view);

        // Load saved data
        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context);
        fontSize = Float.parseFloat(sharedPreferences.getString("FontSize", "18f"));
        disabledLanguages = sharedPreferences.getStringSet("disableLanguages",new HashSet<String>());

        // remove placeholder because it only contains dummy lyrics
        stanzaView = view.findViewById(getRid("stanzaView"));
        stanzaView.removeView(stanzaView.getChildAt(0));

        subjectHeader = view.findViewById(getRid("subjectHeader"));
        subjectHeader.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);

        // the details card at the bottom is for reference, so a little smaller than the lyrics
        detailsTable = view.findViewById(getRid("detailsTable"));

        otherLanguages = new OtherLanguagesSection(hymn, parentFragment, (ViewGroup) view.findViewById(getRid("otherLanguagesContainer")));
        links = new LinksSection(hymn, parentFragment, view.findViewById(getRid("linksCard")), fontSize);

    }

    private int getRid(String lyricHeader) {
        return context.getResources().getIdentifier(lyricHeader, "id", context
                .getPackageName());
    }

    public void displayLyrics() {
        try {
            Log.d(this.getClass().getSimpleName(), "Displaying lyrics");

            //if hymn is still null, it means the user entered a hymn number that doesn't exist
            if (hymn == null) return;

            // ########################### Build Header: subject, then the other languages' numbers
            // (the header card always stays: the buttons are in it)
            StringBuilder text = new StringBuilder();
            if (isNotEmpty(hymn.getMainCategory())) {
                text.append("<b>" + hymn.getMainCategory() + "</b>");
            }
            if (isNotEmpty(hymn.getSubCategory())) {
                text.append("<br/>" + hymn.getSubCategory());
            }
            if (hymn.isNewTune()) text.append("<br/>(New Tune)");
            if (text.length() > 0) {
                ScriptFont.apply(subjectHeader, hymn.getHymnGroup());
                subjectHeader.setText(Html.fromHtml(text.toString()));
            } else {
                subjectHeader.setVisibility(View.GONE);
            }
            otherLanguages.display();

            // ########################### Build Details (the card at the bottom): label | value rows, only the items we have
            // each value but the verses opens the Search tab with that value
            if (isNotEmpty(hymn.getMeter())) addDetail("Meter", "music", new String[][]{{hymn.getMeter(), phrase(hymn.getMeter())}});
            if (isNotEmpty(hymn.getTime())) {
                // time and key share a row: "4/4 · Ab Major", each searched on its own
                addDetail("Time", "music", isNotEmpty(hymn.getKey())
                        ? new String[][]{{hymn.getTime(), phrase(hymn.getTime())}, {" · ", null}, {hymn.getKey(), hymn.getKey()}}
                        : new String[][]{{hymn.getTime(), phrase(hymn.getTime())}});
            } else if (isNotEmpty(hymn.getKey())) {
                addDetail("Key", "music", new String[][]{{hymn.getKey(), hymn.getKey()}});
            }
            if (isNotEmpty(hymn.getTune()) && !hymn.getTune().equals("0"))
                addDetail("Tune", "music", new String[][]{{hymn.getTune(), phrase(hymn.getTune())}});
            if (isNotEmpty(hymn.getVerse())) addVerses(Scripture.parse(hymn.getVerse()));
            if (isNotEmpty(hymn.getAuthor()))
                addDetail("Author", "people", new String[][]{{hymn.getAuthor(), personOf(hymn.getAuthor())}});
            if (isNotEmpty(hymn.getComposer()))
                addDetail("Composer", "people", new String[][]{{hymn.getComposer(), personOf(hymn.getComposer())}});
            if (detailsTable.getChildCount() == 0) {
                view.findViewById(getRid("detailsCard")).setVisibility(View.GONE);
            }
            // the card below it: piano videos and the hymnal.net page
            links.display();

            // ######################## Build Lyric Text

            String chorusText = "";
            text = new StringBuilder();
            ArrayList<Stanza> stanzas = hymn.getStanzas();
            for (Stanza stanza : stanzas) {
                Log.d(this.getClass().getSimpleName(), "Looping stanza: " + stanza.getNo());
                if (stanza.getNo().equals("chorus")) {
                    if (isNotEmpty(stanza.getNote()))
                        text.append("<i>@@(" + stanza.getNote() + ")@@</i>");
                    if(hymn.getHymnGroup().getTextAlignment()== Gravity.RIGHT) {
                        // no italics for right to left languages
                        chorusText = "@@" + stanza.getText() + "@@";
                    } else {
                        chorusText = "<i>@@" + stanza.getText() + "@@</i>";
                    }
                    text.append(chorusText);
                    buildLyricViewAndAttach(text, hymn.getHymnGroup(), false);
                    text = new StringBuilder();
                } else if (stanza.getNo().contains("note")) {
                    // notes get their own full-width row, regardless of where they fall in the hymn
                    text.append("<i>%%" + stanza.getText() + "%%</i>");
                    buildLyricViewAndAttach(text, hymn.getHymnGroup(), true);
                    text = new StringBuilder();
                } else {
                    // append stanza
                    text.append("<b>##" + stanza.getNo() + "##</b><br/>");
                    text.append(stanza.getText());
                    buildLyricViewAndAttach(text, hymn.getHymnGroup(), false);
                    text = new StringBuilder();


                    // append chorus after every stanza
                    if (hymn.getChorusCount() == 1 && !chorusText.isEmpty()) {
                        buildLyricViewAndAttach(new StringBuilder(chorusText), hymn.getHymnGroup(),
                                false);
                        text = new StringBuilder();
                    }
                }
            }

            // remove unused textview if uneven
            // if column is odd
            if (columnNo % 2 != 0) {
                removeColumn(currentTextLinearLayout, 1);
            }

        } catch (Exception e) {
            e.printStackTrace();
            Log.e(this.getClass().getSimpleName(), "Exception Thrown!!");
            Log.e(this.getClass().getSimpleName(), e.toString());
        }

    }

    private void buildLyricViewAndAttach(final StringBuilder text, HymnGroup selectedHymnGroup, boolean isFullWidthRow) {
        Log.i(this.getClass().getSimpleName(), text.toString());

        TextView view;
        if (isFullWidthRow) {
            // close out any half-filled row left pending by the previous stanza, since its
            // right column would otherwise be orphaned once currentTextLinearLayout is replaced below
            if (columnNo % 2 != 0) {
                removeColumn(currentTextLinearLayout, 1);
            }
            currentTextLinearLayout = newRow();
            stanzaView.addView(currentTextLinearLayout);
            view = column(currentTextLinearLayout, 0);
            // next stanza must start a fresh row rather than trying to fill this row's (removed) right column
            columnNo = 0;
        } else if (++columnNo % 2 != 0) {
            currentTextLinearLayout = newRow();
            stanzaView.addView(currentTextLinearLayout);
            // left column on landscape mode
            view = column(currentTextLinearLayout, 0);
        } else {
            // right column on landscape mode
            view = column(currentTextLinearLayout, 1);
        }

        // add colors to text
        CharSequence formattedLyrics = HymnTextFormatter.format(Html.fromHtml(text.toString()),
                BookColors.accent(context, selectedHymnGroup), BookColors.color(context, R.attr.hymnHighlight));
        view.setText(formattedLyrics);
        ScriptFont.apply(view, selectedHymnGroup);

        view.setGravity(hymn.getHymnGroup().getTextAlignment());

        // stylize...
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);

        // notes have a row exclusively to themselves
        if(isFullWidthRow)
            removeColumn(currentTextLinearLayout, 1);
    }

    private LinearLayout newRow() {
        return (LinearLayout) LayoutInflater.from(context).inflate(R.layout.stanza_linear_layout, null);
    }

    /**
     * A row's first (0) or second (1) block. Side by side (landscape, tablets), right to left books start on the right,
     * so the stanza is read before its chorus; the app isn't laid out right to left (no supportsRtl), hence by hand.
     */
    private TextView column(LinearLayout row, int i) {
        return (TextView) row.getChildAt(isRightToLeftRow(row) ? 1 - i : i);
    }

    private void removeColumn(LinearLayout row, int i) {
        row.removeView(column(row, i));
    }

    private boolean isRightToLeftRow(LinearLayout row) {
        return row.getChildCount() == 2 && row.getOrientation() == LinearLayout.HORIZONTAL
                && hymn.getHymnGroup().getTextAlignment() == Gravity.RIGHT;
    }

    /** One row of the details card (detail_row.xml), a little smaller than the lyrics. */
    /**
     * A row whose value is made of parts: {shown text, words to search} each; no words (null) = plain text. A part
     * opens the Search tab with its words, looked for only in the column of the search table the row belongs to
     * ("music" or "people"): "4/4" is a time there, but a scripture reference in a subject or the lyrics.
     */
    private void addDetail(String label, String column, String[][] parts) {
        TextView valueView = addDetailRow(label);
        SpannableStringBuilder text = new SpannableStringBuilder();
        for (String[] part : parts) {
            int start = text.length();
            text.append(part[0]);
            final String words = part[1];
            if (words == null || words.isEmpty()) continue;
            text.setSpan(new ClickableSpan() {
                @Override
                public void onClick(@NonNull View widget) {
                    searchFor(words, column);
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
    }

    /**
     * The row of Bible references: each one that can be read is a link to the Recovery Version text (see {@link Scripture}),
     * opened in the browser; the others stay plain text. Shown separated by commas, without the one the data ends with.
     */
    private void addVerses(List<Scripture.Ref> refs) {
        TextView valueView = addDetailRow("Verses");
        SpannableStringBuilder text = new SpannableStringBuilder();
        boolean anyLink = false;
        for (Scripture.Ref ref : refs) {
            if (text.length() > 0) text.append(", ");
            int start = text.length();
            text.append(ref.text);
            if (ref.url == null) continue;
            anyLink = true;
            final String url = ref.url;
            text.setSpan(new ClickableSpan() {
                @Override
                public void onClick(@NonNull View widget) {
                    openWebPage(url);
                }

                @Override
                public void updateDrawState(@NonNull TextPaint ds) {
                    ds.setColor(BookColors.accent(context, hymn.getHymnGroup()));
                    ds.setUnderlineText(true);
                }
            }, start, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        valueView.setText(text);
        if (anyLink) {
            // links and selecting text don't go together
            valueView.setTextIsSelectable(false);
            valueView.setMovementMethod(LinkMovementMethod.getInstance());
        }
    }

    private TextView addDetailRow(String label) {
        float size = fontSize - 2;
        TableRow row = (TableRow) LayoutInflater.from(context).inflate(R.layout.detail_row, detailsTable, false);
        TextView labelView = row.findViewById(R.id.detailLabel);
        labelView.setText(label);
        labelView.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        TextView valueView = row.findViewById(R.id.detailValue);
        valueView.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        detailsTable.addView(row);
        return valueView;
    }

    /**
     * Digits searched as an exact phrase: "4/4" and "8.5.8.3." are loose words ("4", "8", "5", "3") that nearly every
     * hymn has somewhere, in scripture references and verse numbers; as a phrase they match the time or meter.
     */
    private static String phrase(String value) {
        return "\"" + value.replace("\"", "") + "\"";
    }

    /** "Thomas Ken, v. 1 (1637-1711)" is searched as "Thomas Ken". */
    private static String personOf(String person) {
        return person.replaceAll("\\s*\\([^)]*\\)", "").replaceAll(",\\s*v\\.\\s*\\d+.*$", "").trim();
    }

    private void searchFor(String words, String column) {
        if (context instanceof HymnsActivity) ((HymnsActivity) context).openSearch(words, column);
    }

    private void openWebPage(String text) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(text));
        context.startActivity(intent);
    }

    private boolean isNotEmpty(String string) {
        return string!=null && !string.isEmpty();
    }
}
