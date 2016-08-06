package com.lemuelinchrist.android.hymns.utils;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import com.lemuelinchrist.android.hymns.entities.Hymn;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Created by lcantos on 5/8/2016.
 */
public class YouTubeLauncher {

    Context context;
    public YouTubeLauncher(Context context) {
        this.context=context;
    }


    public void launch(Hymn hymn) {
        StringBuilder search=new StringBuilder();
        if(hymn.getFirstStanzaLine()!=null && !hymn.getFirstStanzaLine().isEmpty()) {
            search.append(hymn.getFirstStanzaLine());
            search.append(" ");
        }
        if(hymn.getFirstChorusLine()!=null && !hymn.getFirstChorusLine().isEmpty()) {
            search.append(hymn.getFirstChorusLine());
        }

        Log.i(this.getClass().getName(),"Searching YouTube for: " + search.toString());
//        passDirectlyToYouTube(search);
        String url ="https://www.youtube.com/results?search_query="+getOnlyStrings(search.toString()).trim().replaceAll(" ","+");
        Log.i(this.getClass().getName(),"Converting search to YouTube URL: " + url);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setData(Uri.parse(url));
        context.startActivity(i);

    }

    private void passDirectlyToYouTube(StringBuilder search) {
        Intent intent = new Intent(Intent.ACTION_SEARCH);
        intent.setPackage("com.google.android.youtube");
        intent.putExtra("query",search.toString());
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private static String getOnlyStrings(String s) {
        // letters only: [^a-z A-Z]
        Pattern pattern = Pattern.compile("[\\+\\.;!\"\':,]");
        Matcher matcher = pattern.matcher(s);
        String number = matcher.replaceAll("");
        return number;
    }
}
