package com.lemuelinchrist.android.hymns.style;

import com.lemuelinchrist.android.hymns.R;

import java.util.ArrayList;
import java.util.List;

public enum Theme {

    DARK(R.layout.lyric_container_night), LIGHT(R.layout.lyric_container);

    public int getStyle() {
        return style;
    }

    int style;

    Theme(int style) {
        this.style=style;
    }
}
