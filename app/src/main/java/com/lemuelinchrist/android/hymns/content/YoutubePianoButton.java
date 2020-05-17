package com.lemuelinchrist.android.hymns.content;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.ImageButton;
import androidx.fragment.app.Fragment;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;

/**
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public class YoutubePianoButton extends ContentComponent<ImageButton> {

    private static HymnsDao hymnsDao;
    private String link;

    public YoutubePianoButton(final Hymn hymn, final Fragment parentFragment, ImageButton imageButton) {
        super(hymn, parentFragment, imageButton);

        if (hymnsDao == null) {
            hymnsDao = new HymnsDao(context);
        }

        if(hymn.getTune()!=null && !hymn.getTune().isEmpty()) {
            hymnsDao.open();
            link = hymnsDao.getYoutubeLinkFromTune(hymn.getTune());
            hymnsDao.close();
        }

        SharedPreferences sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context);

        if(link==null || !sharedPreferences.getBoolean("youtubePiano",false)) {
            imageButton.setVisibility(View.GONE);
        }

        imageButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if(link!=null) {
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setData(Uri.parse(link));
                    context.startActivity(intent);
                }
            }
        });
    }
}
