package com.lemuelinchrist.hymns;

import com.lemuelinchrist.hymns.lib.Constants;
import com.lemuelinchrist.hymns.lib.Dao;
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor;
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity;
import org.codehaus.groovy.runtime.DefaultGroovyMethods;

/**
 * Created by lemuelcantos on 6/7/16.
 */
class ExtractNewTunes {
    static void main(String[] arg) throws Exception {
        Dao dao = new Dao();

        int[] newHymnNo = [251,321,339,369,449,496,523,525,731,806]
        int bfNo =440;
        for (int x: newHymnNo){
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.NEW_TUNES_SHEET_LINK, "" + x, "BF", "" + bfNo++)
            dao.save(hymn);
        }
    }
}
