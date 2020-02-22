package com.lemuelinchrist.android.hymns.sheetmusic;

import android.content.Intent;
import android.os.Build;
import android.view.View;
import android.widget.ImageButton;
import android.widget.Toast;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.content.ContentComponent;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;

/**
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public class SheetMusicButton extends ContentComponent<ImageButton> {
    private static HymnsDao hymnsDao = null;

    public SheetMusicButton(final Hymn hymn, Fragment parentFragment, ImageButton imageButton) {
        super(hymn,parentFragment,imageButton);
        imageButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                launchSheetMusic();
            }
        });
    }

    public void launchSheetMusic() {
        String sheetMusicId = getRootMusicSheet();

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) {
            LegacySheetMusic legacySheetMusic = new LegacySheetMusic(context,sheetMusicId);
            legacySheetMusic.shareToBrowser();
            return;
        }

        if (sheetMusicId != null) {
            Intent intent = new Intent(context, SheetMusicActivity.class);
            intent.putExtra("selectedHymnId", sheetMusicId);
            context.startActivity(intent);
        } else {
            Toast.makeText(context, "Sorry! sheet music not available", Toast.LENGTH_SHORT).show();
        }
    }


    private String getRootMusicSheet() {
        // not all hymns have their own sheet music, but maybe their parent does
        if (hymn.hasOwnSheetMusic()) {
            return hymn.getHymnId();

        } else if (hymn.getParentHymn() != null && !hymn.getParentHymn().isEmpty()) {
            if (hymnsDao == null) {
                hymnsDao = new HymnsDao(context);
            }
            hymnsDao.open();
            Hymn parentHymn = hymnsDao.get(hymn.getParentHymn());
            hymnsDao.close();
            if (parentHymn.hasOwnSheetMusic()) {
                return parentHymn.getHymnId();
            }
        }
        return null;
    }
}
