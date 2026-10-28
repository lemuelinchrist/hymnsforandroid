package com.lemuelinchrist.android.hymns.logbook;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.List;

import static org.junit.Assert.*;

// Robolectric gives ChordEdits a real Context, so it reads and writes its file as in the app
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class ChordEditsTest {

    private static final String E8_BARS = "{\"2\":{\"was\":[[1,\"E♭\"]],\"chords\":[[1,\"E♭\"],[2.5,\"A♭7\"]]}}";
    private ChordEdits edits;

    @Before
    public void setUp() {
        Context context = ApplicationProvider.getApplicationContext();
        context.deleteFile(ChordEdits.FILE_NAME);
        edits = new ChordEdits(context);
    }

    private static String file(String sheets) {
        return "{\"format\":\"hymns-chord-edits\",\"v\":1,\"exported\":\"2026-10-20T12:00:00Z\",\"sheets\":" + sheets + "}";
    }

    @Test
    public void keepsTheBarsOfASheet() throws Exception {
        assertEquals("{}", edits.getBars("E8"));
        assertTrue(edits.putBars("E8", E8_BARS));
        JSONObject bar = new JSONObject(edits.getBars("E8")).getJSONObject("2");
        assertEquals(2.5, bar.getJSONArray("chords").getJSONArray(1).getDouble(0), 1e-9);
        assertEquals("A♭7", bar.getJSONArray("chords").getJSONArray(1).getString(1));
        assertEquals("E♭", bar.getJSONArray("was").getJSONArray(0).getString(1));
        assertEquals(1, edits.all().size());
    }

    @Test
    public void noBarsRemovesTheSheet() {
        edits.putBars("E8", E8_BARS);
        assertTrue(edits.putBars("E8", "{}"));
        assertEquals("{}", edits.getBars("E8"));
        assertTrue(edits.all().isEmpty());
    }

    @Test
    public void refusesWhatIsNotAChordEdit() throws Exception {
        assertFalse(edits.putBars("../E8", E8_BARS));
        assertFalse(edits.putBars("E8", "not json"));
        // a bar that is not a number, a chord that is not [beat, name]: left out, the rest kept
        edits.putBars("E8", "{\"x\":{\"chords\":[[1,\"C\"]]},\"3\":{\"chords\":[[1,\"C\"],[\"a\",\"D\"],[2],[3,7]]}}");
        JSONObject bars = new JSONObject(edits.getBars("E8"));
        assertFalse(bars.has("x"));
        assertEquals(1, bars.getJSONObject("3").getJSONArray("chords").length());
    }

    @Test
    public void exportsTheWebAppsFormat() throws Exception {
        edits.putBars("E8", E8_BARS);
        JSONObject out = new JSONObject(edits.exportJson());
        assertEquals("hymns-chord-edits", out.getString("format"));
        assertEquals(1, out.getInt("v"));
        assertTrue(out.getString("exported").matches("\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ"));
        assertTrue(out.getJSONObject("sheets").getJSONObject("E8").getLong("updated") > 0);
        // and reads it back
        assertEquals(1, ChordEdits.readFile(out.toString()).length());
    }

    @Test
    public void tellsAChordEditsFileFromOtherFiles() {
        assertTrue(ChordEdits.isChordEditsFile(file("{}")));
        assertFalse(ChordEdits.isChordEditsFile("E1 – Glory be to God the Father"));
        assertFalse(ChordEdits.isChordEditsFile("{\"format\":\"something else\",\"sheets\":{}}"));
    }

    @Test
    public void importKeepsASheetEditedLaterOnThisDevice() throws Exception {
        edits.putBars("E8", E8_BARS);   // edited now
        JSONObject sheets = ChordEdits.readFile(file("{" +
                "\"E8\":{\"updated\":1000,\"bars\":{\"5\":{\"chords\":[[1,\"G\"]]}}}," +
                "\"C215\":{\"updated\":1000,\"bars\":{\"1\":{\"chords\":[[1,\"D\"]]}}}," +
                "\"bad id\":{\"updated\":1000,\"bars\":{\"1\":{\"chords\":[[1,\"D\"]]}}}}"));
        ChordEdits.ImportResult result = edits.importSheets(sheets);
        assertEquals(1, result.added);
        assertEquals(1, result.kept);
        assertTrue(new JSONObject(edits.getBars("E8")).has("2"));
        assertTrue(new JSONObject(edits.getBars("C215")).has("1"));
    }

    @Test
    public void importReplacesAnOlderEdit() throws Exception {
        edits.putBars("E8", E8_BARS);
        long later = System.currentTimeMillis() + 60_000;
        ChordEdits.ImportResult result = edits.importSheets(ChordEdits.readFile(
                file("{\"E8\":{\"updated\":" + later + ",\"bars\":{\"5\":{\"chords\":[[1,\"G\"]]}}}}")));
        assertEquals(1, result.added);
        JSONObject bars = new JSONObject(edits.getBars("E8"));
        assertFalse(bars.has("2"));
        assertTrue(bars.has("5"));
    }

    @Test
    public void listsTheLatestEditedFirst() {
        edits.importSheets(ChordEdits.readFile(file("{" +
                "\"E1\":{\"updated\":1000,\"bars\":{\"1\":{\"chords\":[[1,\"C\"]]}}}," +
                "\"E2\":{\"updated\":3000,\"bars\":{\"1\":{\"chords\":[[1,\"C\"]],\"was\":[]},\"2\":{\"chords\":[]}}}}")));
        List<ChordEdits.Sheet> all = edits.all();
        assertEquals("E2", all.get(0).id);
        assertEquals(2, all.get(0).bars);
        assertEquals("E1", all.get(1).id);
    }
}
