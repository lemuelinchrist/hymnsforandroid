package com.lemuelinchrist.android.hymns.search.fragments;

import android.util.Log;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.search.TabFragment;
import com.lemuelinchrist.android.hymns.search.searchadapters.FirstLineChorusAdapter;


public class FirstLineTabFragment extends TabFragment {

    public void setSearchFilter(String filter) {

        // if user didn't input anything in the search, the default behavior is to list only a certain group of hymns
        if (selectedHymnGroup != null && filter.equals("")) {
            Log.d(this.getClass().getName(), "selectedHymnGroup=" + selectedHymnGroup);
            mRecyclerView.setAdapter(new FirstLineChorusAdapter(container.getContext(),
                    dao.getByFirstLine(selectedHymnGroup,null), R.layout.recyclerview_hymn_list));
        } else {

            mRecyclerView.setAdapter(new FirstLineChorusAdapter(container.getContext(),
                    dao.getByFirstLine(selectedHymnGroup, filter)
                    , R.layout.recyclerview_hymn_list));
        }


    }

    @Override
    public int getIcon() {
        return R.drawable.ic_keyboard_tab;
    }

    @Override
    public boolean canBeSearched() {
        return true;
    }

    @Override
    public int getSearchTabIndex() {
        return 1;
    }

    @Override
    public String getTabName() {
        return "  First Lines";
    }
}
