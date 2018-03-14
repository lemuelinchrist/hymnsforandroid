package com.lemuelinchrist.android.hymns.search;

import android.support.v7.widget.RecyclerView;
import android.view.View;
import android.widget.ImageView;
import android.widget.TextView;

import com.lemuelinchrist.android.hymns.R;

/**
* Created by lemuelcantos on 27/1/15.
*/
public class IndexViewHolder extends RecyclerView.ViewHolder {
    public TextView list_item;
    public ImageView imageView;
    public String hymnNo;

    public IndexViewHolder(View view) {
        super(view);
        list_item = (TextView) view.findViewById(R.id.hymnTitle);
        imageView = (ImageView) view.findViewById(R.id.hymnGroupImage);
    }

}
