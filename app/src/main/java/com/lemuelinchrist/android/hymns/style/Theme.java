package com.lemuelinchrist.android.hymns.style;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;

import java.util.ArrayList;
import java.util.List;

public enum Theme {

    DARK(R.layout.lyric_container_night, Color.parseColor("#000000"), R.string.dayMode),
    LIGHT(R.layout.lyric_container, null, R.string.nightMode);

    private final int menuDisplayText;
    int style;
    private final Integer actionBarColor;


    Theme(Integer style, Integer actionBarColor, int menuDisplayText) {
        this.style=style;
        this.actionBarColor=actionBarColor;
        this.menuDisplayText=menuDisplayText;
    }

    public int getMenuDisplayText() {
        return menuDisplayText;
    }

    public int getStyle() {
        return style;
    }
    public ColorDrawable getActionBarColor(HymnGroup hymnGroup) {
        if (actionBarColor==null) {
            return new ColorDrawable(hymnGroup.getDayColor());
        }
        else {
            return new ColorDrawable(actionBarColor);
        }
    }
}
