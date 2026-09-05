package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Syncs New Songs hymns added to hymnal.net since the last sync (NS1091).
 * Range confirmed against hymnal.net's own first-line index (/en/song-index/ns/<letter>) on 2026-09-05.
 */
class ExtractNS1092To1161 {
    public static void  main(arg) {
        println 'hello'
        Dao dao = new Dao()

        for (int x = 1092; x<=1161; x++) {
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, ""+x, 'NS', ""+x);
            dao.save(hymn);
        }
    }
}
