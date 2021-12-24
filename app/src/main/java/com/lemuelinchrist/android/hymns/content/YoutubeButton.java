package com.lemuelinchrist.android.hymns.content;

import android.app.Dialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageButton;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.DialogFragment;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentActivity;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;

import java.util.ArrayList;

/**
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public class YoutubeButton extends ContentComponent<ImageButton> {

    private static HymnsDao hymnsDao;
    private final String youtubePreference;
    private ArrayList<String> links= new ArrayList<>();
    private ArrayList<String> comments= new ArrayList<>();

    public YoutubeButton(final Hymn hymn, final Fragment parentFragment, ImageButton imageButton) {
        super(hymn, parentFragment, imageButton);

        if (hymnsDao == null) {
            hymnsDao = new HymnsDao(context);
        }

        if(hymn.getTune()!=null && !hymn.getTune().isEmpty()) {
            hymnsDao.open();

            // Prepare Links
            ArrayList<String> youtubeLinksFromHymnNo = hymnsDao.getYoutubeLinksFromHymnNo(hymn.getHymnId());
            if(youtubeLinksFromHymnNo.size()==0) {
                // maybe its parent has links
                youtubeLinksFromHymnNo = hymnsDao.getYoutubeLinksFromHymnNo(hymn.getParentHymn());
            }
            for(String link: youtubeLinksFromHymnNo) {
                links.add("https://www.youtube.com/embed/"+ link.split("\\|")[0].trim());
                comments.add(link.split("\\|")[1].trim());
            }

            hymnsDao.close();
        }

        SharedPreferences sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context);

        youtubePreference = sharedPreferences.getString("youtubeButton", "disabled");
        if(youtubePreference.equals("disabled") ||
                (youtubePreference.equals("piano") && links.size()==0)
        ) {
            imageButton.setVisibility(View.GONE);
        }

        imageButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                logToHistory();
                switch (youtubePreference) {
                    case "piano":
                        if(links.size()>1) {
                            DialogFragment tuneDialog = new ChooseTuneDialogFragment(comments, YoutubeButton.this);
                            tuneDialog.show(((FragmentActivity)context).getSupportFragmentManager(),"YouTube");
                        } else if (links.size()==1) {
                            launchYouTube(0);
                        }
                        break;
                    case "search":
                        YouTubeSearchLauncher youTubeSearchLauncher = new YouTubeSearchLauncher(context);
                        youTubeSearchLauncher.launch(hymn);
                        break;

                }

            }
        });
    }

    public void launchYouTube(int whichTune) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(links.get(whichTune)));
        context.startActivity(intent);
    }

    public static class ChooseTuneDialogFragment extends DialogFragment {
        private ArrayList<String> comments;
        private YoutubeButton listener;

        public ChooseTuneDialogFragment(ArrayList comments, YoutubeButton listener) {
            this.comments=comments;
            this.listener=listener;
        }
        @Override
        public Dialog onCreateDialog(Bundle savedInstanceState) {
            AlertDialog.Builder builder = new AlertDialog.Builder(getActivity());
            builder.setTitle("Choose tune to play");
            builder.setItems(comments.toArray(new String[comments.size()]),new DialogInterface.OnClickListener() {
                public void onClick(DialogInterface dialog, int which) {
                    listener.launchYouTube(which);
                }
            });

            return builder.create();
        }
    }
}
