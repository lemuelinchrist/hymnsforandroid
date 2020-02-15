package com.lemuelinchrist.android.hymns;

import android.app.Dialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.DialogFragment;

import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.logbook.LogBook;

import static com.lemuelinchrist.android.hymns.LyricContainer.FAVE_LOG_BOOK_FILE;

/**
 * @author Lemuel Cantos
 * @since 1/7/2019
 */
public class FavoriteSettingsDialog extends DialogFragment {

    private LogBook faveLogBook;

    @Override
    public Dialog onCreateDialog(Bundle savedInstanceState) {
        faveLogBook = new LogBook(getContext(), FAVE_LOG_BOOK_FILE);

        // Use the Builder class for convenient dialog construction
        AlertDialog.Builder builder = new AlertDialog.Builder(getActivity());
        builder.setTitle("Import/Export Favorites");
        builder.setMessage("Use this feature to migrate your favorites to another device. " +
                "First click on Export to save your list to a notepad or email. " +
                "Then from your other device, copy your list to your phone's clipboard then click Import.")
                .setPositiveButton("export", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface dialog, int id) {
                        String faveList = faveLogBook.exportHymnList();
                        Intent sendIntent = new Intent();
                        sendIntent.setAction(Intent.ACTION_SEND);
                        sendIntent.putExtra(Intent.EXTRA_TEXT, faveList);
                        sendIntent.setType("text/plain");
                        startActivity(sendIntent);
                    }
                })
                .setNegativeButton("Import", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface dialog, int id) {
                        ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                        ClipData clip = clipboard.getPrimaryClip();
                        String importedList = null;
                        if(clip.getItemCount()!=0) {
                            importedList = clip.getItemAt(0).getText().toString();
                        }
                        if(importedList==null || !startImport(importedList)) {
                            Toast.makeText(getContext(), "Sorry! Text in clipboard not Valid. Please copy the list to your clipboard first.", Toast.LENGTH_LONG).show();
                        } else {
                            Toast.makeText(getContext(), "Import Successful!", Toast.LENGTH_SHORT).show();
                        }
                    }
                })
                .setNeutralButton("Cancel", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        // Do nothing
                    }
                });
        // Create the AlertDialog object and return it
        return builder.create();
    }

    private boolean startImport(String importedList) {
        boolean isValid = false;
        HymnsDao hymnsDao = new HymnsDao(getContext());
        hymnsDao.open();
        for(String hymnId:importedList.split(",")) {
            Hymn hymn = hymnsDao.get(hymnId.toUpperCase().trim());
            if(hymn!=null) {
                isValid=true;
                faveLogBook.log(hymn);
            }
        }
        hymnsDao.close();
        return isValid;
    }
}