package com.lemuelinchrist.android.hymns.search.searchadapters;

import android.content.Context;
import android.database.Cursor;
import android.text.Html;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.search.HymnCursorAdapter;
import com.lemuelinchrist.android.hymns.search.IndexViewHolder;

/**
 * Created by lemuelcantos on 31/10/15.
 */
public class AuthorAdapter extends HymnCursorAdapter {

    public AuthorAdapter(Context context, Cursor cursor, int layout) {
        super(context, cursor, layout);
    }

    @Override
    protected void provisionHolderUsingCursor(IndexViewHolder indexViewHolder) {

        String first_line = cursor.getString(cursor.getColumnIndex("first_stanza_line"));
        if(first_line==null || first_line.isEmpty()) {
            first_line = cursor.getString(cursor.getColumnIndex("first_chorus_line"));
        }

        String author = retouch(cursor.getString(cursor.getColumnIndex("author")));
        String composer = retouch(cursor.getString(cursor.getColumnIndex("composer")));
        String author_composer = author + " - " + composer;

        String categoryText = "<b>" + author_composer + "</b>"
                + "<br/>" + cursor.getString(cursor.getColumnIndex("_id")) + " - " + first_line;
        indexViewHolder.list_item.setText(Html.fromHtml(categoryText));

        String hymnGroup = cursor.getString(cursor.getColumnIndex(HymnsDao.HymnFields.hymn_group.toString()));
        indexViewHolder.imageView.setImageResource(context.getResources().getIdentifier(hymnGroup.toLowerCase(), "drawable", context.getPackageName()));

        indexViewHolder.hymnNo = cursor.getString(cursor.getColumnIndex("_id"));

    }

    private String retouch(String name) {
        if(name==null || name.trim().isEmpty()) {
            return "Unknown";
        }
        if (name.trim().equals("*")) {
            return "* LSM";
        }
        if (name.trim().equals("+")) {
            return "+ Translated";
        }
        return name;
    }
}
