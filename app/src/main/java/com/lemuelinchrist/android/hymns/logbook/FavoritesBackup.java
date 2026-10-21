package com.lemuelinchrist.android.hymns.logbook;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.content.FaveButton;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Backs up the favorites to a small text file (shared or saved) and restores them from that file or from copied text.
 * The file is readable by people: a short note and one "E1 – first line" per hymn. Restoring takes the hymn number at
 * the start of each line, so the text still works after an email or chat app has added lines of its own. The old
 * export format ("E1,FR216,NS47,") is still accepted.
 * <p>
 * Create it in the activity's onCreate (it registers the file pickers).
 */
public class FavoritesBackup {

    public static final String FILE_NAME = "hymns-favorites.txt";
    private static final String FILE_PROVIDER = "com.lemuelinchrist.hymns";
    private static final Pattern HYMN_ID = Pattern.compile("[A-Za-z]{1,3}[0-9]{1,5}[A-Za-z]?");
    private static final Pattern OLD_FORMAT_LINE = Pattern.compile("[A-Za-z0-9,;\\s]*,[A-Za-z0-9,;\\s]*");
    private static final int MAX_FILE_SIZE = 1024 * 1024;

    public interface Listener {
        // called when a restore has finished, whether or not anything was added
        void onRestoreFinished(boolean added);
    }

    private final AppCompatActivity activity;
    private final Listener listener;
    private final ActivityResultLauncher<String> saveFileLauncher;
    private final ActivityResultLauncher<String[]> openFileLauncher;
    private final ActivityResultLauncher<Intent> otherAppLauncher;
    // a file opened from another app (Gmail, Drive, Files...), which may not be a backup at all
    private Uri openedFile;

    public FavoritesBackup(AppCompatActivity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
        saveFileLauncher = activity.registerForActivityResult(new ActivityResultContracts.CreateDocument("text/plain"), uri -> {
            if (uri != null) saveTo(uri);
        });
        openFileLauncher = activity.registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
            if (uri != null) restoreFromFile(uri);
        });
        // finish only once the user has picked the other app: our permission to read the file ends with us
        otherAppLauncher = activity.registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),
                result -> listener.onRestoreFinished(false));
    }

    public void showMenu() {
        dialog()
                .setTitle("Back up & restore favorites")
                .setMessage("Back up: send your favorites to yourself (email, chat, Drive) or save them as a file.\n\n" +
                        "Restore: on your other phone, open that file with this app, or tap Restore here.\n\n" +
                        "If you set up a new phone from your Google backup, your favorites usually come along by themselves.")
                .setPositiveButton("Back up", (dialog, which) -> backUp())
                .setNegativeButton("Restore", (dialog, which) -> restore())
                .setNeutralButton("Close", null)
                .show();
    }

    public void backUp() {
        if (getFavorites().length == 0) {
            message("No favorites yet", "Tap the heart on a hymn to add it to your favorites.");
            return;
        }
        dialog()
                .setTitle("Back up favorites")
                .setItems(new String[]{"Send (email, chat, Drive…)", "Save as a file on this phone"}, (dialog, which) -> {
                    if (which == 0) share();
                    else saveFileLauncher.launch(FILE_NAME);
                })
                .show();
    }

    public void restore() {
        dialog()
                .setTitle("Restore favorites")
                .setItems(new String[]{"Open a backup file", "Paste copied text"}, (dialog, which) -> {
                    if (which == 0) openFileLauncher.launch(new String[]{"text/*", "application/octet-stream"});
                    else restoreFromClipboard();
                })
                .show();
    }

    private HymnRecord[] getFavorites() {
        return new LogBook(activity, FaveButton.FAVE_LOG_BOOK_FILE).getAllRecords();
    }

    String buildBackupText() {
        return formatBackupText(getFavorites());
    }

    // the favorites newest first, as the Back up text
    static String formatBackupText(HymnRecord[] favorites) {
        StringBuilder text = new StringBuilder();
        text.append("My favorite hymns (Hymns For Android): ").append(favorites.length)
                .append(favorites.length == 1 ? " hymn" : " hymns").append("\n\n");
        text.append("To put them back: open this file with the Hymns app,\n");
        text.append("or copy all of this text, then in the app tap Search,\n");
        text.append("then Favorites > Restore > Paste copied text.\n\n");
        for (HymnRecord record : favorites) {
            text.append(record.getHymnId());
            if (record.getFirstLine() != null) text.append(" – ").append(record.getFirstLine().trim());
            text.append("\n");
        }
        return text.toString();
    }

    private void share() {
        String text = buildBackupText();
        try {
            File file = new File(activity.getCacheDir(), FILE_NAME);
            writeText(new FileOutputStream(file), text);
            Uri uri = FileProvider.getUriForFile(activity, FILE_PROVIDER, file);

            Intent sendIntent = new Intent(Intent.ACTION_SEND);
            sendIntent.setType("text/plain");
            sendIntent.putExtra(Intent.EXTRA_SUBJECT, "My favorite hymns");
            sendIntent.putExtra(Intent.EXTRA_TEXT, text);
            sendIntent.putExtra(Intent.EXTRA_STREAM, uri);
            sendIntent.setClipData(ClipData.newRawUri(FILE_NAME, uri));
            sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(Intent.createChooser(sendIntent, "Back up favorites"));
        } catch (IOException e) {
            Log.e(getClass().getName(), "Could not write the backup file", e);
            message("Back up failed", "The backup file could not be written.");
        }
    }

    private void saveTo(Uri uri) {
        try {
            writeText(activity.getContentResolver().openOutputStream(uri), buildBackupText());
            Toast.makeText(activity, "Favorites saved", Toast.LENGTH_SHORT).show();
        } catch (IOException | RuntimeException e) {
            Log.e(getClass().getName(), "Could not save the backup file", e);
            message("Back up failed", "The file could not be saved there. Please try another place.");
        }
    }

    private void restoreFromClipboard() {
        ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData clip = clipboard == null ? null : clipboard.getPrimaryClip();
        CharSequence text = null;
        if (clip != null && clip.getItemCount() > 0) text = clip.getItemAt(0).coerceToText(activity);

        if (text == null || text.toString().trim().isEmpty()) {
            message("Nothing copied", "Copy your backup text first: open the email or message, " +
                    "long-press the text, choose Select all, then Copy. Then come back and tap Restore again.");
            return;
        }
        restoreFromText(text.toString());
    }

    /**
     * Restores from a file that another app asked this app to open. Android offers this app for every text file, so
     * when it is not a backup, the message offers to open it with another app.
     */
    public void restoreOpenedFile(Uri uri) {
        openedFile = uri;
        restoreFromFile(uri);
    }

    public void restoreFromFile(Uri uri) {
        String text;
        try {
            text = readText(activity.getContentResolver().openInputStream(uri));
        } catch (IOException | RuntimeException e) {
            Log.e(getClass().getName(), "Could not read " + uri, e);
            finishedMessage("Restore failed", "This file could not be opened.");
            return;
        }
        restoreFromText(text);
    }

    public void restoreFromText(String text) {
        List<String> candidates = findHymnIds(text);
        List<Hymn> newHymns = new ArrayList<>();
        int alreadyFaves = 0;
        int notInApp = 0;

        LogBook faveLogBook = new LogBook(activity, FaveButton.FAVE_LOG_BOOK_FILE);
        HymnsDao hymnsDao = new HymnsDao(activity);
        hymnsDao.open();
        for (String id : candidates) {
            Hymn hymn = hymnsDao.get(id);
            if (hymn == null) hymn = hymnsDao.get(id.toUpperCase());
            if (hymn == null) notInApp++;
            else if (faveLogBook.contains(hymn.getHymnId())) alreadyFaves++;
            else newHymns.add(hymn);
        }
        hymnsDao.close();

        String notInAppNote = notInApp == 0 ? "" :
                "\n\n" + hymns(notInApp) + (notInApp == 1 ? " is" : " are") + " not in this version of the app.";

        if (newHymns.isEmpty()) {
            String body = alreadyFaves > 0
                    ? "All " + hymns(alreadyFaves) + " are already in your favorites." + notInAppNote
                    : openedFile != null
                    ? "This file is not a favorites backup: it has no hymn numbers in it."
                    : "No hymn numbers were found. Please use the text or file made by Back up.";
            finishedMessage(alreadyFaves > 0 ? "Nothing to add" : "No favorites found", body);
            return;
        }

        String body = "Add " + hymns(newHymns.size()) + " to your favorites?";
        if (alreadyFaves > 0) body += "\n\n" + hymns(alreadyFaves) + (alreadyFaves == 1 ? " is" : " are") + " already there.";
        body += notInAppNote;

        boolean[] added = {false};
        dialog()
                .setTitle("Restore favorites")
                .setMessage(body)
                .setPositiveButton("Add", (dialog, which) -> {
                    int count = faveLogBook.addAll(newHymns);
                    added[0] = count > 0;
                    Toast.makeText(activity, "Added " + hymns(count) + " to your favorites", Toast.LENGTH_LONG).show();
                })
                .setNegativeButton("Cancel", null)
                .setOnDismissListener(dialog -> listener.onRestoreFinished(added[0]))
                .show();
    }

    // the hymn numbers in the text, in order and without repeats: the first word of each line,
    // or every item of a comma-separated line (the old export format)
    static List<String> findHymnIds(String text) {
        Set<String> ids = new LinkedHashSet<>();
        for (String line : text.split("\\r?\\n")) {
            line = line.replaceFirst("^[^A-Za-z0-9]+", "");
            String[] words = OLD_FORMAT_LINE.matcher(line).matches()
                    ? line.split("[,;\\s]+")
                    : new String[]{line.split("[^A-Za-z0-9]", 2)[0]};
            for (String word : words) {
                if (HYMN_ID.matcher(word).matches()) ids.add(word);
            }
        }
        return new ArrayList<>(ids);
    }

    private static String hymns(int count) {
        return count + (count == 1 ? " hymn" : " hymns");
    }

    private AlertDialog.Builder dialog() {
        return new AlertDialog.Builder(activity, R.style.FavoritesDialog);
    }

    private void message(String title, String body) {
        dialog().setTitle(title).setMessage(body).setPositiveButton("OK", null).show();
    }

    private void finishedMessage(String title, String body) {
        boolean[] handedOver = {false};
        AlertDialog.Builder builder = dialog().setTitle(title).setMessage(body).setPositiveButton("OK", null)
                .setOnDismissListener(dialog -> {
                    if (!handedOver[0]) listener.onRestoreFinished(false);
                });
        if (openedFile != null) {
            builder.setNeutralButton("Open with another app", (dialog, which) -> handedOver[0] = openWithAnotherApp());
        }
        builder.show();
    }

    private boolean openWithAnotherApp() {
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(openedFile, activity.getContentResolver().getType(openedFile));
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(view, null);
        chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS,
                new ComponentName[]{new ComponentName(activity, RestoreFavoritesActivity.class)});
        try {
            otherAppLauncher.launch(chooser);
            return true;
        } catch (RuntimeException e) {
            Log.e(getClass().getName(), "Could not open " + openedFile + " with another app", e);
            Toast.makeText(activity, "No other app can open this file", Toast.LENGTH_LONG).show();
            return false;
        }
    }

    private static void writeText(OutputStream out, String text) throws IOException {
        if (out == null) throw new IOException("no output stream");
        try (Writer writer = new OutputStreamWriter(out, StandardCharsets.UTF_8)) {
            writer.write(text);
        }
    }

    private static String readText(InputStream in) throws IOException {
        if (in == null) throw new IOException("no input stream");
        try (Reader reader = new InputStreamReader(in, StandardCharsets.UTF_8)) {
            StringBuilder text = new StringBuilder();
            char[] buffer = new char[8192];
            int read;
            while ((read = reader.read(buffer)) != -1 && text.length() < MAX_FILE_SIZE) {
                text.append(buffer, 0, read);
            }
            return text.toString();
        }
    }
}
