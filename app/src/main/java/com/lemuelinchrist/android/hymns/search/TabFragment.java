package com.lemuelinchrist.android.hymns.search;

import android.os.Bundle;
import android.support.v4.app.Fragment;
import android.support.v7.widget.DefaultItemAnimator;
import android.support.v7.widget.LinearLayoutManager;
import android.support.v7.widget.RecyclerView;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import com.lemuelinchrist.android.hymns.R;

import java.util.HashMap;
import java.util.Map;

/**
 * Created by lemuelcantos on 1/11/15.
 */
public abstract class TabFragment extends Fragment {

    protected RecyclerView mRecyclerView;
    protected ViewGroup container;
    protected static String selectedHymnGroup;
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
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        View rootView = inflater.inflate(R.layout.search_activity_hymn_list, container, false);

        this.container=container;

        mRecyclerView = (RecyclerView) rootView.findViewById(R.id.indexView);
        mRecyclerView.setLayoutManager(new LinearLayoutManager(getActivity()));
        mRecyclerView.setItemAnimator(new DefaultItemAnimator());

        setRecyclerViewAdapter();

        return rootView;
    }


    public static void setSelectedHymnGroup(String hymnGroup) {
        selectedHymnGroup = hymnGroup;

    }

    public abstract int getSearchTabIndex();

    public abstract String getTabName();

    public abstract void setRecyclerViewAdapter();

    public abstract void cleanUp();


    public void setSearchFilter(String filter) {
        Log.i(this.getClass().getName(), "Nothing was done in setSearchFilter() ! !");

    }

}
