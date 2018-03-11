package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Created by lemuel on 20/4/2017.
 */
class UpdateV34 {
    // This script tries to fix missing first stanza lines of all hymns.

    public static void main(String[] args) {
        extractNS566To617();
//        provisionGerman()
//        provisionGermanNonHymns()
//        fixMissingStanzas()
//        fixSongsWithChorusOnly()

    }

    public static void extractNS566To617() {
        println 'hello'
        Dao dao = new Dao();

        for (int x = 544; x<=565; x++) {
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, ""+x, 'NS', ""+x);
            dao.save(hymn);
        }

    }


}
