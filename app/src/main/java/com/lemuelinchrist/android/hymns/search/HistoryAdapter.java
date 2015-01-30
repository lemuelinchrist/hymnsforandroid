package com.lemuelinchrist.android.hymns.search;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.support.v7.widget.RecyclerView;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.history.HistoryLogBook;
import com.lemuelinchrist.android.hymns.history.HistoryRecord;

/**
 * Created by lemuelcantos on 27/1/15.
 */
public class HistoryAdapter extends RecyclerView.Adapter<IndexViewHolder> {

    private final Context context;
    private final int layout;
    private final HistoryRecord[] historyLogBookList;
    private final HymnsDao dao;

    public HistoryAdapter(Context context, int layout) {
        this.context=context;
        this.layout=layout;
        historyLogBookList = new HistoryLogBook(context).getOrderedRecordList();
        // initialize DAO
        dao = new HymnsDao(context);
        dao.open();


    }

    @Override
    public IndexViewHolder onCreateViewHolder(ViewGroup viewGroup, int viewType) {
        LayoutInflater inflater = (LayoutInflater) context
                .getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        View rowView = inflater.inflate(layout, viewGroup, false);


        IndexViewHolder vh = new IndexViewHolder(rowView);
        return vh;
    }

    @Override
    public void onBindViewHolder(final IndexViewHolder holder, int position) {
        Hymn hymn= dao.get(historyLogBookList[position].getHymnId());
        holder.list_item.setText(hymn.getFirstStanzaLine());
        holder.imageView.setImageResource(context.getResources().getIdentifier(hymn.getGroup().toLowerCase(), "drawable", context.getPackageName()));
        holder.hymnNo=hymn.getHymnId();

        holder.itemView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {

                Intent data = new Intent();
                data.setData(Uri.parse(holder.hymnNo));
                Activity currentActivity = (Activity) context;
                currentActivity.setResult(currentActivity.RESULT_OK, data);
                currentActivity.finish();
            }
        });

    }

    @Override
    public int getItemCount() {
        return historyLogBookList.length;
    }
}
