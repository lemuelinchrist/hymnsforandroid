package com.lemuelinchrist.android.hymns;

import android.content.Context;
import android.content.SharedPreferences;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.preference.PreferenceManager;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Created by lemuelcantos on 14/8/13.
 */
public class HymnDrawer extends ArrayAdapter<String> {
    private final Context context;
    private final int layout;

    public HymnDrawer(Context context, int layout) {
        super(context, R.layout.drawer_hymngroup_list, getActiveHymnGroups(context));
        this.context = context;
        this.layout = layout;
    }

    private static String[] getActiveHymnGroups(Context context) {
        SharedPreferences sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context);
        Set<String> disabled = sharedPreferences.getStringSet("disableLanguages",new HashSet<String>());
        List<String> activeGroups = new ArrayList<>();
        for( HymnGroup hymnGroup: HymnGroup.values()) {
            if(!disabled.contains(hymnGroup.name())) {
                activeGroups.add(hymnGroup.getSimpleName());
            }
        }
        return activeGroups.toArray(new String[]{});
    }

    public HymnGroup getSelectedHymnGroup(int position) {
        return HymnGroup.getFromSimpleName(getActiveHymnGroups(context)[position]);
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        LayoutInflater inflater = (LayoutInflater) context
                .getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        View rowView = inflater.inflate(layout, parent, false);
        TextView textView = rowView.findViewById(R.id.hymnGroupName);
        ImageView imageView = rowView.findViewById(R.id.hymnGroupImage);
        HymnGroup selectedHymnGroup = getSelectedHymnGroup(position);
        textView.setText(selectedHymnGroup.getSimpleName());
        // Change the icon for Windows and iPhone
        imageView.setImageResource(context.getResources().getIdentifier(selectedHymnGroup.name().toLowerCase(), "drawable", context.getPackageName()));
        return rowView;
    }
}
