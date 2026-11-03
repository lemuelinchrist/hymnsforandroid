package com.lemuelinchrist.android.hymns.logbook;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.text.format.DateFormat;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.content.sheetmusic.SheetMusicActivity;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

/**
 * Settings > Chord Edits: lists the sheets whose chords were changed on this device, exports them as a file (sent or
 * saved) and imports such a file, from here or tapped in another app (RestoreFavoritesActivity). The file is the web
 * app's, so it also moves edits between the two and is what gets sent in so the chords can go into the sheets.
 * <p>
 * Create it in the activity's onCreate (it registers the file pickers).
 */
public class ChordEditsBackup {

    private static final String FILE_PROVIDER = "com.lemuelinchrist.hymns";
    private static final int MAX_LISTED = 10;

    private final AppCompatActivity activity;
    private final ChordEdits chordEdits;
    private final Runnable onFinished;
    private final ActivityResultLauncher<String> saveFileLauncher;
    private final ActivityResultLauncher<String[]> openFileLauncher;

    /** onFinished: called when an import has finished, whether or not anything was imported */
    public ChordEditsBackup(AppCompatActivity activity, Runnable onFinished) {
        this.activity = activity;
        this.onFinished = onFinished;
        chordEdits = new ChordEdits(activity);
        saveFileLauncher = activity.registerForActivityResult(new ActivityResultContracts.CreateDocument("application/json"), uri -> {
            if (uri != null) saveTo(uri);
        });
        openFileLauncher = activity.registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
            if (uri != null) importFromFile(uri);
        });
    }

    /** the summary under "Chord Edits" in Settings */
    public String summary() {
        int count = chordEdits.all().size();
        return count == 0 ? "No chord edits yet" : sheets(count) + " with changed chords";
    }

    public void showMenu() {
        List<ChordEdits.Sheet> edited = chordEdits.all();
        View view = LayoutInflater.from(activity).inflate(R.layout.chord_edits_dialog, null);
        ((TextView) view.findViewById(R.id.chordEditsIntro)).setText(edited.isEmpty()
                ? "Chords you change on the piano sheet music (Edit chords, on tablets and unfolded phones) are kept on " +
                "this device. Import brings in chord edits exported from another device or from the web app."
                : "Chords you changed on the sheet music are kept on this device. Export them to keep a copy, to move " +
                "them to another device (or the web app), or to send them in so they can go into the sheets for everyone.");
        AlertDialog dialog = dialog()
                .setTitle("Chord edits")
                .setView(view)
                .setPositiveButton("Export", (d, which) -> export())
                .setNegativeButton("Import", (d, which) -> openFileLauncher.launch(
                        new String[]{"application/json", "text/*", "application/octet-stream"}))
                .setNeutralButton("Close", null)
                .create();

        ViewGroup rows = view.findViewById(R.id.chordEditsSheets);
        java.text.DateFormat date = DateFormat.getMediumDateFormat(activity);
        HymnsDao hymnsDao = new HymnsDao(activity);
        hymnsDao.open();
        for (ChordEdits.Sheet sheet : edited) {
            View row = LayoutInflater.from(activity).inflate(R.layout.chord_edits_row, rows, false);
            Hymn hymn = hymnsDao.get(sheet.id);
            String firstLine = hymn == null || hymn.getFirstStanzaLine() == null ? "" : " – " + hymn.getFirstStanzaLine().trim().replaceAll("[,;:]+$", "");
            ((TextView) row.findViewById(R.id.chordEditsHymn)).setText(sheet.id + firstLine);
            ((TextView) row.findViewById(R.id.chordEditsDetail)).setText(
                    sheet.bars + (sheet.bars == 1 ? " bar" : " bars") + " · " + date.format(new Date(sheet.updated)));
            row.setOnClickListener(v -> {
                dialog.dismiss();
                Intent intent = new Intent(activity, SheetMusicActivity.class);
                intent.putExtra("selectedHymnId", sheet.id);
                activity.startActivity(intent);
            });
            rows.addView(row);
        }
        hymnsDao.close();
        dialog.show();
    }

    public void export() {
        if (chordEdits.all().isEmpty()) {
            message("No chord edits yet", "Open a hymn's sheet music on a tablet or an unfolded phone and tap Edit chords.");
            return;
        }
        dialog()
                .setTitle("Export chord edits")
                .setItems(new String[]{"Send (email, chat, Drive…)", "Save as a file on this device"}, (dialog, which) -> {
                    if (which == 0) share();
                    else saveFileLauncher.launch(fileName());
                })
                .show();
    }

    private static String fileName() {
        return "hymns-chord-edits-" + new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date()) + ".json";
    }

    private void share() {
        try {
            File file = new File(activity.getCacheDir(), fileName());
            FavoritesBackup.writeText(new FileOutputStream(file), chordEdits.exportJson());
            Uri uri = FileProvider.getUriForFile(activity, FILE_PROVIDER, file);

            Intent sendIntent = new Intent(Intent.ACTION_SEND);
            sendIntent.setType("application/json");
            sendIntent.putExtra(Intent.EXTRA_SUBJECT, "Chord edits (Hymns)");
            sendIntent.putExtra(Intent.EXTRA_STREAM, uri);
            sendIntent.setClipData(ClipData.newRawUri(file.getName(), uri));
            sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(Intent.createChooser(sendIntent, "Export chord edits"));
        } catch (IOException e) {
            Log.e(getClass().getName(), "Could not write the chord edits file", e);
            message("Export failed", "The file could not be written.");
        }
    }

    private void saveTo(Uri uri) {
        try {
            FavoritesBackup.writeText(activity.getContentResolver().openOutputStream(uri), chordEdits.exportJson());
            Toast.makeText(activity, "Chord edits saved", Toast.LENGTH_SHORT).show();
        } catch (IOException | RuntimeException e) {
            Log.e(getClass().getName(), "Could not save the chord edits file", e);
            message("Export failed", "The file could not be saved there. Please try another place.");
        }
    }

    /**
     * Imports a file another app asked this app to open, if it is a chord edits file.
     *
     * @return false when it is not one (or cannot be read), so it can be tried as a favorites backup
     */
    public boolean importOpenedFile(Uri uri) {
        String text;
        try {
            text = FavoritesBackup.readText(activity.getContentResolver().openInputStream(uri));
        } catch (IOException | RuntimeException e) {
            return false;
        }
        if (!ChordEdits.isChordEditsFile(text)) return false;
        importText(text);
        return true;
    }

    private void importFromFile(Uri uri) {
        try {
            importText(FavoritesBackup.readText(activity.getContentResolver().openInputStream(uri)));
        } catch (IOException | RuntimeException e) {
            Log.e(getClass().getName(), "Could not read " + uri, e);
            finishedMessage("Import failed", "This file could not be opened.");
        }
    }

    private void importText(String text) {
        JSONObject sheets;
        try {
            sheets = ChordEdits.readFile(text);
        } catch (IllegalArgumentException e) {
            finishedMessage("Import failed", "This is not a chord edits file.");
            return;
        }
        List<String> ids = new ArrayList<>();
        for (Iterator<String> it = sheets.keys(); it.hasNext(); ) ids.add(it.next());
        if (ids.isEmpty()) {
            finishedMessage("Nothing to import", "This file has no chord edits in it.");
            return;
        }
        String listed = android.text.TextUtils.join(", ", ids.subList(0, Math.min(MAX_LISTED, ids.size())))
                + (ids.size() > MAX_LISTED ? " and " + (ids.size() - MAX_LISTED) + " more" : "");
        dialog()
                .setTitle("Import chord edits?")
                .setMessage("This file has changed chords for " + sheets(ids.size()) + ": " + listed + ".\n\n" +
                        "A sheet you edited later on this device keeps your version.")
                .setPositiveButton("Import", (dialog, which) -> {
                    ChordEdits.ImportResult result = chordEdits.importSheets(sheets);
                    Toast.makeText(activity, sheets(result.added) + " imported" +
                            (result.kept > 0 ? ", " + result.kept + " kept (edited later on this device)" : ""), Toast.LENGTH_LONG).show();
                })
                .setNegativeButton("Cancel", null)
                .setOnDismissListener(dialog -> onFinished.run())
                .show();
    }

    private static String sheets(int count) {
        return count + (count == 1 ? " sheet" : " sheets");
    }

    private AlertDialog.Builder dialog() {
        return new AlertDialog.Builder(activity, R.style.FavoritesDialog);
    }

    private void message(String title, String body) {
        dialog().setTitle(title).setMessage(body).setPositiveButton("OK", null).show();
    }

    private void finishedMessage(String title, String body) {
        dialog().setTitle(title).setMessage(body).setPositiveButton("OK", null)
                .setOnDismissListener(dialog -> onFinished.run()).show();
    }
}
