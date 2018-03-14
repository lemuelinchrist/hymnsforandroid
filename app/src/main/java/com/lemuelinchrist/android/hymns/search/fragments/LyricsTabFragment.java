package com.lemuelinchrist.android.hymns.search.fragments;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.search.TabFragment;
import com.lemuelinchrist.android.hymns.search.searchadapters.AuthorAdapter;

/**
 * @author Lemuel Cantos
 * @since 13/3/2018
 */
public class LyricsTabFragment extends TabFragment {
    private HymnsDao dao;

    @Override
    public int getSearchTabIndex() {
        return 4;
    }

    @Override
    public String getTabName() {
        return "All Lyrics";
    }

    @Override
    public void setRecyclerViewAdapter() {
        dao = new HymnsDao(container.getContext());
        dao.open();

        mRecyclerView.setAdapter(new AuthorAdapter(container.getContext(),
                dao.getAuthorsList(""), R.layout.recyclerview_hymn_list));

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
                dao.getAuthorsList(filter)
                , R.layout.recyclerview_hymn_list));    }

    @Override
    public int getIcon() {
        return R.drawable.ic_receipt_grey;
    }
}
