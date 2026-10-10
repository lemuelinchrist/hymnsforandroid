package com.lemuelinchrist.android.hymns.content;

import android.app.Dialog;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageButton;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.DialogFragment;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentActivity;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.HymnSwitcher;
import com.lemuelinchrist.android.hymns.HymnsActivity;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;

import java.util.ArrayList;
import java.util.List;

/**
 * @author Lemuel Cantos
 * @since 10/10/2020
 */
public class SimilarTuneButton extends ContentComponent<ImageButton> {
    private static HymnsDao hymnsDao;
    private List<Hymn> relatedHymns;
    private ArrayList<String> descriptions=new ArrayList<>();

    public SimilarTuneButton(Hymn hymn, Fragment parentFragment, ImageButton imageButton) {
        super(hymn, parentFragment, imageButton);

        if (hymnsDao == null) {
            hymnsDao = new HymnsDao(context);
        }
        SharedPreferences sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context);

        if(!sharedPreferences.getBoolean("similarTune",false) || hymn.getTune()==null || hymn.getTune().isEmpty()) {
            imageButton.setVisibility(View.GONE);
        }
        imageButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                logToHistory();
                hymnsDao.open();
                relatedHymns = hymnsDao.getHymnsWithSimilarTune(SimilarTuneButton.this.hymn);
                hymnsDao.close();
                if(relatedHymns.size()>1) {
                    descriptions = new ArrayList<>();
                    ArrayList<String> hymnIds = new ArrayList<>();
                    for (Hymn relatedHymn : relatedHymns) {
                        descriptions.add(relatedHymn.getHymnId() + " - " + relatedHymn.getFirstStanzaLine());
                        hymnIds.add(relatedHymn.getHymnId());
                    }

                    DialogFragment tuneDialog = ChooseSimilarHymnDialogFragment.newInstance(descriptions, hymnIds);
                    tuneDialog.show(((FragmentActivity) context).getSupportFragmentManager(), "Same Tune");
                } else {
                    Toast.makeText(context, "Sorry! No Hymn with similar tune available", Toast.LENGTH_SHORT).show();

                }
            }
        });
    }


    // Android recreates a shown dialog with the empty constructor (e.g. on a dark mode switch), so its data
    // must be in the arguments, not in constructor parameters.
    public static class ChooseSimilarHymnDialogFragment extends DialogFragment {
        private static final String DESCRIPTIONS = "descriptions";
        private static final String HYMN_IDS = "hymnIds";

        public static ChooseSimilarHymnDialogFragment newInstance(ArrayList<String> descriptions, ArrayList<String> hymnIds) {
            ChooseSimilarHymnDialogFragment dialog = new ChooseSimilarHymnDialogFragment();
            Bundle args = new Bundle();
            args.putStringArrayList(DESCRIPTIONS, descriptions);
            args.putStringArrayList(HYMN_IDS, hymnIds);
            dialog.setArguments(args);
            return dialog;
        }

        @Override
        public Dialog onCreateDialog(Bundle savedInstanceState) {
            final List<String> descriptions = requireArguments().getStringArrayList(DESCRIPTIONS);
            final List<String> hymnIds = requireArguments().getStringArrayList(HYMN_IDS);
            AlertDialog.Builder builder = new AlertDialog.Builder(getActivity());
            builder.setTitle("Go to hymn with similar tune");
            builder.setItems(descriptions.toArray(new String[descriptions.size()]),new DialogInterface.OnClickListener() {
                public void onClick(DialogInterface dialog, int which) {
                    HymnSwitcher hymnSwitcher = HymnsActivity.getHymnSwitcher();
                    if (hymnSwitcher != null) hymnSwitcher.switchToHymn(hymnIds.get(which));
                }
            });

            return builder.create();
        }
    }
}
