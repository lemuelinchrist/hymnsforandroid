package com.lemuelinchrist.android.hymns;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.ImageView;
import android.widget.TextView;

/**
 * Created by lemuelcantos on 14/8/13.
 */
public class HymnListAdapter extends ArrayAdapter<String> {
    private final Context context;
    private final int layout;

    public HymnListAdapter(Context context, int layout) {
        super(context, R.layout.drawer_list_item, HymnGroups.getArrayOfSimpleNames());
        this.context = context;
        this.layout = layout;


    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        LayoutInflater inflater = (LayoutInflater) context
                .getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        View rowView = inflater.inflate(layout, parent, false);
        TextView textView = (TextView) rowView.findViewById(R.id.hymnGroupName);
        ImageView imageView = (ImageView) rowView.findViewById(R.id.hymnGroupImage);
        textView.setText(HymnGroups.values()[position].getSimpleName());
        // Change the icon for Windows and iPhone
        imageView.setImageResource(context.getResources().getIdentifier(HymnGroups.values()[position].name().toLowerCase(), "drawable", context.getPackageName()));


        return rowView;
    }
}
