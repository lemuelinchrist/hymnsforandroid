package com.lemuelinchrist.android.hymns.style;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;

public enum Theme {

    DARK(R.layout.lyric_container_night,  R.string.dayMode, Color.BLACK) {
        @Override
        public ColorDrawable getActionBarColor(HymnGroup hymnGroup) {
            return new ColorDrawable(Color.parseColor("#000000"));
        }

        @Override
        public int getTextColor(HymnGroup hymnGroup) {
            return hymnGroup.getNightColor();
        }
    },
    LIGHT(R.layout.lyric_container, R.string.nightMode, Color.WHITE) {
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
    private final int navigationBarColor;
    int style;


    Theme(Integer style,  int menuDisplayText, int navigationBarColor) {
        this.style=style;
        this.menuDisplayText=menuDisplayText;
        this.navigationBarColor=navigationBarColor;
    }

    public int getMenuDisplayText() {
        return menuDisplayText;
    }

    public int getStyle() {
        return style;
    }

    public abstract ColorDrawable getActionBarColor(HymnGroup hymnGroup);
    public abstract int getTextColor(HymnGroup hymnGroup);

    public int getNavigationBarColor() {
        return 0;
    }
}
