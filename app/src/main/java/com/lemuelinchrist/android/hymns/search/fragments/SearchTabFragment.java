package com.lemuelinchrist.android.hymns.search.fragments;

import android.database.sqlite.SQLiteDatabase;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.preference.PreferenceManager;

import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.SearchIndex;
import com.lemuelinchrist.android.hymns.search.HymnSearch;
import com.lemuelinchrist.android.hymns.search.SearchActivity;
import com.lemuelinchrist.android.hymns.search.TabFragment;
import com.lemuelinchrist.android.hymns.search.searchadapters.AuthorAdapter;
import com.lemuelinchrist.android.hymns.search.searchadapters.CategoryAdapter;
import com.lemuelinchrist.android.hymns.search.searchadapters.FirstLineChorusAdapter;
import com.lemuelinchrist.android.hymns.search.searchadapters.MusicKeyAdapter;
import com.lemuelinchrist.android.hymns.search.searchadapters.SearchResultAdapter;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * One Search tab for words: with an empty box it lists the current book (First Lines, Subjects, Authors, Tunes); while
 * typing it lists the hymns that have all the words, one row per hymn, best first, in the current book or all books.
 * Replaces the First Lines, Subjects, Authors, All Lyrics and Music tabs. See HYMNAL_SPEC.md §9.
 *
 * @since 2026-10-28
 */
public class SearchTabFragment extends TabFragment {

    private enum Browse {
        FIRST_LINES("First Lines"), SUBJECTS("Subjects"), AUTHORS("Authors"), TUNES("Tunes");
        final String label;

        Browse(String label) {
            this.label = label;
        }
    }

    private static final int COLOR_ON = 0xFF00796B;
    private static final int COLOR_OFF = 0xFF757575;
    private static final long DELAY_MS = 150;

    private final ExecutorService searcher = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private LinearLayout choices;
    private TextView status;
    private Browse browse = Browse.FIRST_LINES;
    private String filter = "";
    private Boolean allBooks;     // null until the user picks; then kept while typing
    private int searchCount = 0;
    private List<HymnSearch.Result> results = new ArrayList<>();
    private HymnSearch.Query query;
    private String goTo;

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        LinearLayout root = new LinearLayout(container.getContext());
        root.setOrientation(LinearLayout.VERTICAL);
        View bar = inflater.inflate(R.layout.search_tab_bar, root, false);
        choices = bar.findViewById(R.id.searchChoices);
        status = bar.findViewById(R.id.searchStatus);
        root.addView(bar);

        View list = super.onCreateView(inflater, container, savedInstanceState);
        root.addView(list, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        // build the search table now, so it is ready by the time the first words are typed
        SearchIndex.prepare(container.getContext(), null);
        return root;
    }

    @Override
    public void setSearchFilter(String filter) {
        this.filter = filter == null ? "" : filter;
        main.removeCallbacksAndMessages(null);
        if (this.filter.trim().isEmpty()) {
            allBooks = null;
            searchCount++;
            showBrowse();
        } else {
            main.postDelayed(this::search, DELAY_MS);
        }
    }

    /** Enter: open the hymn whose number or ID was typed. False if there is none. */
    public boolean submit(String typed) {
        String id = HymnSearch.hymnIdOf(typed, selectedHymnGroup);
        if (id == null || dao.get(id) == null) return false;
        ((SearchActivity) getActivity()).createIntentAndExit(id);
        return true;
    }

    // ---- an empty box: the lists of the current book ----

    private void showBrowse() {
        choices.removeAllViews();
        for (Browse b : Browse.values()) {
            addChoice(b.label, b == browse, v -> {
                browse = b;
                showBrowse();
            });
        }
        status.setVisibility(View.GONE);
        switch (browse) {
            case SUBJECTS:
                mRecyclerView.setAdapter(new CategoryAdapter(container.getContext(),
                        dao.getSubjectsOf(selectedHymnGroup), R.layout.recyclerview_hymn_list));
                break;
            case AUTHORS:
                mRecyclerView.setAdapter(new AuthorAdapter(container.getContext(),
                        dao.getAuthorsOf(selectedHymnGroup), R.layout.recyclerview_hymn_list));
                break;
            case TUNES:
                mRecyclerView.setAdapter(new MusicKeyAdapter(container.getContext(),
                        dao.getTunesOf(selectedHymnGroup), R.layout.recyclerview_hymn_list));
                break;
            default:
                mRecyclerView.setAdapter(new FirstLineChorusAdapter(container.getContext(),
                        dao.getFirstLinesOf(selectedHymnGroup), R.layout.recyclerview_hymn_list));
        }
    }

    // ---- typing: one list of hymns ----

    private void search() {
        if (!isAdded()) return;
        String typed = filter;
        SQLiteDatabase db = SearchIndex.get(requireContext());
        if (db == null) {
            choices.removeAllViews();
            mRecyclerView.setAdapter(null);
            showStatus("Preparing the search… (once after each update)");
            SearchIndex.prepare(requireContext(), () -> {
                if (isAdded() && filter.equals(typed)) search();
            });
            return;
        }
        int count = ++searchCount;
        Set<String> hidden = PreferenceManager.getDefaultSharedPreferences(requireContext())
                .getStringSet("disableLanguages", new HashSet<>());
        HymnGroup current = selectedHymnGroup;
        searcher.execute(() -> {
            HymnSearch.Query q = HymnSearch.parse(typed);
            String id = HymnSearch.hymnIdOf(typed, current);
            String target = id != null && HymnSearch.exists(db, id) ? id : null;
            // a hymn number or ID only goes to that hymn: "ns 151" as words would find "opens" and "sins"
            List<HymnSearch.Result> found = target != null ? new ArrayList<>()
                    : HymnSearch.search(db, q, current, hidden);
            main.post(() -> {
                if (count != searchCount || !isAdded()) return;
                query = q;
                results = found;
                goTo = target;
                showResults();
            });
        });
    }

    private void showResults() {
        List<HymnSearch.Result> inBook = new ArrayList<>();
        for (HymnSearch.Result r : results) if (r.group == selectedHymnGroup) inBook.add(r);
        boolean all = allBooks != null ? allBooks : inBook.isEmpty() && !results.isEmpty();

        choices.removeAllViews();
        addChoice(selectedHymnGroup.getSimpleName() + " (" + inBook.size() + ")", !all, v -> {
            allBooks = false;
            showResults();
        });
        addChoice("All books (" + results.size() + ")", all, v -> {
            allBooks = true;
            showResults();
        });

        if (results.isEmpty() && goTo != null) choices.removeAllViews();
        List<HymnSearch.Result> shown = all ? results : inBook;
        if (shown.isEmpty() && goTo == null) showStatus("No hymns found");
        else status.setVisibility(View.GONE);
        mRecyclerView.setAdapter(new SearchResultAdapter(container.getContext(), R.layout.recyclerview_hymn_list,
                goTo, shown, query.terms, dao));
    }

    private void showStatus(String text) {
        status.setText(text);
        status.setVisibility(View.VISIBLE);
    }

    private void addChoice(String label, boolean on, View.OnClickListener onClick) {
        Button b = new Button(choices.getContext(), null, android.R.attr.borderlessButtonStyle);
        b.setAllCaps(false);
        b.setText(label);
        b.setTextColor(on ? COLOR_ON : COLOR_OFF);
        b.setTypeface(null, on ? Typeface.BOLD : Typeface.NORMAL);
        b.setOnClickListener(onClick);
        choices.addView(b);
    }

    @Override
    public void onDestroy() {
        searcher.shutdownNow();
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public int getSearchTabIndex() {
        return 1;
    }

    @Override
    public String getTabName() {
        return "Search";
    }

    @Override
    public boolean canBeSearched() {
        return true;
    }

    @Override
    public int getIcon() {
        return R.drawable.ic_search_white;
    }
}
