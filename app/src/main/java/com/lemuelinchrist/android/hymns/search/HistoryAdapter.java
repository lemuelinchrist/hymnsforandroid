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
public class HistoryAdapter extends SearchAdapter {

    private final HistoryRecord[] historyLogBookList;

    public HistoryAdapter(Context context, int layout) {
        super(context, layout);
        historyLogBookList = new HistoryLogBook(context).getOrderedRecordList();

    }

    @Override
    public void provisionHolder(final IndexViewHolder holder, int position) {
        HistoryRecord record = historyLogBookList[position];
        holder.list_item.setText(record.getFirstLine());
        holder.imageView.setImageResource(context.getResources().getIdentifier(record.getHymnGroup().toLowerCase(), "drawable", context.getPackageName()));
        holder.hymnNo=record.getHymnId();
    }

    @Override
    public int getItemCount() {
        return historyLogBookList.length;
    }
}
