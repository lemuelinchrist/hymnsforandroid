package com.lemuelinchrist.android.hymns;

import android.graphics.Color;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by lemuelcantos on 18/8/13.
 */
public enum HymnGroup {
    E("English", Color.rgb(0x3D, 0x57, 0x7A),
            Color.rgb(0xB0, 0xBE, 0xC5)),
    // Green
    C("中文-繁", Color.rgb(0x66, 0x99, 0x00),
            Color.rgb(0xA5, 0xD6, 0xA7)),
    //Purple
    CS("補充本-繁", Color.rgb(0x99, 0x33, 0xCC),
            Color.rgb(0xCE, 0x93, 0xD8)),
    // Green
    Z("中文-简", Color.rgb(0x66, 0x99, 0x00),
            Color.rgb(0xA5, 0xD6, 0xA7)),
    //Purple
    ZS("補充本-简", Color.rgb(0x99, 0x33, 0xCC),
            Color.rgb(0xCE, 0x93, 0xD8)),
    //Orange
    CB("Cebuano", Color.rgb(0xFF, 0x88, 0x00),
            Color.rgb(0xFF, 0xCC, 0x80)),
    //Teal
    T("Tagalog", Color.rgb(0x00, 0x96, 0x88),
            Color.rgb(0x80, 0xCB, 0xC4)),
    //Pink
    FR("French", Color.rgb(0xE9, 0x1E, 0x63),
            Color.rgb(0xF4, 0x8F, 0xB1)),
    //Indigo
    S("Spanish", Color.rgb(0x3F, 0x51, 0xB5),
            Color.rgb(0x9F, 0xA8, 0xDA)),
    //Brown
    K("Korean", Color.rgb(0x79, 0x55, 0x48),
            Color.rgb(0xBC, 0xAA, 0xA4)),
    //Deep Orange
    G("German", Color.rgb(0xFF, 0x57, 0x22),
            Color.rgb(0xFF, 0xAB, 0x91)),
    //Light Green
    J("Japanese",Color.rgb(0x8B,0xC3,0x4A),
            Color.rgb(0xAE,0xD5,0x81)),
    //Blue
    BF("Be Filled", Color.rgb(0x00, 0x99, 0xCC),
            Color.rgb(0x90, 0xCA, 0xF9)),
    //Red
    NS("New Songs", Color.rgb(0xCC, 0x00, 0x00),
            Color.rgb(0xEF, 0x9A, 0x9A)),
    //Lime
    CH("Children", Color.rgb(0xAF, 0xB4, 0x2B),
            Color.rgb(0xE6, 0xEE, 0x9C));

    private final String simpleName;
    // taken from Google Color Palette #500
    private final int dayColor;
    // taken from Google color palette #200 - https://material.io/guidelines/style/color.html#color-color-palette
    private final int nightColor;

    public int getNightColor() {
        return nightColor;
    }

    public static HymnGroup getHymnGroupFromID(String hymnId) throws NoSuchHymnGroupException {
        //split hymn group from hymn number
        try {
            if (Character.isLetter(hymnId.charAt(1))) {
                return valueOf(hymnId.substring(0, 2).toUpperCase());
            } else {
                return valueOf(hymnId.substring(0, 1).toUpperCase());
            }
        } catch (IllegalArgumentException e) {
          throw new NoSuchHymnGroupException("No Such Hymn Group: " + hymnId);
        }
    }

    public static String getHymnNoFromID(String hymnId) {
        //split hymn group from hymn number
        if (Character.isLetter(hymnId.charAt(1))) {
            return hymnId.substring(2);
        } else {
            return hymnId.substring(1);
        }
    }


    public int getDayColor() {
        return dayColor;
    }

    public String getSimpleName() {
        return simpleName;
    }

    HymnGroup(String simpleName, int dayColor, int nightColor) {
        this.nightColor=nightColor;
        this.simpleName = simpleName;
        this.dayColor = dayColor;

    }
    public static String[] getArrayOfSimpleNames() {
        List<String> list = new ArrayList<String>();
        for (HymnGroup group: HymnGroup.values()) {
            list.add(group.getSimpleName());

        }
        return list.toArray(new String[list.size()]);
    }


}
