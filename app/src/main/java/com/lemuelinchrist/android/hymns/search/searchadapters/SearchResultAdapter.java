package com.lemuelinchrist.android.hymns.search.searchadapters;

import android.content.Context;
import android.graphics.Typeface;
import android.text.Html;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;

import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.entities.Stanza;
import com.lemuelinchrist.android.hymns.search.HymnSearch;
import com.lemuelinchrist.android.hymns.search.IndexViewHolder;
import com.lemuelinchrist.android.hymns.search.SearchAdapter;
import com.lemuelinchrist.android.hymns.search.SearchText;

import java.util.List;

/**
 * The Search tab's results: "E123 - first line" with the matched words in bold, and, when the first line isn't what
 * matched, a second line that shows why (the chorus or stanza line, or the subject, author or tune). An optional
 * first row "Go to E123" when a hymn number or ID was typed.
 *
 * @since 2026-10-28
 */
public class SearchResultAdapter extends SearchAdapter {

    private static final int WHY_COLOR = 0xFF757575;

    private final List<HymnSearch.Result> results;
    private final List<String> terms;
    private final String goTo;
    private final HymnsDao dao;

    public SearchResultAdapter(Context context, int layout, String goTo, List<HymnSearch.Result> results,
                               List<String> terms, HymnsDao dao) {
        super(context, layout);
        this.goTo = goTo;
        this.results = results;
        this.terms = terms;
        this.dao = dao;
    }

    @Override
    public int getItemCount() {
        return results.size() + (goTo == null ? 0 : 1);
    }

    @Override
    protected void provisionHolder(IndexViewHolder holder, int position) {
        if (goTo != null) {
            if (position == 0) {
                holder.hymnNo = goTo;
                holder.list_item.setText(Html.fromHtml("Go to <b>" + goTo + "</b>"));
                setIcon(holder, goTo.replaceAll("[0-9]", ""));
                return;
            }
            position--;
        }
        HymnSearch.Result r = results.get(position);
        holder.hymnNo = r.id;
        setIcon(holder, r.group.name());

        SpannableStringBuilder text = new SpannableStringBuilder();
        text.append(r.id, new StyleSpan(Typeface.BOLD), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        text.append(" - ");
        appendHighlighted(text, r.line);
        String why = r.where == HymnSearch.Where.FIRST ? null : whyLine(r);
        // a line that only repeats the first line adds nothing
        if (why != null && !why.isEmpty() && !SearchText.norm(why).equals(SearchText.norm(r.line))) {
            text.append("\n");
            int start = text.length();
            appendHighlighted(text, why);
            text.setSpan(new ForegroundColorSpan(WHY_COLOR), start, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            text.setSpan(new RelativeSizeSpan(0.85f), start, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        holder.list_item.setText(text);
    }

    private void setIcon(IndexViewHolder holder, String group) {
        holder.imageView.setImageResource(context.getResources().getIdentifier(group.toLowerCase(), "drawable",
                context.getPackageName()));
    }

    // the line that shows why the hymn matched, read from the hymn itself
    private String whyLine(HymnSearch.Result r) {
        Hymn hymn = dao.get(r.id);
        if (hymn == null) return null;
        switch (r.where) {
            case CHORUS:
                return hymn.getFirstChorusLine();
            case SUBJECT:
                return "Subject: " + join(" – ", hymn.getMainCategory(), hymn.getSubCategory());
            case PEOPLE:
                return join(" · ", label("Author: ", hymn.getAuthor()), label("Composer: ", hymn.getComposer()));
            case MUSIC:
                return join(" · ", label("Key: ", hymn.getKey()), label("Tune: ", hymn.getTune()));
            default:
                return bestLine(hymn, r.line);
        }
    }

    // the stanza line with the most of the words (the first one if several have all of them), other than the first
    // line, which the row already shows
    private String bestLine(Hymn hymn, String shown) {
        String best = null;
        int bestHits = 0;
        if (hymn.getStanzas() == null) return null;
        String skip = SearchText.norm(shown);
        for (Stanza stanza : hymn.getStanzas()) {
            if (stanza.getText() == null) continue;
            for (String line : stanza.getText().split("(?i)<br\\s*/?>|\n")) {
                String n = SearchText.norm(line);
                if (n.equals(skip)) continue;
                int hits = 0;
                for (String t : terms) if (HymnSearch.found(n, t)) hits++;
                if (hits > bestHits) {
                    bestHits = hits;
                    best = Html.fromHtml(line).toString().trim();
                    if (hits == terms.size()) return best;
                }
            }
        }
        return best;
    }

    private void appendHighlighted(SpannableStringBuilder out, String text) {
        if (text == null) return;
        int base = out.length();
        out.append(text);
        String folded = SearchText.fold(text);
        for (String term : terms) {
            boolean wholeOnly = HymnSearch.isShortWord(term);
            for (int i = folded.indexOf(term); i >= 0; i = folded.indexOf(term, i + term.length())) {
                if (wholeOnly && !wholeWordAt(folded, i, term.length())) continue;
                out.setSpan(new StyleSpan(Typeface.BOLD), base + i, base + i + term.length(),
                        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }
        }
    }

    private static boolean wholeWordAt(String text, int start, int length) {
        int end = start + length;
        return (start == 0 || !Character.isLetterOrDigit(text.charAt(start - 1)))
                && (end == text.length() || !Character.isLetterOrDigit(text.charAt(end)));
    }

    private static String label(String label, String value) {
        return value == null || value.trim().isEmpty() ? null : label + value.trim();
    }

    private static String join(String separator, String... parts) {
        StringBuilder out = new StringBuilder();
        for (String p : parts) {
            if (p == null || p.trim().isEmpty() || p.equals("null")) continue;
            if (out.length() > 0) out.append(separator);
            out.append(p.trim());
        }
        return out.toString();
    }
}
