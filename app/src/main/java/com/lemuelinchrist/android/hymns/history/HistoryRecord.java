package com.lemuelinchrist.android.hymns.history;

import java.io.Serializable;
import java.util.Date;

/**
 * Created by lemuelcantos on 7/12/14.
 */

public class HistoryRecord implements Comparable<HistoryRecord>, Serializable {
    private Date recordDate;
    private String hymnId;

    HistoryRecord(String hymnId, Date recordDate) {
        this.hymnId=hymnId;
        this.recordDate=recordDate;
    }

    public String getHymnId() {
        return hymnId;
    }

    public Date getRecordDate() {
        return recordDate;
    }

    @Override
    public int compareTo(HistoryRecord historyRecord) {
        return historyRecord.getRecordDate().compareTo(recordDate);
    }

    @Override
    public boolean equals(Object object){
        if (!(object instanceof HistoryRecord))
            return false;

        return hymnId.equals(((HistoryRecord) object).getHymnId());
    }

    public int hashCode() {
        return hymnId.hashCode();
    }

    @Override
    public String toString() {
        return "HistoryRecord{" +
                "recordDate=" + recordDate +
                ", hymnId='" + hymnId + '\'' +
                '}';
    }
}
