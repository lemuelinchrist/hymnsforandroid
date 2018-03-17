package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Created by lemuel on 20/4/2017.
 */
class UpdateV34 {

    static Dao dao = new Dao()

    static void main(String[] args) {
//        change587To1087()
//        extractNS566To617()
//        extractOthers()
//        extractNewTagalog1249To1360()
//        extractNewEnglish1249To1360()
        removeAllTS()
    }

    static change587To1087() {
        dao.changeHymnNumber("NS587","NS","1087")

    }

    static extractNS566To617() {
        println 'hello'

        for (int x = 566; x<=617; x++) {
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, ""+x, 'NS', ""+x)
            dao.save(hymn)
        }

    }

    static extractOthers() {
        HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_CEBUANO, "267", 'CB', "267")
        hymn.parentHymn="E267"
        dao.save(hymn)
    }

    static extractNewTagalog1249To1360() {

        for (int x = 1349; x<=1360; x++) {
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_TAGALOG, ""+x, 'T', ""+x)
            hymn.parentHymn="E"+x
            dao.save(hymn)
        }
    }

    static extractNewEnglish1249To1360() {

        for (int x = 1349; x<=1360; x++) {
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_URL, ""+x, 'E', ""+x)
            dao.save(hymn)
            dao.fixParentHymnOfChildren("E"+x)
        }
    }

    static removeAllTS() {
        dao.removeAllTS();
    }



}
