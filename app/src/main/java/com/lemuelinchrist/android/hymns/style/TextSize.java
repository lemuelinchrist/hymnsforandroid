package com.lemuelinchrist.android.hymns.style;

import com.lemuelinchrist.android.hymns.HymnGroup;

import java.util.ArrayList;
import java.util.List;

public enum TextSize {

    SMALL("Small",14f),MEDIUM("Medium",18f),LARGE("Large",22f),XL("Extra Large",26f),XXL("XXL",32f);

    private String simpleName;
    private float value;
    TextSize(String simpleName, float value) {
        this.simpleName=simpleName;
        this.value=value;
    }

    public static String[] getArrayOfSimpleNames() {
        List<String> list = new ArrayList<String>();
        for (TextSize textSize: TextSize.values()) {
            list.add(textSize.getSimpleName());

        }
        return list.toArray(new String[list.size()]);
    }

    public float getValue() {
        return value;
    }

    public String getSimpleName() {
        return simpleName;
    }

    public static TextSize get(String simpleName) {
        for(TextSize textSize:values()) {
            if(textSize.getSimpleName().toUpperCase().equals(simpleName.toUpperCase())) return textSize;
        }
        return null;

    }
}
