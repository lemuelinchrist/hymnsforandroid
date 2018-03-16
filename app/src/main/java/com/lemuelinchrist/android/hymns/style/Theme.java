package com.lemuelinchrist.android.hymns.style;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;

import java.util.ArrayList;
import java.util.List;

public enum Theme {

    DARK(R.layout.lyric_container_night, Color.parseColor("#000000")), LIGHT(R.layout.lyric_container, null);

    int style;
    private final Integer actionBarColor;


    Theme(Integer style, Integer actionBarColor) {
        this.style=style;
        this.actionBarColor=actionBarColor;
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
