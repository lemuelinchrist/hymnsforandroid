package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Created by lemuel on 20/4/2017.
 */
class FixFirstChorusLine {
    // This script tries to fix missing first stanza lines of all hymns.

    public static void main(String[] args) {
        Dao dao = new Dao();
        println "finding all hymns"
        List<HymnsEntity> hymns = dao.findAll();
        for(HymnsEntity hymn : hymns) {
            if (hymn.firstStanzaLine == null || hymn.firstStanzaLine.isEmpty()) {
                println hymn.id;
            }
        }
    }
}
