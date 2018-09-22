package com.lemuelinchrist.android.hymns.utils;

import android.util.Log;

import java.util.ArrayList;

/**
 * Created by lemuelcantos on 5/9/13.
 */
public class HymnStack {
    private ArrayList<String> stack = new ArrayList<String>();


    // the stack requires at least one beginning element
    public HymnStack(String firstHymn) {
        stack.add(firstHymn);
    }

    public void push(String hymn) {


        if (hymn == null) {
            Log.e(getClass().getSimpleName(), "Strange! why is a null being pushed in the hymn stack?");
            return;
        }

        // We dont want to push duplicates
        if (!stack.isEmpty() && stack.get(0).equals(hymn))
            return;

        stack.add(0, hymn);
        Log.i(this.getClass().getSimpleName(), "pushed hymn: " + hymn);
    }

    public boolean isEmpty() {
        return stack.isEmpty();
    }

    public String pop() {

        if (stack.size()>1) {
            stack.remove(0);
        }
        String poppedHymn = stack.get(0);
        Log.i(this.getClass().getSimpleName(), "Popped Hymn: " + poppedHymn);
        return poppedHymn;

    }


}
