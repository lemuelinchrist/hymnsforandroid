package com.lemuelinchrist.android.hymns.search.fragments;

import android.util.Log;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.search.TabFragment;
import com.lemuelinchrist.android.hymns.search.searchadapters.FavoritesAdapter;

/**
 * Created by lemuelcantos on 29/1/15.
 */
public class FavoritesTabFragment extends TabFragment {

    @Override
    public int getSearchTabIndex() {
        return 2;
    }

    @Override
    public String getTabName() {
        return "Favorites";
    }

    @Override
    public void setSearchFilter(String filter) {
        mRecyclerView.setAdapter(new FavoritesAdapter(container.getContext(),R.layout.recyclerview_hymn_list));
    }

    @Override
    public boolean canBeSearched() {
        return false;
    }

    @Override
    public int getIcon() {
        Log.d("test","tes1t");
        return R.drawable.ic_favorite_grey_48dp;
    }

}
