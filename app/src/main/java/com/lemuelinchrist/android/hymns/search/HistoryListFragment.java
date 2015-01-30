package com.lemuelinchrist.android.hymns.search;

import android.os.Bundle;
import android.support.v4.app.Fragment;
import android.support.v7.widget.DefaultItemAnimator;
import android.support.v7.widget.LinearLayoutManager;
import android.support.v7.widget.RecyclerView;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;

/**
 * Created by lemuelcantos on 29/1/15.
 */
public class HistoryListFragment extends Fragment{

    private RecyclerView mRecyclerView;
    private ViewGroup container;

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

        mRecyclerView.setAdapter(new HistoryAdapter(container.getContext(),R.layout.index_list_content));
        return rootView;
    }
}
