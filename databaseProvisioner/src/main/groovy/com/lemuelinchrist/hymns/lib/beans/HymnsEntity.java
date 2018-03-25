package com.lemuelinchrist.hymns.lib.beans;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import javax.persistence.Basic;
import javax.persistence.CascadeType;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.Id;
import javax.persistence.OneToMany;

/**
 * Created by lcantos on 8/6/13.
 */
@Entity
@javax.persistence.Table(name = "hymns", schema = "", catalog = "")
public class HymnsEntity {

    @Id
    @javax.persistence.Column(name = "_id")
    private String id;
    @Basic
    @javax.persistence.Column(name = "hymn_group")
    private String hymnGroup;
    @Basic
    @javax.persistence.Column(name = "first_stanza_line")
    private String firstStanzaLine;
    @Basic
    @javax.persistence.Column(name = "first_chorus_line")
    private String firstChorusLine;
    @Basic
    @javax.persistence.Column(name = "main_category")
    private String mainCategory;
    @Basic
    @javax.persistence.Column(name = "sub_category")
    private String subCategory;
    @Basic
    @javax.persistence.Column(name = "meter")
    private String meter;
    @Basic
    @javax.persistence.Column(name = "author")
    private String author;
    @Basic
    @javax.persistence.Column(name = "composer")
    private String composer;
    @Basic
    @javax.persistence.Column(name = "time")
    private String time;
    @Basic
    @javax.persistence.Column(name = "key")
    private String key;
    @Basic
    @javax.persistence.Column(name = "tune")
    private String tune;
    @Basic
    @javax.persistence.Column(name = "no")
    private String no;
    @Basic
    @javax.persistence.Column(name = "related")
    private String related;


    @OneToMany(mappedBy="parentHymn", fetch = FetchType.EAGER,cascade= CascadeType.ALL)
    private List<StanzaEntity> stanzas;
    @Basic
    @javax.persistence.Column(name = "parent_hymn")
    private String parentHymn;
    @Basic
    @javax.persistence.Column(name = "sheet_music_link")
    private String sheetMusicLink;
//    @OneToMany(mappedBy="hymn",fetch = FetchType.EAGER,cascade=CascadeType.ALL,orphanRemoval=true)
//    private List<RelatedEntity> relatedHymns;

    @Basic
    @javax.persistence.Column(name = "verse")
    private String verse;



    public String getParentHymn() {
        return parentHymn;
    }

    public void setParentHymn(String parentHymn) {
        this.parentHymn = parentHymn;
    }

    public String getSheetMusicLink() {
        return sheetMusicLink;
    }

    public void setSheetMusicLink(String sheetMusicLink) {
        this.sheetMusicLink = sheetMusicLink;
    }



    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getHymnGroup() {
        return hymnGroup;
    }

    public void setHymnGroup(String hymnGroup) {
        this.hymnGroup = hymnGroup;
    }

    public String getFirstStanzaLine() {
        return firstStanzaLine;
    }

    public void setFirstStanzaLine(String firstStanzaLine) {
        this.firstStanzaLine = firstStanzaLine;
    }

    public String getFirstChorusLine() {
        return firstChorusLine;
    }

    public void setFirstChorusLine(String firstChorusLine) {
        this.firstChorusLine = firstChorusLine;
    }

    public String getMainCategory() {
        return mainCategory;
    }

    public void setMainCategory(String mainCategory) {
        this.mainCategory = mainCategory;
    }

    public String getSubCategory() {
        return subCategory;
    }

    public void setSubCategory(String subCategory) {
        this.subCategory = subCategory;
    }

    public String getMeter() {
        return meter;
    }

    public void setMeter(String meter) {
        this.meter = meter;
    }

    public String getAuthor() {
        return author;
    }

    public void setAuthor(String author) {
        this.author = author;
    }

    public String getComposer() {
        return composer;
    }

    public void setComposer(String composer) {
        this.composer = composer;
    }

    public String getTime() {
        return time;
    }

    public void setTime(String time) {
        this.time = time;
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getTune() {
        return tune;
    }

    public void setTune(String tune) {
        this.tune = tune;
    }

    public String getNo() {
        return no;
    }

    public void setNo(String no) {
        this.no = no;
    }



    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;

        HymnsEntity that = (HymnsEntity) o;

        if (author != null ? !author.equals(that.author) : that.author != null) return false;

        if (composer != null ? !composer.equals(that.composer) : that.composer != null)
            return false;
        if (firstChorusLine != null ? !firstChorusLine.equals(that.firstChorusLine) : that.firstChorusLine != null)
            return false;
        if (firstStanzaLine != null ? !firstStanzaLine.equals(that.firstStanzaLine) : that.firstStanzaLine != null)
            return false;
        if (hymnGroup != null ? !hymnGroup.equals(that.hymnGroup) : that.hymnGroup != null)
            return false;
        if (!id.equals(that.id)) return false;
        if (key != null ? !key.equals(that.key) : that.key != null) return false;
        if (mainCategory != null ? !mainCategory.equals(that.mainCategory) : that.mainCategory != null)
            return false;
        if (meter != null ? !meter.equals(that.meter) : that.meter != null) return false;
        if (no != null ? !no.equals(that.no) : that.no != null) return false;


        if (stanzas != null ? !stanzas.equals(that.stanzas) : that.stanzas != null) return false;
        if (subCategory != null ? !subCategory.equals(that.subCategory) : that.subCategory != null)
            return false;
        if (time != null ? !time.equals(that.time) : that.time != null) return false;
        if (tune != null ? !tune.equals(that.tune) : that.tune != null) return false;

        return true;
    }

    public List<StanzaEntity> getStanzas() {
        return stanzas;
    }

    public void setStanzas(List<StanzaEntity> stanzas) {
        this.stanzas = stanzas;
    }

//    @Override
//    public int hashCode() {
//        int result = id.hashCode();
//        result = 31 * result + (hymnGroup != null ? hymnGroup.hashCode() : 0);
//        result = 31 * result + (firstStanzaLine != null ? firstStanzaLine.hashCode() : 0);
//        result = 31 * result + (firstChorusLine != null ? firstChorusLine.hashCode() : 0);
//        result = 31 * result + (mainCategory != null ? mainCategory.hashCode() : 0);
//        result = 31 * result + (subCategory != null ? subCategory.hashCode() : 0);
//        result = 31 * result + (meter != null ? meter.hashCode() : 0);
//        result = 31 * result + (author != null ? author.hashCode() : 0);
//        result = 31 * result + (composer != null ? composer.hashCode() : 0);
//        result = 31 * result + (time != null ? time.hashCode() : 0);
//        result = 31 * result + (key != null ? key.hashCode() : 0);
//        result = 31 * result + (tune != null ? tune.hashCode() : 0);
//        result = 31 * result + (no != null ? no.hashCode() : 0);
//        result = 31 * result + (chorusCount != null ? chorusCount.hashCode() : 0);
//        result = 31 * result + (stanzaCount != null ? stanzaCount.hashCode() : 0);
//        result = 31 * result + (stanzas != null ? stanzas.hashCode() : 0);
//        result = 31 * result + (relatedHymns != null ? relatedHymns.hashCode() : 0);
//        return result;
//    }


    @Override
    public String toString() {
        return "HymnsEntity{" +
                "id='" + id + '\'' +
                ", hymnGroup='" + hymnGroup + '\'' +"\n"+
                ", firstStanzaLine='" + firstStanzaLine + '\'' +"\n"+
                ", firstChorusLine='" + firstChorusLine + '\'' +"\n"+
                ", mainCategory='" + mainCategory + '\'' +"\n"+
                ", subCategory='" + subCategory + '\'' +"\n"+
                ", meter='" + meter + '\'' +"\n"+
                ", author='" + author + '\'' +"\n"+
                ", composer='" + composer + '\'' +"\n"+
                ", time='" + time + '\'' +"\n"+
                ", key='" + key + '\'' +"\n"+
                ", tune='" + tune + '\'' +"\n"+
                ", no='" + no + '\'' +"\n"+
                ", stanzas=" + stanzas +"\n"+
                ", parentHymn='" + parentHymn + '\'' +"\n"+
                ", sheetMusicLink='" + sheetMusicLink + '\'' +"\n"+

                ", verse='" + verse + '\'' +"\n"+
                ", related='" + related + '\'' +"\n"+
                '}';
    }

    public void setVerse(String verse) {
        this.verse = verse;
    }

    public String getVerse() {
        return verse;
    }

    public Set<String> getRelated() {
        if (related==null) return null;
        String [] relatedArray = related.split(",");
        HashSet<String> relatedSet = new HashSet<String>(Arrays.asList(relatedArray));

        return relatedSet;
    }

    public int getNumberOfChorus() {
        int numberOfChorus=0;
        for(StanzaEntity stanza: this.stanzas) {
            if(stanza.getNo().toLowerCase().trim().equals("chorus")) numberOfChorus++;
        }
        return numberOfChorus;
    }

    public void setRelated(Set<String> related) {
        StringBuilder relatedBuilder = new StringBuilder();
        if (related==null) {
            this.related=null;
            return;
        }

        for(String r: related) {
            relatedBuilder.append(r+",");
        }

        this.related = relatedBuilder.toString();
    }

    public void setRelatedString(String related) {
        this.related = related;
    }
}
