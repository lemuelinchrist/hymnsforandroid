package com.lemuelinchrist.hymns.lib.beans;

import javax.persistence.Basic;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToOne;
import javax.persistence.SequenceGenerator;

/**
 * Created by lcantos on 8/6/13.
 */
@Entity
@javax.persistence.Table(name = "stanza", schema = "", catalog = "")
public class StanzaEntity {


    @ManyToOne(fetch= FetchType.EAGER)
    @JoinColumn(name="parent_hymn")
    private HymnsEntity parentHymn;
    @Basic
    @javax.persistence.Column(name = "no")
    private String no;
    @Basic
    @javax.persistence.Column(name = "text")
    private String text;
    @Basic
    @javax.persistence.Column(name = "note")
    private String note;

    @Basic
    @javax.persistence.Column(name = "n_order")
    private int order;

    public int getOrder() {
        return order;
    }

    public void setOrder(int order) {
        this.order = order;
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    @Id
    @SequenceGenerator(name="STANZA", sequenceName="stanza",allocationSize=1)
    @GeneratedValue(strategy= GenerationType.SEQUENCE, generator = "STANZA")
    @javax.persistence.Column(name = "id")
    private int id;

    public HymnsEntity getParentHymn() {
        return parentHymn;
    }

    public void setParentHymn(HymnsEntity parentHymn) {
        this.parentHymn = parentHymn;
    }

    public String getNo() {
        return no;
    }

    public void setNo(String no) {
        this.no = no;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }


    @Override
    public String toString() {
        return "\n"+"StanzaEntity{" +
                "parentHymn=" + parentHymn.getId() +
                ", no='" + no + '\'' +
                ", order='" + order + '\'' +
                ", text='" + text + '\'' +
                ", note='" + note + '\'' +
                ", id=" + id +
                '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;

        StanzaEntity that = (StanzaEntity) o;

        if (id != that.id) return false;
        if (no != null ? !no.equals(that.no) : that.no != null) return false;
        if (note != null ? !note.equals(that.note) : that.note != null) return false;
        if (parentHymn != null ? !parentHymn.equals(that.parentHymn) : that.parentHymn != null) return false;
        if (text != null ? !text.equals(that.text) : that.text != null) return false;

        return true;
    }

//    @Override
//    public int hashCode() {
//        int result = parentHymn != null ? parentHymn.hashCode() : 0;
//        result = 31 * result + (no != null ? no.hashCode() : 0);
//        result = 31 * result + (text != null ? text.hashCode() : 0);
//        result = 31 * result + (note != null ? note.hashCode() : 0);
//        result = 31 * result + id;
//        return result;
//    }
}
