package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Two standalone New Songs hymns missed by earlier syncs, found by diffing our DB
 * against hymnal.net's first-line index (/en/song-index/ns/<letter>) on 2026-09-05.
 */
class ExtractNS613To614 {
    public static void  main(arg) {
        println 'hello'
        Dao dao = new Dao()

        for (int x = 613; x<=614; x++) {
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, ""+x, 'NS', ""+x);
            dao.save(hymn);
        }
    }
}
