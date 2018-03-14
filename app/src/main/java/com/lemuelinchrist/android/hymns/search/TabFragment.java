package com.lemuelinchrist.android.hymns.search;

import android.content.Context;
import android.os.Bundle;
import android.support.v4.app.Fragment;
import android.support.v7.widget.DefaultItemAnimator;
import android.support.v7.widget.LinearLayoutManager;
import android.support.v7.widget.RecyclerView;
import android.text.InputType;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;

import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.search.searchadapters.AuthorAdapter;
import xyz.danoz.recyclerviewfastscroller.vertical.VerticalRecyclerViewFastScroller;

import java.util.HashMap;
import java.util.Map;

/**
 * Created by lemuelcantos on 1/11/15.
 */
public abstract class TabFragment extends Fragment {

    protected HymnsDao dao;

    protected RecyclerView mRecyclerView;
    protected ViewGroup container;
    protected static HymnGroup selectedHymnGroup;
    public static final Map<Integer, TabFragment> COLLECTION = new HashMap();

    public TabFragment() {
        COLLECTION.put(this.getSearchTabIndex(), this);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getArguments() != null) {
        }
    }

    @Override
    public View onCreateView(LayoutInflater inflater, final ViewGroup container,
                             Bundle savedInstanceState) {
        View rootView = inflater.inflate(R.layout.search_activity_hymn_list, container, false);

        this.container=container;

        mRecyclerView = (RecyclerView) rootView.findViewById(R.id.indexView);

        VerticalRecyclerViewFastScroller fastScroller = (VerticalRecyclerViewFastScroller) rootView.findViewById(R.id.fast_scroller);
        fastScroller.setRecyclerView(mRecyclerView);
        mRecyclerView.addOnScrollListener(fastScroller.getOnScrollListener());


        mRecyclerView.setLayoutManager(new LinearLayoutManager(getActivity()));
        mRecyclerView.setItemAnimator(new DefaultItemAnimator());

        mRecyclerView.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override
            public void onScrolled(RecyclerView recyclerView, int dx, int dy) {
                super.onScrolled(recyclerView, dx, dy);
                Log.d(this.getClass().getName(),"scroll dy = "+dy);
                if(dy!=0) {  // this condition is important. Otherwise the keyboard will hide everytime the Recyclerview refreshes which is an undesired behavior
                    // hide soft keyboard
                    InputMethodManager imm = (InputMethodManager) container.getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
                    imm.hideSoftInputFromWindow(mRecyclerView.getWindowToken(), 0);
                }
            }
        });

        setRecyclerViewAdapter();

        return rootView;
    }


    public static void setSelectedHymnGroup(HymnGroup hymnGroup) {
        selectedHymnGroup = hymnGroup;

    }

    public abstract int getSearchTabIndex();

    public abstract String getTabName();

    public abstract boolean canBeSearched();

    public abstract void setSearchFilter(String filter);

    public abstract int getIcon();

    public void cleanUp() {
        dao.close();
    }

    public static TabFragment getInstance(Class tabFragmentClass) {
        for (TabFragment tab : COLLECTION.values()) {
            if (tab.getClass().equals(tabFragmentClass)) return tab;

        }
        Log.w(TabFragment.class.getName(), "Could not find specified class - " + tabFragmentClass);
        return null;
    }

    public int getInputType() {
        return InputType.TYPE_CLASS_TEXT;
    }

    private void setRecyclerViewAdapter() {
        dao = new HymnsDao(container.getContext());
        dao.open();

        setSearchFilter("");

    }

}
