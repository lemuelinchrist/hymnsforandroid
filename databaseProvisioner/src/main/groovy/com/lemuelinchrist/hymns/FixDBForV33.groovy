package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Created by lemuel on 20/4/2017.
 */
class FixDBForV33 {
    // This script tries to fix missing first stanza lines of all hymns.

    public static void main(String[] args) {
        Dao dao = new Dao();
        println "finding all hymns"
        List<HymnsEntity> hymns = dao.findAll("h.firstStanzaLine=null");

        for(HymnsEntity hymn : hymns) {
            if (hymn.firstChorusLine == null) {
                def text = hymn.stanzas[0].text
                text = text.substring(0,text.indexOf("<"))
                println hymn.id + ": extracting - " + text;
                hymn.firstStanzaLine=text
            } else {
                println hymn.id + ": moving firstChorusLine - " + hymn.firstChorusLine;
                hymn.firstStanzaLine=hymn.firstChorusLine;
                hymn.firstChorusLine=null;
            }

            // T635:
            if(hymn.id.equals("T635")) {
                hymn.firstStanzaLine="Sa winala di sa ’tamo"

            }


            dao.save(hymn);
        }

    }
}
