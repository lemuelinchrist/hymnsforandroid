package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor

/**
 * Created by lemuelcantos on 6/7/16.
 */
class ExtractNS523To543 {
    public static void  main(arg) {
        println 'hello'
        HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, "NS", "506", "506");
//        Dao dao = new Dao();
//        dao.find('E1');
        System.out.println(Constants.SQLITE_FILE_PATH);


    }
}
