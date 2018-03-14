package com.lemuelinchrist.android.hymns.search.searchadapters;

import android.content.Context;
import android.database.Cursor;
import android.text.Html;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.search.HymnCursorAdapter;
import com.lemuelinchrist.android.hymns.search.IndexViewHolder;

/**
 * Created by lemuelcantos on 14/03/18.
 */
public class LyricsAdapter extends HymnCursorAdapter {

    public LyricsAdapter(Context context, Cursor cursor, int layout) {
        super(context, cursor, layout);
    }

    @Override
    protected void provisionHolderUsingCursor(IndexViewHolder indexViewHolder) {
        String parentHymn = cursor.getString(cursor.getColumnIndex("parent_hymn"));
        String no = cursor.getString(cursor.getColumnIndex("no"));
        String text = cursor.getString(cursor.getColumnIndex("text"));

        StringBuilder lyricText = new StringBuilder();
        lyricText.append("<b>");
        lyricText.append(parentHymn);
        lyricText.append(" - ");
        lyricText.append(no);
        lyricText.append("</b><br/>");
        lyricText.append(text.trim());

        //remove trailing <br/>
        lyricText.reverse().delete(0,5).reverse();

        indexViewHolder.list_item.setText(Html.fromHtml(lyricText.toString()));

        String hymnGroup = HymnGroup.getHymnGroupFromID(parentHymn).toString();
        indexViewHolder.imageView.setImageResource(context.getResources().getIdentifier(hymnGroup.toLowerCase(), "drawable", context.getPackageName()));

        indexViewHolder.hymnNo = parentHymn;

    }
}
