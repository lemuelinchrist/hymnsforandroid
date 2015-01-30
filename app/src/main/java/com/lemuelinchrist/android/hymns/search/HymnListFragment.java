package com.lemuelinchrist.android.hymns.search;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.support.v4.app.Fragment;
import android.support.v7.widget.DefaultItemAnimator;
import android.support.v7.widget.LinearLayoutManager;
import android.support.v7.widget.RecyclerView;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;


public class HymnListFragment extends Fragment {
    // TODO: Rename parameter arguments, choose names that match

    private RecyclerView mRecyclerView;
    private ViewGroup container;
    private HymnsDao dao;
    private String selectedHymnGroup;

    public HymnListFragment() {

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

        dao = new HymnsDao(container.getContext());
        dao.open();

        if (selectedHymnGroup!=null) {
            mRecyclerView.setAdapter(new HymnCursorAdapter(container.getContext(),
                    dao.getAllHymnsOfSameLanguage(selectedHymnGroup), R.layout.index_list_content));
        }

        return rootView;
    }

    public void setFilter(String filter) {
        mRecyclerView.setAdapter(new HymnCursorAdapter(container.getContext(),
                dao.getFilteredHymns(selectedHymnGroup, filter)
                , R.layout.index_list_content));
    }

    public void setSelectedHymnGroup(String selectedHymnGroup) {
        this.selectedHymnGroup = selectedHymnGroup;

    }

    public void destroyDao() {
        dao.close();
    }

}
