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
        c389()

    }

    public static void c486() {
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

    public static void c389() {
        Dao dao = new Dao()

        def hymnNo = "389"
        def parentHymn = "E531"


        HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_CHINESE, hymnNo+"?gb=1", 'Z', hymnNo);
        hymn.setParentHymn(parentHymn)
        hymn.addRelated(parentHymn)
        hymn.addRelated("C"+hymnNo)
        hymn.setMainCategory("经歷基督")
        hymn.setSubCategory("作一切")
        dao.save(hymn)

        hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_CHINESE, hymnNo, 'C', hymnNo);
        hymn.setParentHymn(parentHymn)
        hymn.addRelated(parentHymn)
        hymn.addRelated("Z"+hymnNo)
        hymn.setMainCategory("經歷基督")
        hymn.setSubCategory("作一切")
        dao.save(hymn)
    }
}
