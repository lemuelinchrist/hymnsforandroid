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
        // but first lets fix hymns with missing first stanza lines
        dao.fixFirstStanzaLine()
        dao.fixComposer()
        dao.changeRelatedHymn("E1351","CS835,T1351,")
        dao.changeRelatedHymn("E1358","C664,K664,T1358,")
        dao.changeRelatedHymn("C644",null)
        dao.changeParentHymn("C644","E1358")
        dao.changeParentHymn("K644","E1358")
        dao.changeRelatedHymn("E921","CB921,T921")
        dao.changeRelatedHymn("CB921",null)
        dao.changeRelatedHymn("T921",null)
        dao.changeRelatedHymn("K644",null)
        dao.changeRelatedHymn("E445","S190,T445,CB445,C339,K339,FR79,")
        dao.changeRelatedHymn("E1359","T1359,C339,K339")
        dao.changeRelatedHymn("T1359",null)
        dao.changeRelatedHymn("C339",null)
        dao.changeRelatedHymn("K339",null)
        dao.changeParentHymn("K339","E1359")
        dao.changeParentHymn("C339","E1359")

        dao.changeParentHymn("C217","E1360")
        dao.changeParentHymn("K217","E1360")
        dao.changeRelatedHymn("E1360","T1360,C217,K217")
        dao.changeRelatedHymn("C217",null)
        dao.changeRelatedHymn("K217",null)
        dao.changeParentHymn("CB267","E267")
        dao.changeRelatedHymn("CB267",null)
        dao.changeRelatedHymn("E267","S127,T267,C217,G267,FR46,K217,CB267")


        dao.changeStanza("E1138", 5943,
                "As we eat Thyself, Lord Jesus,<br/>Consecrated we become;<br/>By Thy wondrous life within us,<br/>Thy obedience is our own.<br/>No more need we strive and struggle,<br/>Consecrated try to be;<br/>Consecration dwells within us —<br/>Now our part to eat of Thee.<br/>")
        dao.changeStanza("E422", 2154, "My will is not my own<br/>Till Thou hast made it Thine;<br/>If it would reach the monarch's throne<br/>It must its crown resign;<br/>It only stands unbent<br/>Amid the clashing strife,<br/>When on Thy bosom it has leant,<br/>And found in Thee its life.<br/>")
        dao.changeStanza("C737", 11161, "愛何大，尋回我！<br/>血何寶，贖回我！<br/>恩何豐，帶回我歸羊群！<br/>奇妙恩，帶回我歸羊群！<br/>")
        dao.changeStanza("E1089", 5653, "Lamb of God—our sin's redemption,<br/>Brazen serpent—Satan's end,<br/>Grain of wheat—life’s reproduction,<br/>Now with many grains we blend.<br/>Hallelujah! Hallelujah!<br/>What an all-inclusive death,<br/>What an all-inclusive death!<br/>")
        dao.changeStanza("E190", 977, "Thou art the very God in truth,<br/>The God who is both love and light;<br/>The God who is to us our life,<br/>The God in whom we all delight.<br/>")
//        dao.changeStanza("E11111", 11111111, "")
        dao.changeStanza("E448", 2290, "You have longed for sweet peace, and for faith to increase,<br/>And have earnestly, fervently prayed;<br/>But you cannot have rest, or be perfectly blest,<br/>Until all on the altar is laid.<br/>")
        dao.changeStanza("E448", 2292, "Would you walk with the Lord in the light of His Word,<br/>And have peace and contentment alway;<br/>You must do His sweet will to be free from all ill;<br/>On the altar your all you must lay.<br/>")
        dao.changeStanza("E448", 2294, "Who can tell all the love He will send from above!<br/>Oh, how happy our heart will be made!<br/>Oh, what fellowship sweet we shall share at His feet,<br/>When our all on the altar is laid!<br/>")
        dao.changeStanza("NS374", 20642, "What then, brothers? What then, sisters?<br/>What then, shall we do?<br/>Whenever you come together as the church?<br/>What then, brothers? What then, sisters?<br/>What then, shall we do?<br/>When you come together as the church?<br/>")
        dao.changeStanza("E86", 432, "Therefore hath God exalted Thee,<br/>Given Thee glory, majesty,<br/>Heaven and earth will bow the knee;<br/>O Lord, I worship Thee!<br/>")


    }



}
