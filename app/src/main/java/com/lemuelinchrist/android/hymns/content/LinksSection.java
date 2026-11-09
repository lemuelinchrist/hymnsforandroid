package com.lemuelinchrist.android.hymns.content;

import android.content.Context;
import android.content.Intent;
import android.graphics.PorterDuff;
import android.net.Uri;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.DrawableRes;
import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.HymnSwitcher;
import com.lemuelinchrist.android.hymns.HymnsActivity;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.entities.Recording;
import com.lemuelinchrist.android.hymns.style.BookColors;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The card at the bottom of a hymn for links that open outside the app (below the details card), in sections:
 * Recordings (the hymn's YouTube and SoundCloud links, or those of the nearest hymn above it that has some), Piano
 * videos (its parent's when it has none) and New tunes (the Be Filled hymns that put another tune to its words, each
 * with its own recordings under it). Every link is a row of at least 56 dp (icon, who made it, which album, an arrow);
 * on windows 600 dp and wider ({@code R.integer.links_columns} above 1: an unfolded foldable, a tablet) the links are
 * cards in a grid. A section shows its first {@link #SHOWN} links and a "Show N more" button; the links a book's editor
 * chose (a {@link Recording#isPinned() pinned} link: the Spanish and German youth books) are always shown.
 * The card hides itself when there is nothing to show.
 */
public class LinksSection extends ContentComponent<View> {
    private static final String ARROW = "↗";
    private static final String HYMN = "hymn:";   // an address that is a hymn of the app, not a web page
    private static final int SHOWN = 3;           // links a section shows before "Show N more"

    private final LinearLayout list;
    private final float size;
    private final int columns;
    private final Set<String> expanded = new HashSet<>();

    /** One link of the card: icon, up to two lines, an address. A New Tune's recordings are its children. */
    private static class Item {
        @DrawableRes int icon;
        String title;
        String sub;          // null: no second line
        boolean tag;         // "Instrumental" after the title
        String address;
        boolean pinned;
        List<Item> children = new ArrayList<>();
    }

    private ArrayList<String[]> videos = new ArrayList<>();
    private final List<Item> recordings = new ArrayList<>();
    private final List<Item> tunes = new ArrayList<>();

    public LinksSection(Hymn hymn, Fragment parentFragment, View card, float lyricSize) {
        super(hymn, parentFragment, card);
        this.list = card.findViewById(R.id.linksList);
        // for reference, so a little smaller than the lyrics, as the details card is
        this.size = lyricSize - 2;
        this.columns = Math.max(1, context.getResources().getInteger(R.integer.links_columns));
    }

    public void display() {
        if (hymn == null) {
            view.setVisibility(View.GONE);
            return;
        }
        load();
        render();
    }

    private void load() {
        videos = new ArrayList<>();
        recordings.clear();
        tunes.clear();
        HymnsDao dao = new HymnsDao(context);
        try {
            dao.open();
            videos = dao.getLinksOrParent(hymn.getHymnId(), hymn.getParentHymn(), "piano");
            ArrayList<Recording> own = dao.getRecordings(hymn.getHymnId());
            String language = null;
            if (own.isEmpty()) {
                // no recording of its own: the nearest hymn above it that has one (an English hymn's for a translation, ...)
                String ancestor = dao.getLinkedAncestor(hymn.getParentHymn());
                if (ancestor != null && !ancestor.equals(hymn.getHymnId())) {
                    own = dao.getRecordings(ancestor);
                    HymnGroup ancestorGroup = HymnGroup.getHymnGroupFromID(ancestor);
                    if (ancestorGroup.languageBook() != hymn.getHymnGroup().languageBook()) {
                        language = ancestorGroup.getLanguageName(context);
                    }
                }
            }
            for (Recording r : own) recordings.add(item(r, language, null));
            for (String id : dao.getNewTunes(hymn.getHymnId())) {
                Item tune = new Item();
                tune.icon = R.drawable.ic_set_tune;
                tune.title = context.getString(R.string.links_new_tune_title, id);
                tune.sub = context.getString(R.string.links_new_tune_sub);
                tune.address = HYMN + id;
                for (Recording r : dao.getRecordings(id)) tune.children.add(item(r, null, id));
                tunes.add(tune);
            }
        } catch (Exception e) {
            // no links then
        } finally {
            dao.close();
        }
    }

    /**
     * A recording as a link: its first line is the publisher, else the album. In another language than the hymn's it is
     * labelled with the language ("English – NYCYPCD"), so nobody takes an English recording for a Spanish one. A New
     * Tune's recording says which tune in its second line ("BF94 · album").
     */
    private Item item(Recording r, String language, String tuneId) {
        Item item = new Item();
        item.icon = "soundcloud".equals(r.kind) ? R.drawable.ic_queue_music_white_48dp : R.drawable.ic_play_arrow_white_48dp;
        item.title = language == null ? r.title() : context.getString(R.string.links_language_label, language, r.title());
        item.sub = r.subtitle();
        if (tuneId != null) item.sub = item.sub == null ? tuneId : tuneId + " · " + item.sub;
        item.tag = r.instrumental;
        item.address = r.url;
        item.pinned = r.isPinned();
        return item;
    }

    private void render() {
        list.removeAllViews();
        addSection("rec", context.getString(R.string.links_recordings), recordings);
        List<Item> piano = new ArrayList<>();
        for (String[] v : videos) {
            Item item = new Item();
            item.icon = R.drawable.ic_set_piano;
            String label = v[0] == null ? "" : v[0].trim();
            item.title = label.isEmpty() ? context.getString(R.string.links_video) : label;
            item.sub = context.getString(R.string.links_piano_sub);
            item.address = embedAddress(v[1]);
            piano.add(item);
        }
        addSection("piano", context.getString(R.string.links_piano_videos), piano);
        addSection("tunes", context.getString(R.string.links_new_tunes), tunes);
        view.setVisibility(list.getChildCount() == 0 ? View.GONE : View.VISIBLE);
    }

    /** A section: its heading with the count, the links (the first few, or all), and the "Show N more" button. */
    private void addSection(String key, String title, List<Item> items) {
        if (items.isEmpty()) return;
        boolean open = expanded.contains(key);
        List<Item> shown = new ArrayList<>();
        int others = 0;
        for (Item item : items) {
            if (item.pinned || open || ++others <= SHOWN) shown.add(item);
        }
        int hidden = items.size() - shown.size();

        LinearLayout heading = new LinearLayout(context);
        heading.setOrientation(LinearLayout.HORIZONTAL);
        TextView name = new TextView(context, null, 0, R.style.HymnLabel);
        name.setText(title.toUpperCase(context.getResources().getConfiguration().getLocales().get(0)));
        name.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView count = new TextView(context, null, 0, R.style.HymnLabel);
        count.setText(String.valueOf(items.size()));
        heading.addView(name);
        heading.addView(count);
        heading.setPadding(0, dp(list.getChildCount() == 0 ? 0 : 14), 0, dp(4));
        list.addView(heading);

        if (columns > 1) {
            GridLayout grid = new GridLayout(context);
            grid.setColumnCount(columns);
            for (Item item : shown) {
                addTile(grid, item);
                for (Item child : item.children) addTile(grid, child);
            }
            list.addView(grid);
        } else {
            LinearLayout rows = new LinearLayout(context);
            rows.setOrientation(LinearLayout.VERTICAL);
            boolean first = true;
            for (Item item : shown) {
                addRow(rows, item, false, first);
                first = false;
                for (Item child : item.children) addRow(rows, child, true, false);
            }
            list.addView(rows);
        }

        if (hidden > 0 || open) {
            TextView more = new TextView(context);
            more.setText(open ? context.getString(R.string.links_show_fewer) : context.getString(R.string.links_show_more, hidden));
            more.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
            more.setTextColor(BookColors.accent(context, hymn.getHymnGroup()));
            more.setTypeface(more.getTypeface(), android.graphics.Typeface.BOLD);
            more.setGravity(Gravity.CENTER);
            more.setMinHeight(dp(44));
            more.setBackgroundResource(R.drawable.link_more_bg);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.topMargin = dp(6);
            more.setLayoutParams(lp);
            more.setOnClickListener(v -> {
                if (!expanded.remove(key)) expanded.add(key);
                render();
            });
            list.addView(more);
        }
    }

    private void addRow(LinearLayout parent, Item item, boolean child, boolean first) {
        if (!first) {
            View divider = new View(context);
            divider.setBackgroundColor(dividerColor());
            LinearLayout.LayoutParams dp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1);
            dp.leftMargin = child ? dp(44) : 0;
            divider.setLayoutParams(dp);
            parent.addView(divider);
        }
        View row = LayoutInflater.from(context).inflate(R.layout.link_row, parent, false);
        if (child) row.setPadding(dp(44), row.getPaddingTop(), 0, row.getPaddingBottom());
        fill(row, item);
        TextView arrow = row.findViewById(R.id.linkArrow);
        arrow.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        arrow.setText(item.address.startsWith(HYMN) ? "›" : ARROW);
        parent.addView(row);
    }

    private void addTile(GridLayout grid, Item item) {
        View tile = LayoutInflater.from(context).inflate(R.layout.link_tile, grid, false);
        fill(tile, item);
        GridLayout.LayoutParams lp = new GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED, 1f), GridLayout.spec(GridLayout.UNDEFINED, 1f));
        lp.width = 0;
        lp.setMargins(dp(3), dp(3), dp(3), dp(3));
        tile.setLayoutParams(lp);
        grid.addView(tile);
    }

    /** The icon, the two lines and the tap of a row or card. */
    private void fill(View row, Item item) {
        ImageView icon = row.findViewById(R.id.linkIcon);
        icon.setImageResource(item.icon);
        icon.setColorFilter(BookColors.accent(context, hymn.getHymnGroup()), PorterDuff.Mode.SRC_IN);
        TextView title = row.findViewById(R.id.linkTitle);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        SpannableStringBuilder text = new SpannableStringBuilder(item.title);
        if (item.tag) {
            int start = text.length();
            text.append(" · ").append(context.getString(R.string.links_instrumental));
            text.setSpan(new ForegroundColorSpan(themeColor(R.attr.hymnTextMuted)), start, text.length(),
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        title.setText(text);
        TextView sub = row.findViewById(R.id.linkSub);
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, size - 2);
        if (item.sub == null) {
            sub.setVisibility(View.GONE);
        } else {
            sub.setText(item.sub);
        }
        final String address = item.address;
        row.setOnClickListener(v -> open(address));
    }

    private void open(String address) {
        if (address.startsWith(HYMN)) {
            HymnSwitcher hymnSwitcher = HymnsActivity.getHymnSwitcher();
            if (hymnSwitcher != null) hymnSwitcher.switchToHymnFromTop(address.substring(HYMN.length()));
        } else {
            context.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(address)));
        }
    }

    /** The table keeps the watch address of a video; the card has always opened its embed address. */
    private static String embedAddress(String url) {
        return url.trim().replace("https://www.youtube.com/watch?v=", "https://www.youtube.com/embed/");
    }

    private int dividerColor() {
        return themeColor(R.attr.hymnBadgeBackground);
    }

    private int themeColor(int attr) {
        TypedValue value = new TypedValue();
        context.getTheme().resolveAttribute(attr, value, true);
        return value.data;
    }

    private int dp(int dp) {
        return Math.round(dp * context.getResources().getDisplayMetrics().density);
    }
}
