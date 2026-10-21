package com.lemuelinchrist.android.hymns.logbook;

import android.content.Context;
import android.util.Log;
import com.lemuelinchrist.android.hymns.content.ContentArea;
import com.lemuelinchrist.android.hymns.content.FaveButton;
import com.lemuelinchrist.android.hymns.entities.Hymn;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InvalidClassException;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * A list of hymns with the time each was logged, saved in a private file. The app keeps two: History
 * ({@link ContentArea#HISTORY_LOGBOOK_FILE}) and Favorites ({@link FaveButton#FAVE_LOG_BOOK_FILE}).
 * A hymn is in the list at most once ({@link HymnRecord}s are equal by hymn ID); lists come out newest first.
 * <p>
 * Many LogBooks can be open on the same file at once (one per hymn page, the search tabs...), so every change
 * reloads the file before saving.
 * <p>
 * Created by lemuelcantos on 7/12/14.
 */
public class LogBook {

    private final Context context;
    private final String filename;
    private Set<HymnRecord> logBook = new HashSet<HymnRecord>();


    public LogBook(Context context, String filename) {
        this.context = context;
        this.filename = filename;
        load();
    }

    // get logbook from saved file. Called again before every change, since other LogBook instances
    // of the same file (e.g. on other hymn pages) may have saved since this one was loaded.
    private void load() {
        try {
            logBook = (Set<HymnRecord>)InternalStorage.readObject(this.context, filename);
        } catch (FileNotFoundException e) {
            Log.i(LogBook.class.getName(),"No logbook file found. Must be first time use. Creating one.");
            logBook = new HashSet<>();
        } catch(InvalidClassException e) {
            Log.e(LogBook.class.getName(),"Incompatible class! creating new record \n " + e);
            logBook = new HashSet<>();
        } catch (Exception e) {
            Log.e(LogBook.class.getName(),"Error reading history log book! \n " + e);
            logBook = new HashSet<>();
        }
    }

    /** Adds the hymn with the current time and saves. A hymn already in the log book moves to the top. */
    public void log(Hymn hymn) {
        load();

        // Remove existing record in the log if any (exiting record means record with the same hymnId)
        HymnRecord record = remove(hymn);

        // Add the new record. if there was an existing one, it is removed in the previous line and replace with one having the current time.
        logBook.add(record);
        Log.d(this.getClass().getName(),"hymn logged: " +hymn.getHymnId());

        // persist logBook
        try {
            InternalStorage.writeObject(context,filename,logBook);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    /** Newest first, at most 100 (History). */
    public HymnRecord[] getOrderedRecordList() {
        HymnRecord[] hymnRecords = logBook.toArray(new HymnRecord[0]);
        Arrays.sort(hymnRecords);

        if (hymnRecords.length>101) {
            return Arrays.copyOfRange(hymnRecords, 0, 100);
        } else {
            return hymnRecords;
        }
    }

    /** Newest first, all of them (Favorites). */
    public HymnRecord[] getAllRecords() {
        HymnRecord[] hymnRecords = logBook.toArray(new HymnRecord[0]);
        Arrays.sort(hymnRecords);
        return hymnRecords;
    }

    /**
     * Adds the hymns not in the log book yet, on top and in the list's order (each gets a time 1 ms older than the
     * one before). Used to restore favorites. Returns how many were added.
     */
    public int addAll(List<Hymn> hymnsNewestFirst) {
        load();
        // start high enough that even the last one is newer than every record already here
        long top = System.currentTimeMillis();
        for (HymnRecord record : logBook) {
            top = Math.max(top, record.getRecordDate().getTime() + hymnsNewestFirst.size());
        }
        int added = 0;
        for (Hymn hymn : hymnsNewestFirst) {
            HymnRecord record = newRecord(hymn, new Date(top - added));
            if (logBook.contains(record)) continue;
            logBook.add(record);
            added++;
        }
        try {
            InternalStorage.writeObject(context,filename,logBook);
        } catch (IOException e) {
            e.printStackTrace();
        }
        Log.d(this.getClass().getName(),"hymns added: " + added);
        return added;
    }

    // does not reload the file, so changes saved by another LogBook since this one was loaded are not seen
    public boolean contains(String hymnId) {
        HymnRecord record = new HymnRecord(hymnId,null,null,null);
        return logBook.contains(record);
    }

    public void removeAndSave(Hymn hymn) {
        load();
        HymnRecord record = remove(hymn);
        // persist logBook
        try {
            InternalStorage.writeObject(context,filename,logBook);
        } catch (IOException e) {
            e.printStackTrace();
        }
        Log.d(this.getClass().getName(),"hymn removed: " +hymn.getHymnId());
    }

    public void removeAndSave(String hymnId) {
        load();
        logBook.remove(new HymnRecord(hymnId,null,null,null));
        try {
            InternalStorage.writeObject(context,filename,logBook);
        } catch (IOException e) {
            e.printStackTrace();
        }
        Log.d(this.getClass().getName(),"hymn removed: " +hymnId);
    }

    // for a hymn that no longer exists in the database
    public static void removeFromHistoryAndFavorites(Context context, String hymnId) {
        new LogBook(context, ContentArea.HISTORY_LOGBOOK_FILE).removeAndSave(hymnId);
        new LogBook(context, FaveButton.FAVE_LOG_BOOK_FILE).removeAndSave(hymnId);
    }

    // takes the hymn out of the set (without saving) and returns a new record for it with the current time
    private HymnRecord remove(Hymn hymn) {
        // *** new Date() initializes a Date object with the current time.
        HymnRecord record = newRecord(hymn, new Date());

        // Remove existing record in the log if any (exiting record means record with the same hymnId)
        logBook.remove(record);

        return record;
    }

    private static HymnRecord newRecord(Hymn hymn, Date date) {
        String firstLine;

        // some hymns do not have stanzas, just chorus, so we need this code
        if (hymn.getFirstStanzaLine()==null || hymn.getFirstStanzaLine().isEmpty()) {
            firstLine = hymn.getFirstChorusLine();
        } else {
            firstLine = hymn.getFirstStanzaLine();
        }

        return new HymnRecord(hymn.getHymnId(), hymn.getGroup(), firstLine, date);
    }
}
