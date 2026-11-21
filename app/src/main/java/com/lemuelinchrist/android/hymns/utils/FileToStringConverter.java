package com.lemuelinchrist.android.hymns.utils;

import android.app.Activity;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public class FileToStringConverter {

    // reads a raw file in your resource and throws back a String.
    public static String convertRawFile(Activity context, int rDotRaw) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (InputStream hymnIS = context.getResources().openRawResource(rDotRaw);
             BufferedReader in = new BufferedReader(new InputStreamReader(hymnIS, StandardCharsets.UTF_8))) {
            String line;
            while ((line = in.readLine()) != null)
                sb.append(line);
        }

        return sb.toString();
    }

}
