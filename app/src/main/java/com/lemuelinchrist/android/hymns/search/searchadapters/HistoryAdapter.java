package com.lemuelinchrist.android.hymns.search.searchadapters;

import android.content.Context;
import com.lemuelinchrist.android.hymns.content.ContentArea;
import com.lemuelinchrist.android.hymns.logbook.HymnRecord;
import com.lemuelinchrist.android.hymns.logbook.LogBook;
import com.lemuelinchrist.android.hymns.search.IndexViewHolder;
import com.lemuelinchrist.android.hymns.search.SearchAdapter;

/**
 * Created by lemuelcantos on 27/1/15.
 */
public class HistoryAdapter extends SearchAdapter {

    private final HymnRecord[] historyLogBookList;

    public HistoryAdapter(Context context, int layout) {
        super(context, layout);
        historyLogBookList = new LogBook(context, ContentArea.HISTORY_LOGBOOK_FILE).getOrderedRecordList();

    }

    @Override
    public void provisionHolder(final IndexViewHolder holder, int position) {
        HymnRecord record = historyLogBookList[position];
        holder.list_item.setText(record.getHymnId() + " - " + record.getFirstLine());
        holder.imageView.setImageResource(context.getResources().getIdentifier(record.getHymnGroup().toLowerCase(), "drawable", context.getPackageName()));
        holder.hymnNo = record.getHymnId();
    }

    @Override
    public int getItemCount() {
        return historyLogBookList.length;
    }
}
