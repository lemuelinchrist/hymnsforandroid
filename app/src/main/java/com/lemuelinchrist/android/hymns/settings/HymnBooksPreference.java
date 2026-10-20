package com.lemuelinchrist.android.hymns.settings;

import android.content.Context;
import android.database.Cursor;
import android.util.AttributeSet;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;
import androidx.preference.MultiSelectListPreference;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsSqliteHelper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * "Hymn Books" setting: a list of every hymn book with its icon, where a tick means the book is shown.
 * It still saves the books that are <b>hidden</b> under the old "disableLanguages" key, so existing
 * settings carry over and the drawer, search and "Also in" chips read it as before.
 */
public class HymnBooksPreference extends MultiSelectListPreference {

    private static final int NAMES_IN_SUMMARY = 3;

    public HymnBooksPreference(Context context, AttributeSet attrs) {
        super(context, attrs);
        setEntries(HymnGroup.getArrayOfSimpleNames());
        setEntryValues(HymnGroup.getArrayOfCodes());
        setSummaryProvider(new SummaryProvider<HymnBooksPreference>() {
            @Override
            public CharSequence provideSummary(HymnBooksPreference preference) {
                return summaryOf(hiddenBooks());
            }
        });
    }

    /** "All 23 hymn books shown", "Hiding B.Indonesia" or "Hiding 5 hymn books". */
    private static String summaryOf(List<HymnGroup> hidden) {
        if (hidden.isEmpty()) return "All " + HymnGroup.values().length + " hymn books shown";
        if (hidden.size() > NAMES_IN_SUMMARY) return "Hiding " + hidden.size() + " hymn books";
        StringBuilder names = new StringBuilder();
        for (HymnGroup group : hidden) {
            if (names.length() > 0) names.append(", ");
            names.append(group.getSimpleName());
        }
        return "Hiding " + names;
    }

    /** The hidden books, in the order of the book list. */
    private List<HymnGroup> hiddenBooks() {
        Set<String> hidden = getValues();
        List<HymnGroup> result = new ArrayList<>();
        for (HymnGroup group : HymnGroup.values()) {
            if (hidden.contains(group.name())) result.add(group);
        }
        return result;
    }

    @Override
    protected void onClick() {
        final HymnGroup[] groups = HymnGroup.values();
        final boolean[] shown = new boolean[groups.length];
        Set<String> hidden = getValues();
        for (int i = 0; i < groups.length; i++) shown[i] = !hidden.contains(groups[i].name());

        Context context = getContext();
        View content = LayoutInflater.from(context).inflate(R.layout.settings_hymn_books, null);
        ListView list = content.findViewById(R.id.hymnBookList);
        final BookAdapter adapter = new BookAdapter(context, groups, shown, countHymns(context));
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, position, id) -> {
            shown[position] = !shown[position];
            adapter.notifyDataSetChanged();
        });

        new AlertDialog.Builder(context)
                .setTitle("Show these hymn books")
                .setView(content)
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton(android.R.string.ok, (dialog, which) -> {
                    Set<String> newHidden = new HashSet<>();
                    for (int i = 0; i < groups.length; i++) {
                        if (!shown[i]) newHidden.add(groups[i].name());
                    }
                    if (newHidden.size() == groups.length) {
                        Toast.makeText(getContext(), "At least one hymn book has to stay shown", Toast.LENGTH_LONG).show();
                        return;
                    }
                    if (callChangeListener(newHidden)) setValues(newHidden);
                })
                .show();
    }

    /** Number of hymns in each book, for the second line of each row. Empty if the database can't be read. */
    private static Map<String, Integer> countHymns(Context context) {
        Map<String, Integer> counts = new HashMap<>();
        try (Cursor cursor = HymnsSqliteHelper.getInstance(context).getReadableDatabase()
                .rawQuery("select hymn_group, count(*) from hymns group by hymn_group", null)) {
            while (cursor.moveToNext()) counts.put(cursor.getString(0), cursor.getInt(1));
        } catch (Exception e) {
            Log.w(HymnBooksPreference.class.getSimpleName(), "Could not count hymns per book", e);
        }
        return counts;
    }

    private static class BookAdapter extends ArrayAdapter<HymnGroup> {
        private final boolean[] shown;
        private final Map<String, Integer> counts;

        BookAdapter(Context context, HymnGroup[] groups, boolean[] shown, Map<String, Integer> counts) {
            super(context, R.layout.settings_hymn_book_row, groups);
            this.shown = shown;
            this.counts = counts;
        }

        @Override
        public View getView(int position, View row, ViewGroup parent) {
            if (row == null) {
                row = LayoutInflater.from(getContext()).inflate(R.layout.settings_hymn_book_row, parent, false);
            }
            HymnGroup group = getItem(position);
            Context context = getContext();
            ((ImageView) row.findViewById(R.id.hymnBookIcon)).setImageResource(context.getResources()
                    .getIdentifier(group.name().toLowerCase(), "drawable", context.getPackageName()));
            ((TextView) row.findViewById(R.id.hymnBookName)).setText(group.getSimpleName());
            TextView count = row.findViewById(R.id.hymnBookCount);
            Integer hymns = counts.get(group.name());
            count.setVisibility(hymns == null ? View.GONE : View.VISIBLE);
            if (hymns != null) count.setText(hymns + (hymns == 1 ? " hymn" : " hymns"));
            ((CheckBox) row.findViewById(R.id.hymnBookShown)).setChecked(shown[position]);
            return row;
        }
    }
}
