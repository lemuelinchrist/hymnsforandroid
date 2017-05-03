package com.lemuelinchrist.android.hymns.sheetmusic;


import android.content.ContentProvider;
import android.net.Uri;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;

import java.io.FileNotFoundException;

import android.content.ContentValues;
import android.database.Cursor;

import java.io.IOException;

import android.os.CancellationSignal;
import android.util.Log;


/**
 * Created by lcantos on 3/5/2017.
 */

public class SheetMusicContentProvider extends ContentProvider {

    @Override
    public AssetFileDescriptor openAssetFile(Uri uri, String mode) throws FileNotFoundException {
        Log.v(getClass().getName(), "AssetsGetter: Open asset file");
        AssetManager am = getContext().getAssets();
        String file_name = uri.getLastPathSegment();
        if (file_name == null)
            throw new FileNotFoundException();
        AssetFileDescriptor afd = null;
        try {
            afd = am.openFd(file_name);
        } catch (IOException e) {
            e.printStackTrace();
        }
        return afd;//super.openAssetFile(uri, mode);
    }

    @Override
    public String getType(Uri p1) {
        // TODO: Implement this method
        return null;
    }

    @Override
    public int delete(Uri p1, String p2, String[] p3) {
        // TODO: Implement this method
        return 0;
    }

    @Override
    public Cursor query(Uri p1, String[] p2, String p3, String[] p4, String p5) {
        // TODO: Implement this method
        return null;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder, CancellationSignal cancellationSignal) {
        // TODO: Implement this method
        return super.query(uri, projection, selection, selectionArgs, sortOrder, cancellationSignal);
    }

    @Override
    public Uri insert(Uri p1, ContentValues p2) {
        // TODO: Implement this method
        return null;
    }

    @Override
    public boolean onCreate() {
        // TODO: Implement this method
        return false;
    }

    @Override
    public int update(Uri p1, ContentValues p2, String p3, String[] p4) {
        // TODO: Implement this method
        return 0;
    }
}