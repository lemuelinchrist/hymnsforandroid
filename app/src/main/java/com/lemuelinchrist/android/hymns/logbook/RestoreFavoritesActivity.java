package com.lemuelinchrist.android.hymns.logbook;

import android.net.Uri;
import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

/**
 * Opens a favorites backup file that was tapped in another app (email, chat, Drive, Files) and asks whether to add
 * its hymns to the favorites. It has no screen of its own, only FavoritesBackup's dialogs.
 */
public class RestoreFavoritesActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FavoritesBackup favoritesBackup = new FavoritesBackup(this, added -> finish());

        Uri uri = getIntent().getData();
        if (uri == null) finish();
        else favoritesBackup.restoreOpenedFile(uri);
    }
}
