package com.lemuelinchrist.android.hymns.utils.Networks;


import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;

import androidx.preference.PreferenceManager;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lemuelinchrist.android.hymns.content.YoutubeButton;
import com.lemuelinchrist.android.hymns.entities.Hymn;

import java.util.regex.Matcher;
import java.util.regex.Pattern;
//import com.fasterxml.jackson.core.JsonParser;

public class NetworkCache {
    public static SharedPreferences Preferences;
    public static boolean hasInternet = false;
    public static HymnYT[] hymnTunes = null;

    public static void LoadHymnTunes(Context context) {
        if (Preferences == null) {
            Preferences = PreferenceManager.getDefaultSharedPreferences(context);
        }
        if (isNetworkAvailable(context)) {
            JsonFetch jsonFetch = new JsonFetch();
            jsonFetch.execute();
        }
    }

    public static HymnYT GetHymnTune(Hymn hymn) {
        String hymnId = hymn.getHymnId();
        if (hymnTunes != null) {
            for (HymnYT hm : hymnTunes) {
                if (hm.unique_id.equals(hymnId)) {
                    Preferences.edit().putString(hymnId, hm.youtube_link);
                    return hm;
                }
            }
        }

        String url = Preferences.getString(hymnId, null);
        if (url == null) {
            return null;
        }
        HymnYT yt = new HymnYT();
        yt.unique_id = hymnId;
        yt.youtube_link = url;
        return yt;
    }


    public static String extractYTId(String ytUrl) {
        String pattern = "(?<=youtu.be/|watch\\?v=|/videos/|embed\\/)[^#\\&\\?]*";
        Pattern compiledPattern = Pattern.compile(pattern);
        Matcher matcher = compiledPattern.matcher(ytUrl);
        if (matcher.find()) {
            return matcher.group();
        } else {
            return null;
        }
    }

    public static boolean isNetworkAvailable(Context context) {
        ConnectivityManager connectivityManager
                = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo activeNetworkInfo = connectivityManager != null ? connectivityManager.getActiveNetworkInfo() : null;
        boolean hasNetwork = activeNetworkInfo != null && activeNetworkInfo.isConnected();
        hasInternet = hasNetwork;
        return hasInternet;
    }
}



