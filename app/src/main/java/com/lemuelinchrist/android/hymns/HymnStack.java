package com.lemuelinchrist.android.hymns;

import android.util.Log;

import java.util.ArrayList;

/**
 * Created by lemuelcantos on 5/9/13.
 */
public class HymnStack {
    public static final String BLANK = "blank";
    ArrayList<String> stack = new ArrayList<String>();
    private String poppedHymn;
    private boolean isLastActionPop;
    private String pushedHymn;

    public void push(String hymn) {


        if (hymn == null) {
            hymn = BLANK;
        }

        if (!stack.isEmpty() && stack.get(0).equals(hymn))
            return;

        if (isLastActionPop) {
            isLastActionPop = false;
            return;
        }
        if (poppedHymn != null) {
            stack.add(0, poppedHymn);
            poppedHymn = null;
        }

        stack.add(0, hymn);
        pushedHymn = hymn;
        Log.i(this.getClass().getSimpleName(), "stack: " + stack);
    }

    public boolean isEmpty() {
        return stack.isEmpty();
    }

    public String pop() {

        if (pushedHymn != null) {
            String top = stack.remove(0);
            Log.i(this.getClass().getSimpleName(), "Removed top: " + top);
            pushedHymn = null;
        }
        if (stack.isEmpty())
            return null;

        isLastActionPop = true;

        poppedHymn = stack.remove(0);
        Log.i(this.getClass().getSimpleName(), "Popped Hymn: " + poppedHymn);
        if (poppedHymn.equals(BLANK)) {
            poppedHymn = stack.remove(0);
            Log.i(this.getClass().getSimpleName(), "Popping again: " + poppedHymn);

        }
        return poppedHymn;
    }


}
