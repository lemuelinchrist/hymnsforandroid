package com.lemuelinchrist.android.hymns.search.fragments;

import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.search.SearchActivity;
import com.lemuelinchrist.android.hymns.search.TabFragment;
import com.lemuelinchrist.android.hymns.search.searchadapters.FavoritesAdapter;

/**
 * Created by lemuelcantos on 29/1/15.
 */
public class FavoritesTabFragment extends TabFragment {

    private TextView favoritesCount;

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        // the list, with the Back up / Restore bar above it
        LinearLayout root = new LinearLayout(container.getContext());
        root.setOrientation(LinearLayout.VERTICAL);
        View bar = inflater.inflate(R.layout.favorites_backup_bar, root, false);
        favoritesCount = bar.findViewById(R.id.favoritesCount);
        bar.findViewById(R.id.favoritesBackUp).setOnClickListener(v -> ((SearchActivity) getActivity()).getFavoritesBackup().backUp());
        bar.findViewById(R.id.favoritesRestore).setOnClickListener(v -> ((SearchActivity) getActivity()).getFavoritesBackup().restore());
        root.addView(bar);

        View list = super.onCreateView(inflater, container, savedInstanceState);
        root.addView(list, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        return root;
    }

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
        FavoritesAdapter adapter = new FavoritesAdapter(container.getContext(), R.layout.recyclerview_hymn_list);
        mRecyclerView.setAdapter(adapter);
        int count = adapter.getItemCount();
        if (favoritesCount != null) {
            favoritesCount.setText(count == 0 ? "No favorites yet. Tap ♥ on a hymn to add it."
                    : count + (count == 1 ? " favorite" : " favorites"));
        }
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
