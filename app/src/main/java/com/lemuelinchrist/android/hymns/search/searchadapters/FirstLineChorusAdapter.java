package com.lemuelinchrist.android.hymns.search.searchadapters;

import android.content.Context;
import android.database.Cursor;

import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.search.HymnCursorAdapter;
import com.lemuelinchrist.android.hymns.search.IndexViewHolder;

/**
 * Created by lemuelcantos on 31/10/15.
 */
public class FirstLineChorusAdapter extends HymnCursorAdapter {

    public FirstLineChorusAdapter(Context context, Cursor cursor, int layout) {
        super(context, cursor, layout);
    }

    @Override
    protected void provisionHolderUsingCursor(IndexViewHolder indexViewHolder) {

        indexViewHolder.list_item.setText(cursor.getString(cursor.getColumnIndex("stanza_chorus")) + " - " + cursor.getString(cursor.getColumnIndex("_id")));

        String hymnGroup = cursor.getString(cursor.getColumnIndex(HymnsDao.HymnFields.hymn_group.toString()));
        indexViewHolder.imageView.setImageResource(context.getResources().getIdentifier(hymnGroup.toLowerCase(), "drawable", context.getPackageName()));

        indexViewHolder.hymnNo = cursor.getString(cursor.getColumnIndex("_id"));

    }


}
