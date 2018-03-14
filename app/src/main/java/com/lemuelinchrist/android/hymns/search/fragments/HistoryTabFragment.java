package com.lemuelinchrist.android.hymns.search.fragments;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.search.TabFragment;
import com.lemuelinchrist.android.hymns.search.searchadapters.HistoryAdapter;

/**
 * Created by lemuelcantos on 29/1/15.
 */
public class HistoryTabFragment extends TabFragment {

    @Override
    public int getSearchTabIndex() {
        return 5;
    }

    @Override
    public String getTabName() {
        return "History";
    }

    @Override
    public void setRecyclerViewAdapter() {

        mRecyclerView.setAdapter(new HistoryAdapter(container.getContext(),R.layout.recyclerview_hymn_list));

    }

    @Override
    public void cleanUp() {

    }

    @Override
    public boolean canBeSearched() {
        return false;
    }

    @Override
    public int getIcon() {
        return android.R.drawable.ic_menu_recent_history;
    }

}
