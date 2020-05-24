package com.lemuelinchrist.android.hymns.search.fragments;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.search.HymnCursorAdapter;
import com.lemuelinchrist.android.hymns.search.TabFragment;
import com.lemuelinchrist.android.hymns.search.searchadapters.MusicKeyAdapter;

/**
 * Created by lemuelcantos on 1/11/15.
 */
public class MusicKeyTabFragment extends TabFragment {

    @Override
    public int getSearchTabIndex() {
        return 7;
    }

    @Override
    public String getTabName() {
        return "Keys";
    }

    @Override
    public boolean canBeSearched() {
        return true;
    }

    @Override
    public void setSearchFilter(String filter) {
        if(filter!=null && filter.isEmpty()) {
            mRecyclerView.setAdapter(new MusicKeyAdapter(container.getContext(),
                    dao.getByKey(""), R.layout.recyclerview_hymn_list));

        } else {
            ((HymnCursorAdapter) mRecyclerView.getAdapter()).setNewCursor(dao.getByKey(filter));
        }
    }

    @Override
    public int getIcon() {
        return android.R.drawable.ic_menu_directions;
    }
}
