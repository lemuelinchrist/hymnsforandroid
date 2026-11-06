package com.lemuelinchrist.android.hymns.settings;

import android.content.Context;
import android.database.Cursor;
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
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsSqliteHelper;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/**
 * The "Choose the languages to show" dialog of the Settings screen (its Hymn books row, and the drawer's
 * "Languages…" link): a list of every hymn book with its icon, where a tick means the book is shown.
 * The books that are <b>hidden</b> are saved under the old "disableLanguages" key by the caller, so existing
 * settings carry over and the drawer, search and "Other languages" grid read it as before.
 */
public final class HymnBooksDialog {
    /** The preference that holds the hidden books (the name predates "Hymn books"). */
    public static final String HIDDEN_KEY = "disableLanguages";

    private HymnBooksDialog() {
    }

    /** Shows the dialog; {@code onSave} gets the new set of hidden books after OK. */
    public static void show(Context context, Set<String> hidden, Consumer<Set<String>> onSave) {
        final HymnGroup[] groups = HymnGroup.values();
        final boolean[] shown = new boolean[groups.length];
        for (int i = 0; i < groups.length; i++) shown[i] = !hidden.contains(groups[i].name());

        View content = LayoutInflater.from(context).inflate(R.layout.settings_hymn_books, null);
        ListView list = content.findViewById(R.id.hymnBookList);
        final BookAdapter adapter = new BookAdapter(context, groups, shown, countHymns(context));
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, position, id) -> {
            shown[position] = !shown[position];
            adapter.notifyDataSetChanged();
        });

        new AlertDialog.Builder(context)
                .setTitle("Choose the languages to show")
                .setView(content)
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton(android.R.string.ok, (dialog, which) -> {
                    Set<String> newHidden = new HashSet<>();
                    for (int i = 0; i < groups.length; i++) {
                        if (!shown[i]) newHidden.add(groups[i].name());
                    }
                    if (newHidden.size() == groups.length) {
                        Toast.makeText(context, "At least one language has to stay shown", Toast.LENGTH_LONG).show();
                        return;
                    }
                    onSave.accept(newHidden);
                })
                .show();
    }

    /** Number of hymns in each book, for the second line of each row. Empty if the database can't be read. */
    public static Map<String, Integer> countHymns(Context context) {
        Map<String, Integer> counts = new HashMap<>();
        try (Cursor cursor = HymnsSqliteHelper.getInstance(context).getReadableDatabase()
                .rawQuery("select hymn_group, count(*) from hymns group by hymn_group", null)) {
            while (cursor.moveToNext()) counts.put(cursor.getString(0), cursor.getInt(1));
        } catch (Exception e) {
            Log.w(HymnBooksDialog.class.getSimpleName(), "Could not count hymns per book", e);
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
