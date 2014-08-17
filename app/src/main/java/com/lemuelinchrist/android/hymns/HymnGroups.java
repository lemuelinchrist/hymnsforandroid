package com.lemuelinchrist.android.hymns;

import android.graphics.Color;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by lemuelcantos on 18/8/13.
 */
public enum HymnGroups {
    E("English", Color.rgb(0x3D, 0x57, 0x7A)),
    C("中文", Color.rgb(0x66, 0x99, 0x00)),
    CS("補充本", Color.rgb(0x99, 0x33, 0xCC)),
    CB("Cebuano", Color.rgb(0xFF, 0x88, 0x00)),
    BF("Be Filled", Color.rgb(0x00, 0x99, 0xCC)),
    NS("New Songs", Color.rgb(0xCC, 0x00, 0x00)),
    CH("Children", Color.rgb(0x66, 0x99, 0x00));

    private final String simpleName;
    private final int rgbColor;


    public int getRgbColor() {
        return rgbColor;
    }

    public String getSimpleName() {
        return simpleName;
    }

    HymnGroups(String simpleName, int rgbColor) {

        this.simpleName = simpleName;
        this.rgbColor = rgbColor;

    }
    public static String[] getArrayOfSimpleNames() {
        List<String> list = new ArrayList<String>();
        for (HymnGroups group:HymnGroups.values()) {
            list.add(group.getSimpleName());

        }
        return list.toArray(new String[list.size()]);
    }


}
