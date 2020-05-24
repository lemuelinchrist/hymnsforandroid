package com.lemuelinchrist.android.hymns.content;


import android.view.View;
import android.widget.ImageButton;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.entities.Hymn;

/**
 * @author Lemuel Cantos
 * @since 21/2/2020
 */
public class PlayButton extends ContentComponent<ImageButton> {
    private boolean isPlaying=false;
    private static PlayButton currentlyPlayingButton;

    public PlayButton(final Hymn hymn, Fragment parentFragment, ImageButton imageButton) {
        super(hymn,parentFragment,imageButton);
        imageButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                logToHistory();
                if(isPlaying){
                    stop();
                } else {
                    play();
                }
                isPlaying=!isPlaying;
            }
        });
    }
    public void play() {
        stopCurrentlyPlayingButton();
        view.setImageResource(R.drawable.ic_pause_white_48dp);
        currentlyPlayingButton=this;
        hymn.playHymn();
    }
    public void stop() {
        view.setImageResource(R.drawable.ic_play_arrow_white_48dp);
        hymn.stopHymn();
    }
    public static void stopCurrentlyPlayingButton() {
        if(currentlyPlayingButton!=null) {
            currentlyPlayingButton.stop();
        }
    }
}
