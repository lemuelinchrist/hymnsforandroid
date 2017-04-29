package com.lemuelinchrist.android.hymns.search.searchadapters;

import android.content.Context;

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
        holder.list_item.setText(record.getHymnId() + " - " + record.getFirstLine());
        holder.imageView.setImageResource(context.getResources().getIdentifier(record.getHymnGroup().toLowerCase(), "drawable", context.getPackageName()));
        holder.hymnNo = record.getHymnId();
    }

    @Override
    public int getItemCount() {
        return historyLogBookList.length;
    }
}
