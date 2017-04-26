package com.lemuelinchrist.android.hymns;

import android.graphics.Color;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by lemuelcantos on 18/8/13.
 */
public enum HymnGroup {
    E("English", Color.rgb(0x3D, 0x57, 0x7A)),
    C("中文", Color.rgb(0x66, 0x99, 0x00)),
    CS("補充本", Color.rgb(0x99, 0x33, 0xCC)),
    CB("Cebuano", Color.rgb(0xFF, 0x88, 0x00)),
    T("Tagalog", Color.rgb(0x00, 0x96, 0x88)),
    FR("French", Color.rgb(0xE9, 0x1E, 0x63)),
    S("Spanish", Color.rgb(0x3F, 0x51, 0xB5)),
    K("Korean", Color.rgb(0x79, 0x55, 0x48)),
    G("German", Color.rgb(0xFF, 0x57, 0x22)),
    BF("Be Filled", Color.rgb(0x00, 0x99, 0xCC)),
    NS("New Songs", Color.rgb(0xCC, 0x00, 0x00)),
    CH("Children", Color.rgb(0xAF, 0xB4, 0x2B));

    private final String simpleName;
    private final int rgbColor;


    public int getRgbColor() {
        return rgbColor;
    }

    public String getSimpleName() {
        return simpleName;
    }

    HymnGroup(String simpleName, int rgbColor) {

        this.simpleName = simpleName;
        this.rgbColor = rgbColor;

    }
    public static String[] getArrayOfSimpleNames() {
        List<String> list = new ArrayList<String>();
        for (HymnGroup group: HymnGroup.values()) {
            list.add(group.getSimpleName());

        }
        return list.toArray(new String[list.size()]);
    }


}
