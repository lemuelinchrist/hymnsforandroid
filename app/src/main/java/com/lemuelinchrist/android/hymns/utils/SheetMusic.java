package com.lemuelinchrist.android.hymns.utils;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Environment;
import android.util.Log;
import android.widget.Toast;

import com.lemuelinchrist.android.hymns.LyricContainer;
import com.lemuelinchrist.android.hymns.entities.Hymn;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Created by lemuelcantos on 6/12/14.
 */
public class SheetMusic {
    private Context context;

    public SheetMusic(Context context) {
        this.context = context;

    }

    public void getSheetMusic(Hymn hymn ) {
        // note: switch this value to "main" if you want to create a version that doesn't include sheet music svg's.
        final String BRANCH = "guitar";

        String sheetMusicLink = hymn.getSheetMusicLink();
        if (sheetMusicLink != null) {
            Intent i = new Intent(Intent.ACTION_VIEW);

            if (BRANCH.equals("main")) {
                String editedLink = sheetMusicLink.replace("_p.", "_g."); // p is for piano, g for guitar

                i.setData(Uri.parse(editedLink));
                context.startActivity(i);

            } else if (BRANCH.equals("guitar")) {

                String fileName;

                if (!hymn.hasOwnSheetMusic()) {
                    fileName = hymn.getParentHymn() + ".svg";
                } else {
                    fileName = hymn.getHymnId() + ".svg";
                }

                generateGuitarSheet(fileName);

            }

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

    void generateGuitarSheet(String fileName) {
        try {

            AssetManager assetManager = context.getAssets();
            File file;
            InputStream in;
            OutputStream out;
            final File externalStorageSvgDir = new File(Environment.getExternalStorageDirectory(), "musicSheet");


            deleteDirectory(externalStorageSvgDir);
            if (!externalStorageSvgDir.mkdirs())
                Log.w(LyricContainer.class.getSimpleName(), "directory already exists. no need to create one.");

            file = new File(externalStorageSvgDir, fileName);
            in = assetManager.open("pianoSvg/" + fileName);
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

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setData(
                    Uri.fromFile(file)
            );

            intent.setClassName("com.android.chrome", "com.google.android.apps.chrome.Main");

            context.startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(context, "Oops! Chrome not available! To display music sheet, please install Google Chrome from the Play Store.", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(context, "Sorry! Sheet music not available", Toast.LENGTH_SHORT).show();
            Log.e(SheetMusic.class.getSimpleName(), e.getMessage());
        }

    }
}
