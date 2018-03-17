package com.lemuelinchrist.android.hymns.style;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;

import java.util.ArrayList;
import java.util.List;

public enum Theme {

    DARK(R.layout.lyric_container_night,  R.string.dayMode) {
        @Override
        public ColorDrawable getActionBarColor(HymnGroup hymnGroup) {
            return new ColorDrawable(Color.parseColor("#000000"));
        }

        @Override
        public int getTextColor(HymnGroup hymnGroup) {
            return hymnGroup.getNightColor();
        }
    },
    LIGHT(R.layout.lyric_container, R.string.nightMode) {
        @Override
        public ColorDrawable getActionBarColor(HymnGroup hymnGroup) {
            return new ColorDrawable(hymnGroup.getDayColor());
        }

        @Override
        public int getTextColor(HymnGroup hymnGroup) {
            return hymnGroup.getDayColor();
        }
    };

    private final int menuDisplayText;
    int style;


    Theme(Integer style,  int menuDisplayText) {
        this.style=style;
        this.menuDisplayText=menuDisplayText;
    }

    public int getMenuDisplayText() {
        return menuDisplayText;
    }

    public int getStyle() {
        return style;
    }

    public abstract ColorDrawable getActionBarColor(HymnGroup hymnGroup);
    public abstract int getTextColor(HymnGroup hymnGroup);
}
