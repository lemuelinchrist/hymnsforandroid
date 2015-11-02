package com.lemuelinchrist.android.hymns.search;

import android.util.Log;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.search.searchadapters.FirstLineChorusAdapter;
import com.lemuelinchrist.android.hymns.search.searchadapters.HymnNumberAdapter;


public class FirstLineTabFragment extends TabFragment {
    // TODO: Rename parameter arguments, choose names that match

    private HymnsDao dao;


    @Override
    public void setRecyclerViewAdapter() {

        dao = new HymnsDao(container.getContext());
        dao.open();

        Log.d(this.getClass().getName(), "selectedHymnGroup=" + selectedHymnGroup);
        if (selectedHymnGroup != null) {
            mRecyclerView.setAdapter(new FirstLineChorusAdapter(container.getContext(),
                    dao.getAllHymnsOfSameLanguage(selectedHymnGroup), R.layout.index_list_content));
        }

    }

    public void setSearchFilter(String filter) {
        if (filter.matches("^[0-9].*")) {
            mRecyclerView.setAdapter(new HymnNumberAdapter(container.getContext(),
                    dao.getFilteredHymns(selectedHymnGroup, filter)
                    , R.layout.index_list_content));
        } else {
            mRecyclerView.setAdapter(new FirstLineChorusAdapter(container.getContext(),
                    dao.getFilteredHymns(selectedHymnGroup, filter)
                    , R.layout.index_list_content));

        }

    }

    public void cleanUp() {
        dao.close();
    }

    @Override
    public int getSearchTabIndex() {
        return 0;
    }

    @Override
    public String getTabName() {
        return "First Lines";
    }
}
