package com.lemuelinchrist.android.hymns.search;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.search.searchadapters.CategoryAdapter;

/**
 * Created by lemuelcantos on 1/11/15.
 */
public class CategoryTabFragment extends TabFragment {
    private HymnsDao dao;

    @Override
    public int getSearchTabIndex() {
        return 1;
    }

    @Override
    public String getTabName() {
        return "Subjects";
    }

    @Override
    public void setRecyclerViewAdapter() {
        dao = new HymnsDao(container.getContext());
        dao.open();

        mRecyclerView.setAdapter(new CategoryAdapter(container.getContext(),
                dao.getCategoryList(selectedHymnGroup, ""), R.layout.recyclerview_hymn_list));

    }

    @Override
    public void cleanUp() {
        dao.close();

    }

    @Override
    public boolean canBeSearched() {
        return true;
    }

    @Override
    public void setSearchFilter(String filter) {
        mRecyclerView.setAdapter(new CategoryAdapter(container.getContext(),
                dao.getCategoryList(selectedHymnGroup, filter), R.layout.recyclerview_hymn_list));
    }
}
