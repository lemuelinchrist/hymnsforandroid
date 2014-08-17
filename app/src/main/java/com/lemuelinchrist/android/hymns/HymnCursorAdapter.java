package com.lemuelinchrist.android.hymns;

import android.content.Context;
import android.database.Cursor;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CursorAdapter;
import android.widget.ImageView;
import android.widget.TextView;

import com.lemuelinchrist.android.hymns.dao.HymnsDao;

/**
 * Created by lemuelcantos on 15/8/13.
 */
//todo:refactor both cursor adapters
public class HymnCursorAdapter extends CursorAdapter {
    private final Context context;
    private final Cursor cursor;
    private final int layout;

    public HymnCursorAdapter(Context context, Cursor cursor, int layout) {
        super(context, cursor);
        this.context = context;
        this.cursor = cursor;
        this.layout = layout;
    }


    @Override
    public View newView(Context context, Cursor cursor, ViewGroup viewGroup) {
        LayoutInflater inflater = (LayoutInflater) context
                .getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        View rowView = inflater.inflate(layout, viewGroup, false);


        // edit: no need to call bindView here. That's done automatically
        return rowView;
    }

    @Override
    public void bindView(View view, Context context, Cursor cursor) {

        TextView list_item = (TextView) view.findViewById(R.id.hymnTitle);
        list_item.setText(cursor.getString(cursor.getColumnIndex("stanza_chorus")));
        String hymnGroup = cursor.getString(cursor.getColumnIndex(HymnsDao.HymnFields.hymn_group.toString()));
        ImageView imageView = (ImageView) view.findViewById(R.id.hymnGroupImage);
        imageView.setImageResource(context.getResources().getIdentifier(hymnGroup.toLowerCase(), "drawable", context.getPackageName()));


    }
}
