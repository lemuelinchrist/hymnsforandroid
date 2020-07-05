package com.lemuelinchrist.hymns.lib.beans;

import javax.persistence.Basic;
import javax.persistence.Entity;
import javax.persistence.Id;

/**
 * @author Lemuel Cantos
 * @since 14/5/2020
 */
@Entity
@javax.persistence.Table(name = "tune", schema = "", catalog = "")
public class TuneEntity {
    @Id
    @javax.persistence.Column(name = "_id")
    private String id;
    @Basic
    @javax.persistence.Column(name = "youtube_link")
    private String youtubeLink;
    @Basic
    @javax.persistence.Column(name = "comment")
    private String comment;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getYoutubeLink() {
        return youtubeLink;
    }

    public void setYoutubeLink(String youtubeLink) {
        this.youtubeLink = youtubeLink;
    }

    @Override
    public String toString() {
        return "TuneEntity{" +
                "id='" + id + '\'' +
                ", youtubeLink='" + youtubeLink + '\'' +
                ", comment='" + comment + '\'' +
                '}';
    }

    public String getComment() {
        return comment;
    }

    public void setComment(String comment) {
        this.comment = comment;
    }
}
