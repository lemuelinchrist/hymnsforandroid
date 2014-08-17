package com.lemuelinchrist.android.hymns.utils;

import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.util.Log;

import com.lemuelinchrist.android.hymns.HymnGroups;
import com.lemuelinchrist.android.hymns.HymnsActivity;

/**
 * Created by lemuelcantos on 21/7/13.
 */
public class HymnTextFormatter {
    public static CharSequence setColorBetweenTokens(CharSequence text,
                                                     String token, int color) {
        Log.d(HymnsActivity.LOGTAG, "text to be formatted: " + text.toString());

        while (true) {
            // Start and end refer to the points where the span will apply
            int tokenLen = token.length();
            int start = text.toString().indexOf(token) + tokenLen;
            int end = text.toString().indexOf(token, start);

            Log.d(HymnsActivity.LOGTAG, "starting index of token: " + start);
            Log.d(HymnsActivity.LOGTAG, "ending index of token: " + end);

            if (start > -1 && end > -1) {
                Log.i(HymnsActivity.LOGTAG, "match found at " + start + " , " + end + " !");
                // Copy the spannable string to a mutable spannable string
                SpannableStringBuilder ssb = new SpannableStringBuilder(text);

                ssb.setSpan(new ForegroundColorSpan(color), start, end, 0);

                // Delete the tokens before and after the span
                ssb.delete(end, end + tokenLen);
                ssb.delete(start - tokenLen, start);

                text = ssb;
            } else {
                break;
            }
        }
        return text;
    }


    public static CharSequence format(Spanned unformattedText, String hymnGroup) {

        Log.d(HymnsActivity.LOGTAG, "formatting unformatted text!");
        CharSequence formattedText;
        // set red color to stanza numbers
        formattedText = setColorBetweenTokens(unformattedText, "##", HymnGroups.valueOf(hymnGroup).getRgbColor());

        // set green color to chorus lyrics
        formattedText = setColorBetweenTokens(formattedText, "@@", HymnGroups.valueOf(hymnGroup).getRgbColor());

        return formattedText;
    }
}
