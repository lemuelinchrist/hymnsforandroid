package com.lemuelinchrist.android.hymns.search.fragments;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.search.TabFragment;
import com.lemuelinchrist.android.hymns.search.searchadapters.LyricsAdapter;

/**
 * @author Lemuel Cantos
 * @since 13/3/2018
 */
public class LyricsTabFragment extends TabFragment {

    @Override
    public int getSearchTabIndex() {
        return 5;
    }

    @Override
    public String getTabName() {
        return "All Lyrics";
    }


    @Override
    public boolean canBeSearched() {
        return true;
    }

    @Override
    public void setSearchFilter(String filter) {
        mRecyclerView.setAdapter(new LyricsAdapter(container.getContext(),
                dao.getByLyricText(selectedHymnGroup, filter)
                , R.layout.recyclerview_hymn_list));    }

    @Override
    public int getIcon() {
        return R.drawable.ic_receipt_grey;
    }
}
