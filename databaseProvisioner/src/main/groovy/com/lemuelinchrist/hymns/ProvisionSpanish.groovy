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
        String hymnNumber = 0;
        while (iterator.hasNext()) {
            String line = iterator.next().trim();
            if(line.isEmpty()) {
                line = iterator.next().trim();
                if (line.isEmpty()) {
                    hymnNumber++
                    line = iterator.next().trim();
                    if(!line.equals(hymnNumber+".")) {
                        throw new RuntimeException("Missing Hymn: " + hymnNumber);

                    }


                    println "Hymn ${hymnNumber} found!"


                }

            }

        }

    }
}
