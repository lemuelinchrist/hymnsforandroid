package com.lemuelinchrist.android.hymns.search;

import android.support.v7.widget.RecyclerView;
import android.view.ViewGroup;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.search.searchadapters.HistoryAdapter;

/**
 * Created by lemuelcantos on 29/1/15.
 */
public class HistoryTabFragment extends TabFragment {

    @Override
    public int getSearchTabIndex() {
        return 2;
    }

    @Override
    public String getTabName() {
        return "History";
    }

    @Override
    public void setRecyclerViewAdapter() {

        mRecyclerView.setAdapter(new HistoryAdapter(container.getContext(),R.layout.index_list_content));

    }

    @Override
    public void cleanUp() {

    }

    @Override
    public boolean canBeSearched() {
        return false;
    }


}
