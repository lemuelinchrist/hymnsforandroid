package com.lemuelinchrist.android.hymns.search.fragments;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.search.TabFragment;
import com.lemuelinchrist.android.hymns.search.searchadapters.AuthorAdapter;

/**
 * Created by lemuelcantos on 1/11/15.
 */
public class AuthorTabFragment extends TabFragment {
    private HymnsDao dao;

    @Override
    public int getSearchTabIndex() {
        return 3;
    }

    @Override
    public String getTabName() {
        return "  Authors";
    }

    @Override
    public void setRecyclerViewAdapter() {
        dao = new HymnsDao(container.getContext());
        dao.open();

        mRecyclerView.setAdapter(new AuthorAdapter(container.getContext(),
                dao.getByAuthorsOrComposers(""), R.layout.recyclerview_hymn_list));

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
        mRecyclerView.setAdapter(new AuthorAdapter(container.getContext(),
                dao.getByAuthorsOrComposers(filter)
                , R.layout.recyclerview_hymn_list));    }

    @Override
    public int getIcon() {
        return R.drawable.ic_account_multiple_grey600_24dp;
    }
}
