package com.lemuelinchrist.android.hymns.search.searchadapters;

import android.content.Context;
import android.database.Cursor;
import android.text.Html;

import com.lemuelinchrist.android.hymns.dao.HymnsDao;

/**
 * Created by lemuelcantos on 31/10/15.
 */
public class CategoryAdapter extends HymnCursorAdapter {

    public CategoryAdapter(Context context, Cursor cursor, int layout) {
        super(context, cursor, layout);
    }

    @Override
    protected void provisionHolderUsingCursor(IndexViewHolder indexViewHolder) {
        String categoryText = "<b>" + cursor.getString(cursor.getColumnIndex("_id")) + " - " + cursor.getString(cursor.getColumnIndex("main_category"))
                + " - " + cursor.getString(cursor.getColumnIndex("sub_category")) + "</b>"
                + "<br/>" + cursor.getString(cursor.getColumnIndex("first_stanza_line"));
        indexViewHolder.list_item.setText(Html.fromHtml(categoryText));

        String hymnGroup = cursor.getString(cursor.getColumnIndex(HymnsDao.HymnFields.hymn_group.toString()));
        indexViewHolder.imageView.setImageResource(context.getResources().getIdentifier(hymnGroup.toLowerCase(), "drawable", context.getPackageName()));

        indexViewHolder.hymnNo = cursor.getString(cursor.getColumnIndex("_id"));

    }
}
