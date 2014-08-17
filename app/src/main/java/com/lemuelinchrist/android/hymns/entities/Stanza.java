package com.lemuelinchrist.android.hymns.entities;


public class Stanza {
    private String parentHymn;
    private String text;
    private String no;
    private String note;

    public Stanza(String no, String text, String note, String hymnId) {
        this.setText(text);
        this.setNo(no);
        if (note == null || note.equals("")) {
            this.setNote(null);
        } else {
            this.setNote(note);
        }
        this.parentHymn = hymnId;
    }

    public Stanza() {

    }

    public String getNo() {
        return no;
    }

    public String getText() {
        return text;
    }

    public String getNote() {
        return note;
    }


    public String getParentHymn() {
        return parentHymn;
    }

    @Override
    public String toString() {
        return "Stanza{" +
                "parentHymn='" + parentHymn + '\'' +
                ", text='" + text + '\'' +
                ", no='" + no + '\'' +
                ", note='" + note + '\'' +
                '}';
    }

    public void setText(String text) {
        this.text = text;
    }

    public void setNo(String no) {
        this.no = no;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public void setParentHymn(String parentHymn) {
        this.parentHymn = parentHymn;
    }
}
