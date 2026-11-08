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
        return count == 0 ? activity.getString(R.string.chord_edits_none) : plural(R.plurals.chord_edits_summary, count);
    }

    public void showMenu() {
        List<ChordEdits.Sheet> edited = chordEdits.all();
        View view = LayoutInflater.from(activity).inflate(R.layout.chord_edits_dialog, null);
        ((TextView) view.findViewById(R.id.chordEditsIntro)).setText(edited.isEmpty()
                ? R.string.chord_edits_intro_empty : R.string.chord_edits_intro);
        AlertDialog dialog = dialog()
                .setTitle(R.string.chord_edits_title)
                .setView(view)
                .setPositiveButton(R.string.export_button, (d, which) -> export())
                .setNegativeButton(R.string.import_button, (d, which) -> openFileLauncher.launch(
                        new String[]{"application/json", "text/*", "application/octet-stream"}))
                .setNeutralButton(R.string.close, null)
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
                    activity.getResources().getQuantityString(R.plurals.chord_edits_bars, sheet.bars, sheet.bars,
                            date.format(new Date(sheet.updated))));
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
            message(R.string.chord_edits_none, R.string.chord_edits_none_body);
            return;
        }
        dialog()
                .setTitle(R.string.chord_edits_export_title)
                .setItems(new String[]{activity.getString(R.string.send_email_chat_drive), activity.getString(R.string.save_file_device)}, (dialog, which) -> {
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
            sendIntent.putExtra(Intent.EXTRA_SUBJECT, activity.getString(R.string.chord_edits_subject));
            sendIntent.putExtra(Intent.EXTRA_STREAM, uri);
            sendIntent.setClipData(ClipData.newRawUri(file.getName(), uri));
            sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(Intent.createChooser(sendIntent, activity.getString(R.string.chord_edits_export_title)));
        } catch (IOException e) {
            Log.e(getClass().getName(), "Could not write the chord edits file", e);
            message(R.string.export_failed, R.string.file_not_written);
        }
    }

    private void saveTo(Uri uri) {
        try {
            FavoritesBackup.writeText(activity.getContentResolver().openOutputStream(uri), chordEdits.exportJson());
            Toast.makeText(activity, R.string.chord_edits_saved, Toast.LENGTH_SHORT).show();
        } catch (IOException | RuntimeException e) {
            Log.e(getClass().getName(), "Could not save the chord edits file", e);
            message(R.string.export_failed, R.string.file_not_saved_there);
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
            finishedMessage(R.string.import_failed, R.string.file_could_not_open);
        }
    }

    private void importText(String text) {
        JSONObject sheets;
        try {
            sheets = ChordEdits.readFile(text);
        } catch (IllegalArgumentException e) {
            finishedMessage(R.string.import_failed, R.string.chord_edits_not_a_file);
            return;
        }
        List<String> ids = new ArrayList<>();
        for (Iterator<String> it = sheets.keys(); it.hasNext(); ) ids.add(it.next());
        if (ids.isEmpty()) {
            finishedMessage(R.string.nothing_to_import, R.string.chord_edits_empty_file);
            return;
        }
        String listed = android.text.TextUtils.join(activity.getString(R.string.list_separator),
                ids.subList(0, Math.min(MAX_LISTED, ids.size())));
        if (ids.size() > MAX_LISTED) listed = activity.getString(R.string.list_and_more, listed, ids.size() - MAX_LISTED);
        dialog()
                .setTitle(R.string.chord_edits_import_title)
                .setMessage(activity.getResources().getQuantityString(R.plurals.chord_edits_import_body, ids.size(),
                        ids.size(), listed))
                .setPositiveButton(R.string.import_button, (dialog, which) -> {
                    ChordEdits.ImportResult result = chordEdits.importSheets(sheets);
                    String imported = plural(R.plurals.chord_edits_imported, result.added);
                    if (result.kept > 0) imported = activity.getString(R.string.chord_edits_kept, imported, result.kept);
                    Toast.makeText(activity, imported, Toast.LENGTH_LONG).show();
                })
                .setNegativeButton(R.string.cancel, null)
                .setOnDismissListener(dialog -> onFinished.run())
                .show();
    }

    private String plural(int id, int count) {
        return activity.getResources().getQuantityString(id, count, count);
    }

    private AlertDialog.Builder dialog() {
        return new AlertDialog.Builder(activity, R.style.FavoritesDialog);
    }

    private void message(int title, int body) {
        dialog().setTitle(title).setMessage(body).setPositiveButton(R.string.ok, null).show();
    }

    private void finishedMessage(int title, int body) {
        dialog().setTitle(title).setMessage(body).setPositiveButton(R.string.ok, null)
                .setOnDismissListener(dialog -> onFinished.run()).show();
    }
}
