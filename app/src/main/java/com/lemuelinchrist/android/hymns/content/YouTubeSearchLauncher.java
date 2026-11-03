package com.lemuelinchrist.android.hymns.content;

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
public class YouTubeSearchLauncher {

    Context context;
    public YouTubeSearchLauncher(Context context) {
        this.context=context;
    }


    public void launch(Hymn hymn) {
        String search = searchFor(hymn.getGroup(), hymn.getNo(), hymn.getFirstStanzaLine(), hymn.getFirstChorusLine());

        Log.i(this.getClass().getName(),"Searching YouTube for: " + search.toString());
//        passDirectlyToYouTube(search);
        String url ="https://www.youtube.com/results?search_query="+getOnlyStrings(search.toString()).trim().replaceAll(" ","+");
        Log.i(this.getClass().getName(),"Converting search to YouTube URL: " + url);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setData(Uri.parse(url));
        context.startActivity(i);

    }

    // The saints who post recordings put the number in the title ("Hymn 313", "NS 46") and other churches' hymnals
    // number differently, so the number finds our recordings best for English hymns and New Songs. Other books keep
    // the first line and first chorus line until their videos' titles are tested.
    static String searchFor(String group, String no, String firstStanzaLine, String firstChorusLine) {
        StringBuilder search=new StringBuilder();
        String g = group == null ? "" : group.trim().toUpperCase();
        String prefix = g.equals("E") ? "Hymn " : g.equals("NS") ? "NS " : null;
        if(prefix!=null && no!=null && !no.isEmpty()) {
            search.append(prefix).append(no).append(" ");
            if(firstStanzaLine!=null) search.append(firstStanzaLine);
            return search.toString();
        }
        if(firstStanzaLine!=null && !firstStanzaLine.isEmpty()) {
            search.append(firstStanzaLine);
            search.append(" ");
        }
        if(firstChorusLine!=null && !firstChorusLine.isEmpty()) {
            search.append(firstChorusLine);
        }
        return search.toString();
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
