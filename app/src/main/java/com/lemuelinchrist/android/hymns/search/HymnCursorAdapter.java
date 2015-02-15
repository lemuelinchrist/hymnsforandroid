package com.lemuelinchrist.android.hymns.search;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import com.lemuelinchrist.android.hymns.dao.HymnsDao;

/**
 * Created by lemuelcantos on 15/8/13.
 */
public class HymnCursorAdapter extends CursorRecyclerViewAdapter<IndexViewHolder> {
    private final Context context;
    private final Cursor cursor;
    private final int layout;
    private final HymnsDao dao;
    private String mode="";

    public HymnCursorAdapter(Context context, Cursor cursor, int layout) {
        super(context, cursor);
        this.context = context;
        this.cursor = cursor;
        this.layout = layout;

        // initialize DAO
        dao = new HymnsDao(context);
        dao.open();
    }

    @Override
    public IndexViewHolder onCreateViewHolder(ViewGroup viewGroup, int i) {
        LayoutInflater inflater = (LayoutInflater) context
                .getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        View rowView = inflater.inflate(layout, viewGroup, false);


        IndexViewHolder vh = new IndexViewHolder(rowView);
        return vh;
    }

    @Override
    public void onBindViewHolder(final IndexViewHolder indexViewHolder, Cursor cursor) {
        StringBuilder text = new StringBuilder();

        if (mode.equals(""))
        indexViewHolder.list_item.setText(cursor.getString(cursor.getColumnIndex("_id")) +  "\n"+cursor.getString(cursor.getColumnIndex("stanza_chorus")));

        String hymnGroup = cursor.getString(cursor.getColumnIndex(HymnsDao.HymnFields.hymn_group.toString()));
        indexViewHolder.imageView.setImageResource(context.getResources().getIdentifier(hymnGroup.toLowerCase(), "drawable", context.getPackageName()));

        indexViewHolder.hymnNo=dao.getHymnNoFromCursor(cursor);

        indexViewHolder.itemView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {

                Intent data = new Intent();

                data.setData(Uri.parse(indexViewHolder.hymnNo));
                Activity currentActivity = (Activity) context;
                currentActivity.setResult(currentActivity.RESULT_OK, data);
                currentActivity.finish();
            }
        });
    }

    public void setMode(String mode) {
        this.mode = mode;
    }
}

