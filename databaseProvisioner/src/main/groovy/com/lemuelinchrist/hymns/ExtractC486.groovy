package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Created by lemuelcantos on 6/7/16.
 */
class ExtractC486 {
    public static void  main(arg) {
        println 'hello'
        Dao dao = new Dao()

        HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_CHINESE, "486?gb=1", 'Z', "486");
        hymn.setParentHymn("E666")
        hymn.setRelatedString("E666,C486")
        hymn.setMainCategory("鼓励")
        hymn.setSubCategory("儆醒")
        dao.save(hymn)

        hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_CHINESE, "486", 'C', "486");
        hymn.setParentHymn("E666")
        hymn.setRelatedString("E666,Z486")
        hymn.setMainCategory("鼓勵")
        hymn.setSubCategory("儆醒")
        dao.save(hymn)

    }
}
