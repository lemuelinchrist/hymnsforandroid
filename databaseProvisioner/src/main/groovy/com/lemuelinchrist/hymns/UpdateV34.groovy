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
//        removeAllTS()
        changeLyrics()
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
        dao.removeAllTS()
        dao.removeAllTS()
    }

    static changeLyrics() {
        dao.changeStanza("E1138", 5943,
                "As we eat Thyself, Lord Jesus,<br/>Consecrated we become;<br/>By Thy wondrous life within us,<br/>Thy obedience is our own.<br/>No more need we strive and struggle,<br/>Consecrated try to be;<br/>Consecration dwells within us —<br/>Now our part to eat of Thee.<br/>")
        dao.changeStanza("E422", 2154, "My will is not my own<br/>Till Thou hast made it Thine;<br/>If it would reach the monarch's throne<br/>It must its crown resign;<br/>It only stands unbent<br/>Amid the clashing strife,<br/>When on Thy bosom it has leant,<br/>And found in Thee its life.<br/>")
        dao.changeStanza("C737", 11161, "愛何大，尋回我！<br/>血何寶，贖回我！<br/>恩何豐，帶回我歸羊群！<br/>奇妙恩，帶回我歸羊群！<br/>")


    }



}
