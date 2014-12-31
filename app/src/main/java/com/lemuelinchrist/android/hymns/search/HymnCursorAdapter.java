package com.lemuelinchrist.android.hymns.search;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.support.v7.widget.RecyclerView;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CursorAdapter;
import android.widget.ImageView;
import android.widget.TextView;

import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;

/**
 * Created by lemuelcantos on 15/8/13.
 */
public class HymnCursorAdapter extends CursorRecyclerViewAdapter<HymnCursorAdapter.ViewHolder> {
    private final Context context;
    private final Cursor cursor;
    private final int layout;
    private final HymnsDao dao;

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
    public ViewHolder onCreateViewHolder(ViewGroup viewGroup, int i) {
        LayoutInflater inflater = (LayoutInflater) context
                .getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        View rowView = inflater.inflate(layout, viewGroup, false);


        ViewHolder vh = new ViewHolder(rowView);
        return vh;
    }

    @Override
    public void onBindViewHolder(final ViewHolder viewHolder, Cursor cursor) {
        viewHolder.list_item.setText(cursor.getString(cursor.getColumnIndex("stanza_chorus")));

        String hymnGroup = cursor.getString(cursor.getColumnIndex(HymnsDao.HymnFields.hymn_group.toString()));
        viewHolder.imageView.setImageResource(context.getResources().getIdentifier(hymnGroup.toLowerCase(), "drawable", context.getPackageName()));

        viewHolder.hymnNo=dao.getHymnNoFromCursor(cursor);

        viewHolder.itemView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {

                Intent data = new Intent();

                data.setData(Uri.parse(viewHolder.hymnNo));
                Activity currentActivity = (Activity) context;
                currentActivity.setResult(currentActivity.RESULT_OK, data);
                currentActivity.finish();
            }
        });
    }

    public static class ViewHolder extends RecyclerView.ViewHolder {
        public TextView list_item;
        public ImageView imageView;
        public String hymnNo;

        public ViewHolder(View view) {
            super(view);
            list_item = (TextView) view.findViewById(R.id.hymnTitle);
            imageView = (ImageView) view.findViewById(R.id.hymnGroupImage);
        }

    }
}

