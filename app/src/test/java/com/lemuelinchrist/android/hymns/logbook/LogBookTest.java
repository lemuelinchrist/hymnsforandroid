package com.lemuelinchrist.android.hymns.logbook;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.*;

// Robolectric gives LogBook a real Context, so it reads and writes its file as in the app
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class LogBookTest {

    private static final String FILE = "testLogBook";
    private Context context;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        context.deleteFile(FILE);
    }

    private Hymn hymn(String id) {
        Hymn hymn = new Hymn(context);
        hymn.setHymnId(id);
        hymn.setGroup(id.replaceAll("[0-9]", ""));
        hymn.setFirstStanzaLine("first line of " + id);
        return hymn;
    }

    private static List<String> ids(HymnRecord[] records) {
        List<String> ids = new ArrayList<>();
        for (HymnRecord record : records) ids.add(record.getHymnId());
        return ids;
    }

    private List<String> savedIds() {
        return ids(new LogBook(context, FILE).getAllRecords());
    }

    @Test
    public void startsEmptyWithoutAFile() {
        assertEquals(0, new LogBook(context, FILE).getAllRecords().length);
    }

    @Test
    public void logIsSavedNewestFirst() throws InterruptedException {
        LogBook logBook = new LogBook(context, FILE);
        logBook.log(hymn("E1"));
        Thread.sleep(2);
        logBook.log(hymn("C215"));

        assertEquals(Arrays.asList("C215", "E1"), savedIds());
        HymnRecord record = new LogBook(context, FILE).getAllRecords()[1];
        assertEquals("E", record.getHymnGroup());
        assertEquals("first line of E1", record.getFirstLine());
    }

    @Test
    public void loggingAgainMovesTheHymnToTheTop() throws InterruptedException {
        LogBook logBook = new LogBook(context, FILE);
        logBook.log(hymn("E1"));
        Thread.sleep(2);
        logBook.log(hymn("E2"));
        Thread.sleep(2);
        logBook.log(hymn("E1"));

        assertEquals(Arrays.asList("E1", "E2"), savedIds());
    }

    @Test
    public void usesTheChorusLineWhenThereIsNoStanza() {
        Hymn hymn = hymn("NS1");
        hymn.setFirstStanzaLine("");
        hymn.setFirstChorusLine("chorus line");
        new LogBook(context, FILE).log(hymn);

        assertEquals("chorus line", new LogBook(context, FILE).getAllRecords()[0].getFirstLine());
    }

    @Test
    public void aChangeKeepsWhatAnotherLogBookSaved() {
        // two hymn pages, each with its own LogBook on the same file
        LogBook page1 = new LogBook(context, FILE);
        LogBook page2 = new LogBook(context, FILE);
        page1.log(hymn("E1"));
        page2.log(hymn("E2"));

        assertTrue(savedIds().containsAll(Arrays.asList("E1", "E2")));
    }

    @Test
    public void removeAndSave() {
        LogBook logBook = new LogBook(context, FILE);
        logBook.log(hymn("E1"));
        logBook.log(hymn("E2"));
        logBook.log(hymn("E3"));

        logBook.removeAndSave(hymn("E1"));
        logBook.removeAndSave("E2");

        assertEquals(Arrays.asList("E3"), savedIds());
        assertFalse(new LogBook(context, FILE).contains("E1"));
        assertTrue(new LogBook(context, FILE).contains("E3"));
    }

    @Test
    public void addAllPutsNewHymnsOnTopInTheirOrderAndSkipsTheOnesAlreadyThere() {
        LogBook logBook = new LogBook(context, FILE);
        logBook.log(hymn("E1"));

        int added = logBook.addAll(Arrays.asList(hymn("NS47"), hymn("E1"), hymn("C100"), hymn("FY18")));

        assertEquals(3, added);
        assertEquals(Arrays.asList("NS47", "C100", "FY18", "E1"), savedIds());
        assertEquals(0, logBook.addAll(Arrays.asList(hymn("E1"), hymn("C100"))));
    }

    @Test
    public void historyListStopsAt100ButAllRecordsDoesNot() {
        List<Hymn> hymns = new ArrayList<>();
        for (int no = 1; no <= 150; no++) hymns.add(hymn("E" + no));
        LogBook logBook = new LogBook(context, FILE);
        logBook.addAll(hymns);

        assertEquals(100, logBook.getOrderedRecordList().length);
        assertEquals("E1", logBook.getOrderedRecordList()[0].getHymnId());
        assertEquals(150, logBook.getAllRecords().length);
    }

    @Test
    public void anUnreadableFileStartsAnEmptyLogBook() throws Exception {
        try (java.io.FileOutputStream out = context.openFileOutput(FILE, Context.MODE_PRIVATE)) {
            out.write("not a log book".getBytes());
        }
        LogBook logBook = new LogBook(context, FILE);
        assertEquals(0, logBook.getAllRecords().length);

        logBook.log(hymn("E1"));
        assertEquals(Arrays.asList("E1"), savedIds());
    }
}
