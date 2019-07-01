package com.lemuelinchrist.android.hymns;

import android.app.Dialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.os.Bundle;
import android.support.v4.app.DialogFragment;
import android.support.v7.app.AlertDialog;
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
                        // User cancelled the dialog
                    }
                })
                .setNeutralButton("Cancel", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {

                    }
                });
        // Create the AlertDialog object and return it
        return builder.create();
    }
}