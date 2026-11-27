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
    private JukeboxCard jukebox;

    public PlayButton(final Hymn hymn, Fragment parentFragment, ImageButton imageButton) {
        super(hymn,parentFragment,imageButton);
        if (!hymn.canPlay()) {
            imageButton.setVisibility(View.GONE);
        }
        imageButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (jukebox != null && jukebox.isAvailable()) {
                    jukebox.togglePlay();   // shows the jukebox card and plays in it (logs the play)
                    return;
                }
                logToHistory();
                if(isPlaying){
                    stop();
                } else {
                    // stays on "play" when the hymn has no melody
                    play();
                }
            }
        });
    }
    /** The page's jukebox card: this button shows it and plays in it, and follows what it does. */
    public void setJukebox(JukeboxCard card) {
        jukebox = card;
        card.setPlayStateListener(playing -> view.setImageResource(
                playing ? R.drawable.ic_pause_white_48dp : R.drawable.ic_play_arrow_white_48dp));
    }

    public void play() {
        stopCurrentlyPlayingButton();
        if (!hymn.playHymn()) {
            isPlaying=false;
            view.setImageResource(R.drawable.ic_play_arrow_white_48dp);
            return;
        }
        isPlaying=true;
        view.setImageResource(R.drawable.ic_pause_white_48dp);
        currentlyPlayingButton=this;
    }
    public void stop() {
        isPlaying=false;
        view.setImageResource(R.drawable.ic_play_arrow_white_48dp);
        if (currentlyPlayingButton == this) {
            currentlyPlayingButton = null;
        }
        hymn.stopHymn();
    }
    public static void stopCurrentlyPlayingButton() {
        if(currentlyPlayingButton!=null) {
            currentlyPlayingButton.stop();
        }
    }
}
