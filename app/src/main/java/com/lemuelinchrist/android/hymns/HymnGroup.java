package com.lemuelinchrist.android.hymns;

import android.graphics.Color;
import android.util.Log;
import android.view.Gravity;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by lemuelcantos on 18/8/13.
 */
public enum HymnGroup {
    E("English", Color.rgb(0x3D, 0x57, 0x7A),
            Color.rgb(0xB0, 0xBE, 0xC5),
            Gravity.LEFT),
    // Green
    C("中文-繁", Color.rgb(0x66, 0x99, 0x00),
            Color.rgb(0xA5, 0xD6, 0xA7),
            Gravity.LEFT),
    //Purple
    CS("補充本-繁", Color.rgb(0x99, 0x33, 0xCC),
            Color.rgb(0xCE, 0x93, 0xD8),
            Gravity.LEFT),
    // Green
    Z("中文-简", Color.rgb(0x66, 0x99, 0x00),
            Color.rgb(0xA5, 0xD6, 0xA7),
            Gravity.LEFT),
    //Purple
    ZS("補充本-简", Color.rgb(0x99, 0x33, 0xCC),
            Color.rgb(0xCE, 0x93, 0xD8),
            Gravity.LEFT),
    //Orange
    CB("Cebuano", Color.rgb(0xFF, 0x88, 0x00),
            Color.rgb(0xFF, 0xCC, 0x80),
            Gravity.LEFT),
    //Teal
    T("Tagalog", Color.rgb(0x00, 0x96, 0x88),
            Color.rgb(0x80, 0xCB, 0xC4),
            Gravity.LEFT),
    //Pink
    FR("French", Color.rgb(0xE9, 0x1E, 0x63),
            Color.rgb(0xF4, 0x8F, 0xB1),
            Gravity.LEFT),
    //Indigo
    S("Spanish", Color.rgb(0x3F, 0x51, 0xB5),
            Color.rgb(0x9F, 0xA8, 0xDA),
            Gravity.LEFT),
    //Brown
    K("Korean", Color.rgb(0x79, 0x55, 0x48),
            Color.rgb(0xBC, 0xAA, 0xA4),
            Gravity.LEFT),
    //Deep Orange
    G("German", Color.rgb(0xFF, 0x57, 0x22),
            Color.rgb(0xFF, 0xAB, 0x91),
            Gravity.LEFT),
    //Light Green
    J("Japanese",Color.rgb(0x8B,0xC3,0x4A),
            Color.rgb(0xAE,0xD5,0x81),
            Gravity.LEFT),
    // Red
    I("B.Indonesia",Color.rgb(0xF4,0x43,0x36),
            Color.rgb(0xE5,0x73,0x73),
            Gravity.LEFT),
    //Blue
    BF("Be Filled", Color.rgb(0x00, 0x99, 0xCC),
            Color.rgb(0x90, 0xCA, 0xF9),
            Gravity.LEFT),
    //Red
    NS("New Songs", Color.rgb(0xCC, 0x00, 0x00),
            Color.rgb(0xEF, 0x9A, 0x9A),
            Gravity.LEFT),
    //Lime
    CH("Children", Color.rgb(0xAF, 0xB4, 0x2B),
            Color.rgb(0xE6, 0xEE, 0x9C),
            Gravity.LEFT),
    //Deep Purple
    F("Farsi", Color.rgb(0x67, 0x3A, 0xB7),
            Color.rgb(0x95, 0x75, 0xCD),
            Gravity.RIGHT),
    // Purple
    SK("Slovak", Color.rgb(0x9C, 0x27, 0xB0),
            Color.rgb(0xBA, 0x68, 0xC8),
            Gravity.LEFT);

    private final String simpleName;
    // taken from Google Color Palette #500
    private final int dayColor;
    // taken from Google color palette #200 - https://material.io/guidelines/style/color.html#color-color-palette
    private final int nightColor;

    public static final String DEFAULT_HYMN_NUMBER="E1";
    private final int textAlignment;

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

    public static HymnGroup getDefaultHymnGroup() {
        return HymnGroup.getHymnGroupFromID(DEFAULT_HYMN_NUMBER);
    }

    public int getDayColor() {
        return dayColor;
    }

    public String getSimpleName() {
        return simpleName;
    }

    HymnGroup(String simpleName, int dayColor, int nightColor, int textAlignment) {
        this.nightColor=nightColor;
        this.simpleName = simpleName;
        this.dayColor = dayColor;
        this.textAlignment = textAlignment;

    }
    public static String[] getArrayOfSimpleNames() {
        List<String> list = new ArrayList<String>();
        for (HymnGroup group: HymnGroup.values()) {
            list.add(group.getSimpleName());

        }
        return list.toArray(new String[list.size()]);
    }

    public static String[] getArrayOfCodes() {
        List<String> list = new ArrayList<String>();
        for (HymnGroup group: HymnGroup.values()) {
            list.add(group.name());

        }
        return list.toArray(new String[list.size()]);
    }

    public static HymnGroup getFromSimpleName(String simpleName) {
        for (HymnGroup group: HymnGroup.values()) {
            if(group.getSimpleName().equals(simpleName)) return group;
        }
        Log.e(HymnGroup.class.getSimpleName(), "warning: selected Hymn group not found. Switching to default group: E");
        return getDefaultHymnGroup();
    }

    public int getTextAlignment() {
        return textAlignment;
    }

    public boolean isBigHymnLanguage() {
        switch (this) {
            case NS:
            case BF:
            case CH:
                return false;
            default:
                return true;
        }
    }
}
