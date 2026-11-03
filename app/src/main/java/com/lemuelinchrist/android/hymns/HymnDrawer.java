package com.lemuelinchrist.android.hymns;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.content.ContentArea;
import com.lemuelinchrist.android.hymns.logbook.HymnRecord;
import com.lemuelinchrist.android.hymns.logbook.LogBook;
import com.lemuelinchrist.android.hymns.settings.HymnBooksPreference;
import com.lemuelinchrist.android.hymns.style.BookColors;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The book drawer's list: every book in the usual order, as it was before v5.8 (the RECENT section of v5.8 was taken out
 * again on 2026-11-02: the saints are used to the fixed order; {@link #booksByRecency} still orders the Hymn Numbers tab).
 * Hidden books (Settings, Languages (Hymn Books)) are left out. A row is the book's badge picture, its name and its
 * number of hymns; the current book is highlighted.
 *
 * Created by lemuelcantos on 14/8/13.
 */
public class HymnDrawer extends BaseAdapter {
    static final int RECENT_BOOKS = 4;
    private static final int SECTION = 0, BOOK = 1;

    private final Context context;
    private final HymnGroup current;
    private final Map<String, Integer> counts;
    // a String is a section heading, a HymnGroup a book
    private final List<Object> items = new ArrayList<>();

    public HymnDrawer(Context context, HymnGroup current) {
        this.context = context;
        this.current = current;
        this.counts = HymnBooksPreference.countHymns(context);

        // the books in their fixed order, as before v5.8: the saints know where each one is (the Recent section of
        // v5.8 was taken out again, 2026-11-02)
        items.addAll(shownBooks(context));
    }

    private static List<HymnGroup> shownBooks(Context context) {
        SharedPreferences sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context);
        Set<String> disabled = sharedPreferences.getStringSet("disableLanguages", new HashSet<String>());
        List<HymnGroup> shown = new ArrayList<>();
        for (HymnGroup hymnGroup : HymnGroup.values()) {
            if (!disabled.contains(hymnGroup.name())) shown.add(hymnGroup);
        }
        return shown;
    }

    /**
     * Every book in the order a number's hymns should be listed (Hymn Numbers tab): the Recent books of the drawer
     * (the current one, then those of the latest hymns in History), then the others in the drawer's order.
     */
    public static List<HymnGroup> booksByRecency(Context context, HymnGroup current) {
        List<HymnGroup> books = recentBooks(context, current, shownBooks(context));
        for (HymnGroup group : HymnGroup.values()) {
            if (!books.contains(group)) books.add(group);
        }
        return books;
    }

    /** The current book, then the books of the latest hymns in History, each once. */
    private static List<HymnGroup> recentBooks(Context context, HymnGroup current, List<HymnGroup> shown) {
        List<HymnGroup> recent = new ArrayList<>();
        if (current != null && shown.contains(current)) recent.add(current);
        for (HymnRecord record : new LogBook(context, ContentArea.HISTORY_LOGBOOK_FILE).getOrderedRecordList()) {
            if (recent.size() >= RECENT_BOOKS) break;
            try {
                HymnGroup group = HymnGroup.getHymnGroupFromID(record.getHymnId());
                if (shown.contains(group) && !recent.contains(group)) recent.add(group);
            } catch (NoSuchHymnGroupException e) {
                // a book this version doesn't know: leave it out
            }
        }
        return recent;
    }

    /** The book at this row, or null for a heading. */
    public HymnGroup getSelectedHymnGroup(int position) {
        Object item = items.get(position);
        return item instanceof HymnGroup ? (HymnGroup) item : null;
    }

    @Override
    public int getCount() {
        return items.size();
    }

    @Override
    public Object getItem(int position) {
        return items.get(position);
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public int getViewTypeCount() {
        return 2;
    }

    @Override
    public int getItemViewType(int position) {
        return items.get(position) instanceof HymnGroup ? BOOK : SECTION;
    }

    @Override
    public boolean areAllItemsEnabled() {
        return false;
    }

    @Override
    public boolean isEnabled(int position) {
        return getItemViewType(position) == BOOK;
    }

    @Override
    public View getView(int position, View row, ViewGroup parent) {
        if (getItemViewType(position) == SECTION) {
            if (row == null) row = LayoutInflater.from(context).inflate(R.layout.drawer_section, parent, false);
            ((TextView) row.findViewById(R.id.drawerSectionTitle)).setText((String) items.get(position));
            row.findViewById(R.id.drawerSectionLine).setVisibility(position == 0 ? View.GONE : View.VISIBLE);
            return row;
        }

        if (row == null) row = LayoutInflater.from(context).inflate(R.layout.drawer_hymngroup_list, parent, false);
        HymnGroup group = (HymnGroup) items.get(position);
        boolean isCurrent = group == current;

        ((ImageView) row.findViewById(R.id.hymnGroupImage)).setImageResource(context.getResources()
                .getIdentifier(group.name().toLowerCase(Locale.ROOT), "drawable", context.getPackageName()));

        TextView name = row.findViewById(R.id.hymnGroupName);
        name.setText(group.getSimpleName());
        if (isCurrent) name.setTextColor(BookColors.drawerHighlightText(context, group));
        else name.setTextColor(context.getColor(R.color.drawer_text));
        name.setTypeface(isCurrent ? Typeface.create("sans-serif-medium", Typeface.NORMAL) : Typeface.DEFAULT);

        TextView count = row.findViewById(R.id.hymnGroupCount);
        Integer hymns = counts.get(group.name());
        count.setVisibility(hymns == null ? View.GONE : View.VISIBLE);
        if (hymns != null) count.setText(String.format(Locale.ENGLISH, "%,d %s", hymns, hymns == 1 ? "hymn" : "hymns"));

        View highlight = row.findViewById(R.id.hymnGroupHighlight);
        highlight.setVisibility(isCurrent ? View.VISIBLE : View.GONE);
        if (isCurrent) highlight.setBackgroundTintList(ColorStateList.valueOf(BookColors.drawerHighlight(context, group)));
        return row;
    }
}
