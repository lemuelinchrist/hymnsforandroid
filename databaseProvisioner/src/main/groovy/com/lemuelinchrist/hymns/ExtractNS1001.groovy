package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Created by lemuelcantos on 6/7/16.
 */
class ExtractNS1001 {
    public static void  main(arg) {
        println 'hello'
        Dao dao = new Dao()
        int newHymnNo=10000
        for(int x=1001; x<1086; x++)  {
            newHymnNo++
            dao.changeHymnNumber("NS"+ x.toString(),"NS", newHymnNo.toString())
        }

//        for (int x = 873; x<=1000; x++) {
//            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, ""+x, 'NS', ""+x);
//            dao.save(hymn);
//        }
    }
}
