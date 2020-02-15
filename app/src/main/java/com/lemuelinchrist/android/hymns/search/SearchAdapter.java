package com.lemuelinchrist.android.hymns.search;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import androidx.recyclerview.widget.RecyclerView;


/**
 * Created by lemuelcantos on 31/10/15.
 */
public abstract class SearchAdapter extends RecyclerView.Adapter<IndexViewHolder> {

    protected final Context context;
    protected final int layout;

    public SearchAdapter(Context context, int layout) {
        this.context=context;
        this.layout=layout;

    }

    @Override
    public IndexViewHolder onCreateViewHolder(ViewGroup viewGroup, int viewType) {
        LayoutInflater inflater = (LayoutInflater) context
                .getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        View rowView = inflater.inflate(layout, viewGroup, false);


        return new IndexViewHolder(rowView);
    }

    @Override
    public void onBindViewHolder(final IndexViewHolder holder, int position) {

        provisionHolder(holder,position);

        holder.itemView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {

                ((SearchActivity)context).createIntentAndExit(holder.hymnNo);

            }
        });


    }

    protected abstract void provisionHolder(IndexViewHolder holder, int position);


}
