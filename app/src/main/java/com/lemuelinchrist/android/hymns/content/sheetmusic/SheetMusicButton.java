package com.lemuelinchrist.android.hymns.content.sheetmusic;

import com.lemuelinchrist.android.hymns.R;
import android.content.Intent;
import android.view.View;
import android.widget.ImageButton;
import android.widget.Toast;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.content.ContentComponent;
import com.lemuelinchrist.android.hymns.entities.Hymn;

/**
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public class SheetMusicButton extends ContentComponent<ImageButton> {
    private final String sheetMusicId;

    public SheetMusicButton(final Hymn hymn, Fragment parentFragment, ImageButton imageButton) {
        super(hymn,parentFragment,imageButton);
        sheetMusicId = getRootMusicSheet();
        if (sheetMusicId == null) {
            imageButton.setVisibility(View.GONE);
        }
        imageButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                logToHistory();
                launchSheetMusic();
            }
        });
    }

    public void launchSheetMusic() {
        if (sheetMusicId != null) {
            Intent intent = new Intent(context, SheetMusicActivity.class);
            intent.putExtra("selectedHymnId", sheetMusicId);
            intent.putExtra("lyricsHymnId", hymn.getHymnId());   // a translation borrows its parent's sheet but may have its own lyrics
            context.startActivity(intent);
        } else {
            Toast.makeText(context, R.string.sorry_sheet_music_not_available, Toast.LENGTH_SHORT).show();
        }
    }


    private String getRootMusicSheet() {
        return hymn.getRootSheetId();
    }
}
