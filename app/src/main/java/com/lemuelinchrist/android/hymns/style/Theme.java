package com.lemuelinchrist.android.hymns.style;

import java.util.ArrayList;
import java.util.List;

public enum Theme {
    DARK("Dark",0,0), LIGHT("Light",0,0);

    private final String simpleName;

    public int getHeaderBackground() {
        return headerBackground;
    }

    public int getLyricBackground() {
        return lyricBackground;
    }

    private final int headerBackground;
    private final int lyricBackground;

    Theme(String simpleName, int headerBackground, int lyricBackground) {
        this.simpleName=simpleName;
        this.headerBackground=headerBackground;
        this.lyricBackground=lyricBackground;
    }

    public static String[] getArrayOfSimpleNames() {
        List<String> list = new ArrayList<String>();
        for (TextSize textSize: TextSize.values()) {
            list.add(textSize.getSimpleName());

        }
        return list.toArray(new String[list.size()]);
    }


    public String getSimpleName() {
        return simpleName;
    }

    public static Theme get(String simpleName) {
        for(Theme theme:values()) {
            if(theme.getSimpleName().toUpperCase().equals(simpleName.toUpperCase())) return theme;
        }
        return null;

    }

}
