package com.lemuelinchrist.android.hymns.sheetmusic;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Environment;
import android.support.annotation.NonNull;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.util.Log;
import android.widget.Toast;

import com.lemuelinchrist.android.hymns.LyricContainer;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;

/**
 * Created by lemuelcantos on 6/12/14.
 */
public class SheetMusic {
    private Context context;
    private String selectedHymnId;

    // to switch to guitar or piano notes, change value to either guitarSvg/ or pianoSvg/
    // then copy corresponding folder from HymnsJpa/data/<folderName> to HymnsForAndroid/app/src/main/assets<folderName>
    private String folderName = null;
    private Hymn hymn;

    public SheetMusic(Context context, String selectedHymnId) {
        this.context = context;
        this.selectedHymnId=selectedHymnId;

        // get folder that contains the svg files
        // the folder name will either be "pianoSvg" or "guitarSvg" depending on what is currently
        // in the asset folder
        try {
            for (String assetFolder : context.getAssets().list("")) {
                if (assetFolder.contains("svg")) {
                    this.folderName = assetFolder + "/";
                    Log.i(this.getClass().getName(), "Svg folder found. folderName is: " + this.folderName);
                }

            }
        } catch (IOException e) {
            e.printStackTrace();
            this.folderName=null;
        }

    }

    public boolean isLocalSheetAvailable() {
        return (this.folderName==null);
    }

    public Intent shareAsIntent() {
        HymnsDao dao = new HymnsDao(context);
        dao.open();
        hymn = dao.get(selectedHymnId);
        dao.close();
        Intent intent = new Intent(Intent.ACTION_VIEW);
        String sheetMusicLink = hymn.getSheetMusicLink();
        if(sheetMusicLink==null || sheetMusicLink.isEmpty()) {
            toastSheetMusicNotAvailable(null);
            return null;
        }
        String editedLink = sheetMusicLink.replace("_p.", "_g."); // p is for piano, g for guitar
        intent.setData(Uri.parse(editedLink));
        return intent;


    }

    public void getSheetMusic(Hymn hymn) {
        // note: switch this value to "onlineOnly" if you want to create a version that doesn't include sheet music svg's.
        final String BRANCH = "somethingElse";

        String sheetMusicLink = hymn.getSheetMusicLink();
        if (sheetMusicLink != null) {

            if (this.folderName == null) {

                context.startActivity(shareAsIntent());
                return;
            }
            String fileName;

            // after getting folder name, its time to get the svg filename. we can get this either from
            // the hymn itself or from its parent.
            if (!hymn.hasOwnSheetMusic()) {
                fileName = hymn.getParentHymn() + ".svg";
            } else {
                fileName = hymn.getHymnId() + ".svg";
            }

            shareToBrowser(fileName);


        } else {
            Toast.makeText(context, "Sorry! Sheet music not available", Toast.LENGTH_SHORT).show();

        }
    }

    private boolean deleteDirectory(File path) {
        if (path.exists()) {
            File[] files = path.listFiles();
            if (files == null) {
                return true;
            }
            for (int i = 0; i < files.length; i++) {
                if (files[i].isDirectory()) {
                    deleteDirectory(files[i]);
                } else {
                    files[i].delete();
                }
            }
        }
        return (path.delete());
    }

    // fileName should just be the name without the path. ex. E1.svg
    public void shareToBrowser(String fileName) {
        if (folderName==null) {
            toastSheetMusicNotAvailable(null);
            return;
        }
        try {
            File file = saveToExternalStorage(fileName);


            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setData(
                    Uri.fromFile(file)
            );


            intent.setClassName("org.mozilla.firefox", "org.mozilla.firefox.App");
            //test if chrome exists
            PackageManager packageManager = context.getPackageManager();
            List<ResolveInfo> activities = packageManager.queryIntentActivities(intent, 0);
            boolean isIntentSafe = activities.size() > 0;
            if (!isIntentSafe) {
                Log.i(this.getClass().getName(), "firefox not found, finding chrome");
                intent.setClassName("com.android.chrome", "com.google.android.apps.chrome.Main");
            }


            context.startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(context, "Oops! Chrome or Firefox not available! To display music sheet, please install Chrome or Firefox.", Toast.LENGTH_LONG).show();
        } catch (NoPermissionException e) {
            Toast.makeText(context, "Oops! You didn't grant me permission to write to storage.", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            toastSheetMusicNotAvailable(e);
        }

    }

    private void toastSheetMusicNotAvailable(Exception e) {
        Toast.makeText(context, "Sorry! Sheet music not available", Toast.LENGTH_SHORT).show();
        Log.e(SheetMusic.class.getSimpleName(), e.getMessage());
    }

    @NonNull
    // fileName should just be the name without the path. ex. E1.svg
    public File saveToExternalStorage(String fileName) throws NoPermissionException, IOException {

        // Checking permissions for version Marshmallow or later
        if (ContextCompat.checkSelfPermission(context,
                Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {

            // Should we show an explanation?
            if (ActivityCompat.shouldShowRequestPermissionRationale((Activity) context,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE)) {

                // Show an expanation to the user *asynchronously* -- don't block
                // this thread waiting for the user's response! After the user
                // sees the explanation, try again to request the permission.

                throw new NoPermissionException();

            } else {

                // No explanation needed, we can request the permission.

                ActivityCompat.requestPermissions((Activity) context,
                        new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                        1);

            }
        }


        AssetManager assetManager = context.getAssets();
        File file;
        InputStream in;
        OutputStream out;
        final File externalStorageSvgDir = new File(Environment.getExternalStorageDirectory(), "musicSheet");


        deleteDirectory(externalStorageSvgDir);
        if (!externalStorageSvgDir.mkdirs())
            Log.w(LyricContainer.class.getSimpleName(), "directory already exists. no need to create one.");

        file = new File(externalStorageSvgDir, fileName);
        in = assetManager.open(folderName + fileName);
        out = new FileOutputStream(file);


        byte[] buffer = new byte[1024];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }

        in.close();
        in = null;
        out.flush();
        out.close();
        out = null;
        return file;
    }

    private class NoPermissionException extends Throwable {
    }
}
