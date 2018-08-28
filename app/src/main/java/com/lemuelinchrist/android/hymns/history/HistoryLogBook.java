package com.lemuelinchrist.android.hymns.history;

import android.content.Context;
import android.util.Log;

import com.lemuelinchrist.android.hymns.entities.Hymn;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InvalidClassException;
import java.lang.reflect.Array;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Created by lemuelcantos on 7/12/14.
 */
public class HistoryLogBook {

    private static final String LOGBOOK_FILE="logBook";
    private final Context context;
    private Set<HistoryRecord> logBook = new HashSet<HistoryRecord>();


    public HistoryLogBook(Context context) {
        this.context = context;

        // get logbook from saved file
        try {
            logBook = (Set<HistoryRecord>)InternalStorage.readObject(this.context, LOGBOOK_FILE);
        } catch (FileNotFoundException e) {
            Log.i(HistoryLogBook.class.getName(),"No logbook file found. Must be first time use. Creating one.");
            logBook = new HashSet<HistoryRecord>();
        } catch(InvalidClassException e) {
            Log.e(HistoryLogBook.class.getName(),"Incompatible class! creating new record \n " + e);
            logBook = new HashSet<HistoryRecord>();
        } catch (Exception e) {
            Log.e(HistoryLogBook.class.getName(),"Error reading history log book! \n " + e);
            logBook = new HashSet<HistoryRecord>();
        }


    }

    public void log(Hymn hymn) {
        // *** new Date() initializes a Date object with the current time.
        String firstLine;


        // some hymns do not have stanzas, just chorus, so we need this code
        if (hymn.getFirstStanzaLine()==null || hymn.getFirstStanzaLine().isEmpty()) {
            firstLine = hymn.getFirstChorusLine();
        } else {
            firstLine = hymn.getFirstStanzaLine();
        }

        HistoryRecord record = new HistoryRecord(hymn.getHymnId(), hymn.getGroup(), firstLine, new Date());

        // Remove existing record in the log if any (exiting record means record with the same hymnId)
        logBook.remove(record);

        // Add the new record. if there was an existing one, it is removed in the previous line and replace with one having the current time.
        logBook.add(record);
        Log.d(this.getClass().getName(),"hymn logged: " +hymn.getHymnId());

        // persist logBook
        try {
            InternalStorage.writeObject(context,LOGBOOK_FILE,logBook);
        } catch (IOException e) {
            e.printStackTrace();
        }

    }

    public HistoryRecord[] getOrderedRecordList() {
        HistoryRecord[] historyRecords = logBook.toArray(new HistoryRecord[0]);
        Arrays.sort(historyRecords);

        if (historyRecords.length>101) {
            return Arrays.copyOfRange(historyRecords, 0, 100);
        } else {
            return historyRecords;
        }
    }


}
