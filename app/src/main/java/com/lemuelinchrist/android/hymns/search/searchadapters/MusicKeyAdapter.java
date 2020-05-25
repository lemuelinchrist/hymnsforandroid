package com.lemuelinchrist.android.hymns.search.searchadapters;

import android.content.Context;
import android.database.Cursor;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.search.HymnCursorAdapter;
import com.lemuelinchrist.android.hymns.search.IndexViewHolder;

/**
 * Created by lemuelcantos on 31/10/15.
 */
public class MusicKeyAdapter extends HymnCursorAdapter {

    public MusicKeyAdapter(Context context, Cursor cursor, int layout) {
        super(context, cursor, layout);
    }

    @Override
    protected void provisionHolderUsingCursor(IndexViewHolder indexViewHolder) {
        String text = cursor.getString(cursor.getColumnIndex("key")) + " - " + cursor.getString(cursor.getColumnIndex("_id")) + "\n";
        text += cursor.getString(cursor.getColumnIndex("first_stanza_line")) + "\n";
        text += "Tune: " +  cursor.getString(cursor.getColumnIndex("tune"));
        indexViewHolder.list_item.setText(text);

        String hymnGroup = cursor.getString(cursor.getColumnIndex(HymnsDao.HymnFields.hymn_group.toString()));
        indexViewHolder.imageView.setImageResource(context.getResources().getIdentifier(hymnGroup.toLowerCase(), "drawable", context.getPackageName()));

        indexViewHolder.hymnNo = cursor.getString(cursor.getColumnIndex("_id"));
    }
}
