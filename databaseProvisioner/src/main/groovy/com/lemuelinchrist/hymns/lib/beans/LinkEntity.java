package com.lemuelinchrist.hymns.lib.beans;

import jakarta.persistence.Basic;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;

/**
 * A link of a hymn to somewhere outside the app (a table row of {@code link}): a piano video, later recordings.
 *
 * @author Lemuel Cantos
 * @since 14/5/2020
 */
@Entity
@jakarta.persistence.Table(name = "link", schema = "", catalog = "")
public class LinkEntity {
    @Id
    @SequenceGenerator(name = "LINK", sequenceName = "link", allocationSize = 1)
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "LINK")
    @jakarta.persistence.Column(name = "id")
    private int id;
    /** the hymn the link belongs to, e.g. "E1" */
    @Basic
    @jakarta.persistence.Column(name = "hymn_id")
    private String hymnId;
    /** what the link is: "piano" (a piano video of the hymn's tune) */
    @Basic
    @jakarta.persistence.Column(name = "kind")
    private String kind;
    /** the text shown for it, e.g. "1st tune" */
    @Basic
    @jakarta.persistence.Column(name = "label")
    private String label;
    /** the whole web address */
    @Basic
    @jakarta.persistence.Column(name = "url")
    private String url;
    /** the order among the hymn's links of the same kind, from 1 */
    @Basic
    @jakarta.persistence.Column(name = "n_order")
    private int order;

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public String getHymnId() {
        return hymnId;
    }

    public void setHymnId(String hymnId) {
        this.hymnId = hymnId;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public int getOrder() {
        return order;
    }

    public void setOrder(int order) {
        this.order = order;
    }

    @Override
    public String toString() {
        return "LinkEntity{" +
                "hymnId='" + hymnId + '\'' +
                ", kind='" + kind + '\'' +
                ", label='" + label + '\'' +
                ", url='" + url + '\'' +
                ", order=" + order +
                '}';
    }
}
