package com.lemuelinchrist.android.hymns.style;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;

public enum Theme {

    DARK(R.layout.content_area_night,  R.string.dayMode, Color.BLACK,0xFFcccccc,Color.BLACK) {
        @Override
        public ColorDrawable getActionBarColor(HymnGroup hymnGroup) {
            return new ColorDrawable(Color.parseColor("#000000"));
        }

        @Override
        public int getTextColor(HymnGroup hymnGroup) {
            return hymnGroup.getNightColor();
        }
    },
    LIGHT(R.layout.content_area, R.string.nightMode, Color.WHITE,0xFF4e4e4e, Color.WHITE) {
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

    public int getTextColor() {
        return textColor;
    }

    public int getTextBackgroundColor() {
        return textBackgroundColor;
    }

    private final int textColor;
    private final int textBackgroundColor;
    int style;


    Theme(Integer style,  int menuDisplayText, int navigationBarColor, int textColor, int textBackgroundColor) {
        this.style=style;
        this.menuDisplayText=menuDisplayText;
        this.navigationBarColor=navigationBarColor;
        this.textColor = textColor;
        this.textBackgroundColor = textBackgroundColor;
    }

    public static Theme isNightModePreferred(boolean nightModePreferred) {
        if(nightModePreferred) {
            return DARK;
        } else {
            return LIGHT;
        }
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
