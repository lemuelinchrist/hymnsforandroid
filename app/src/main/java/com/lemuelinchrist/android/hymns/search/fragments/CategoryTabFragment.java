package com.lemuelinchrist.android.hymns.search.fragments;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.search.TabFragment;
import com.lemuelinchrist.android.hymns.search.searchadapters.CategoryAdapter;
import com.lemuelinchrist.android.hymns.search.HymnCursorAdapter;

/**
 * Created by lemuelcantos on 1/11/15.
 */
public class CategoryTabFragment extends TabFragment {

    @Override
    public int getSearchTabIndex() {
        return 2;
    }

    @Override
    public String getTabName() {
        return "Subjects";
    }

    @Override
    public boolean canBeSearched() {
        return true;
    }

    @Override
    public void setSearchFilter(String filter) {
        if(filter!=null && filter.isEmpty()) {
            mRecyclerView.setAdapter(new CategoryAdapter(container.getContext(),
                    dao.getByCategory(selectedHymnGroup, ""), R.layout.recyclerview_hymn_list));

        } else {
            ((HymnCursorAdapter) mRecyclerView.getAdapter()).setNewCursor(dao.getByCategory(selectedHymnGroup, filter));
        }
    }

    @Override
    public int getIcon() {
        return android.R.drawable.ic_menu_directions;
    }
}
