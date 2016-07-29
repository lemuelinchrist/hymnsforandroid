package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Created by lcantos on 29/7/2016.
 */
class ProvisionSpanish {

    public static void main(String[] args) throws Exception {
//        Dao dao = new Dao();
//        HymnsEntity hymn;
        File file = new File(this.getClass().getResource("/spanish.txt").getPath());

//        for(String line: file.readLines()) {
//            println line;
//        }
        Iterator<String> iterator = file.iterator();
        while (iterator.hasNext()) {
            println "iterator: " +iterator.next();
        }

    }
}
