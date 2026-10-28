package com.lemuelinchrist.android.hymns.logbook;

import android.content.Context;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Pattern;

/**
 * The chords changed on the sheet music on this device (the sheet viewer's editor, offered on big screens), kept in one
 * file in the web app's export format, so a file exported here imports in the web app and the other way round, and
 * can be put into the sheets themselves (tools/web/README.md, "Chord edits"):
 * <pre>
 * {"format": "hymns-chord-edits", "v": 1, "sheets": {"E8": {"updated": 1792296177000,
 *   "bars": {"2": {"was": [[1, "E♭"]], "chords": [[1, "E♭"], [2.5, "A♭7"]]}}}}}
 * </pre>
 * A bar is the nth measure of the sheet's MEI file (from 1), a beat its tstamp, the chords are in the sheet's original
 * key and replace all the chords of that bar, and "was" is what the bar had. The viewer reads and writes a sheet's bars
 * through SheetMusicActivity.
 */
public class ChordEdits {

    public static final String FORMAT = "hymns-chord-edits";
    static final String FILE_NAME = "chord-edits.json";
    private static final Pattern SHEET_ID = Pattern.compile("[A-Z]{1,2}[0-9]+");
    private static final Pattern BAR = Pattern.compile("[1-9][0-9]{0,3}");
    private static final int MAX_CHORD_LENGTH = 24;
    // the viewer page writes on its own thread while Settings may be reading
    private static final Object LOCK = new Object();

    /** an edited sheet, for the list in Settings */
    public static class Sheet {
        public final String id;
        public final long updated;
        public final int bars;

        Sheet(String id, long updated, int bars) {
            this.id = id;
            this.updated = updated;
            this.bars = bars;
        }
    }

    public static class ImportResult {
        public final int added;
        public final int kept;

        ImportResult(int added, int kept) {
            this.added = added;
            this.kept = kept;
        }
    }

    private final File file;
    private final File newFile;   // written first, so a write cut short never loses the edits

    public ChordEdits(Context context) {
        file = new File(context.getFilesDir(), FILE_NAME);
        newFile = new File(context.getFilesDir(), FILE_NAME + ".new");
    }

    /** the edited bars of a sheet as JSON, "{}" when it has none */
    public String getBars(String sheetId) {
        synchronized (LOCK) {
            JSONObject sheet = read().optJSONObject(sheetId);
            JSONObject bars = sheet == null ? null : sheet.optJSONObject("bars");
            return bars == null ? "{}" : bars.toString();
        }
    }

    /** saves the edited bars of a sheet (JSON from the viewer); no bars removes the sheet. False when not saved. */
    public boolean putBars(String sheetId, String barsJson) {
        if (sheetId == null || !SHEET_ID.matcher(sheetId).matches()) return false;
        try {
            JSONObject bars = cleanBars(new JSONObject(barsJson));
            synchronized (LOCK) {
                JSONObject sheets = read();
                if (bars.length() == 0) sheets.remove(sheetId);
                else sheets.put(sheetId, new JSONObject().put("updated", System.currentTimeMillis()).put("bars", bars));
                return write(sheets);
            }
        } catch (JSONException e) {
            Log.e(getClass().getName(), "Chord edits of " + sheetId + " not saved", e);
            return false;
        }
    }

    /** the edited sheets, the latest edited first */
    public List<Sheet> all() {
        List<Sheet> list = new ArrayList<>();
        synchronized (LOCK) {
            JSONObject sheets = read();
            for (Iterator<String> ids = sheets.keys(); ids.hasNext(); ) {
                String id = ids.next();
                JSONObject sheet = sheets.optJSONObject(id);
                JSONObject bars = sheet == null ? null : sheet.optJSONObject("bars");
                if (bars != null) list.add(new Sheet(id, sheet.optLong("updated"), bars.length()));
            }
        }
        Collections.sort(list, (a, b) -> Long.compare(b.updated, a.updated));
        return list;
    }

    /** the file people export: every edited sheet */
    public String exportJson() {
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.ROOT);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        try {
            JSONObject out = new JSONObject().put("format", FORMAT).put("v", 1).put("exported", iso.format(new Date()));
            synchronized (LOCK) {
                out.put("sheets", read());
            }
            return out.toString(1);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * The sheets of an exported file, with anything that is not a chord edit left out.
     *
     * @throws IllegalArgumentException when the text is not a chord edits file
     */
    public static JSONObject readFile(String text) {
        JSONObject sheets = new JSONObject();
        try {
            JSONObject data = new JSONObject(text.trim());
            if (!FORMAT.equals(data.optString("format")) || data.optJSONObject("sheets") == null) {
                throw new IllegalArgumentException("not a chord edits file");
            }
            JSONObject in = data.getJSONObject("sheets");
            for (Iterator<String> ids = in.keys(); ids.hasNext(); ) {
                String id = ids.next();
                JSONObject sheet = in.optJSONObject(id);
                JSONObject bars = sheet == null || !SHEET_ID.matcher(id).matches() ? null : sheet.optJSONObject("bars");
                if (bars == null) continue;
                sheets.put(id, new JSONObject().put("updated", sheet.optLong("updated")).put("bars", cleanBars(bars)));
            }
        } catch (JSONException e) {
            throw new IllegalArgumentException("not a chord edits file", e);
        }
        return sheets;
    }

    /** whether the text is a chord edits file (so a file opened from another app goes to the right place) */
    public static boolean isChordEditsFile(String text) {
        try {
            readFile(text);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * Adds the sheets of a file (from {@link #readFile}). A sheet replaces this device's edits of it unless it was edited
     * later here, the same rule as the web app, so moving edits back and forth loses nothing.
     */
    public ImportResult importSheets(JSONObject sheets) {
        int added = 0, kept = 0;
        try {
            synchronized (LOCK) {
                JSONObject mine = read();
                for (Iterator<String> ids = sheets.keys(); ids.hasNext(); ) {
                    String id = ids.next();
                    JSONObject sheet = sheets.getJSONObject(id);
                    JSONObject current = mine.optJSONObject(id);
                    if (current != null && current.optLong("updated") > sheet.optLong("updated")) {
                        kept++;
                        continue;
                    }
                    if (sheet.optLong("updated") <= 0) sheet.put("updated", System.currentTimeMillis());
                    mine.put(id, sheet);
                    added++;
                }
                if (added > 0 && !write(mine)) added = 0;
            }
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
        return new ImportResult(added, kept);
    }

    // the bars as the viewer expects them: {"<bar>": {"was": [[beat, chord]], "chords": [[beat, chord]]}}
    private static JSONObject cleanBars(JSONObject bars) throws JSONException {
        JSONObject out = new JSONObject();
        for (Iterator<String> keys = bars.keys(); keys.hasNext(); ) {
            String key = keys.next();
            JSONObject bar = bars.optJSONObject(key);
            JSONArray chords = bar == null ? null : cleanChords(bar.optJSONArray("chords"));
            if (!BAR.matcher(key).matches() || chords == null) continue;
            JSONObject clean = new JSONObject();
            JSONArray was = cleanChords(bar.optJSONArray("was"));
            if (was != null) clean.put("was", was);
            out.put(key, clean.put("chords", chords));
        }
        return out;
    }

    private static JSONArray cleanChords(JSONArray chords) throws JSONException {
        if (chords == null) return null;
        JSONArray out = new JSONArray();
        for (int i = 0; i < chords.length(); i++) {
            JSONArray chord = chords.optJSONArray(i);
            if (chord == null || chord.length() < 2) continue;
            double beat = chord.optDouble(0, Double.NaN);
            Object text = chord.opt(1);
            if (Double.isNaN(beat) || beat < 0 || beat > 64 || !(text instanceof String)) continue;
            String name = ((String) text).trim();
            if (name.isEmpty() || name.length() > MAX_CHORD_LENGTH) continue;
            out.put(new JSONArray().put(beat).put(name));
        }
        return out;
    }

    private JSONObject read() {
        // no file but a new one: the app stopped between the two steps of write()
        File from = file.exists() ? file : newFile;
        if (!from.exists()) return new JSONObject();
        try (FileInputStream in = new FileInputStream(from)) {
            JSONObject sheets = new JSONObject(FavoritesBackup.readText(in)).optJSONObject("sheets");
            return sheets == null ? new JSONObject() : sheets;
        } catch (IOException | JSONException e) {
            Log.e(getClass().getName(), "Could not read the chord edits", e);
            return new JSONObject();
        }
    }

    // the whole file goes to newFile first and replaces the file once it is complete
    private boolean write(JSONObject sheets) {
        try (FileOutputStream out = new FileOutputStream(newFile)) {
            out.write(new JSONObject().put("format", FORMAT).put("v", 1).put("sheets", sheets).toString()
                    .getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (IOException | JSONException e) {
            Log.e(getClass().getName(), "Could not save the chord edits", e);
            return false;
        }
        if (newFile.renameTo(file)) return true;
        // where a rename cannot replace a file (Windows, in the unit tests)
        return file.delete() && newFile.renameTo(file);
    }
}
