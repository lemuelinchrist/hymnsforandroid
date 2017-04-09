package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 * Created by lemuel on 8/4/2017.
 */
class ProvisionGerman {
    static File germanFile;
    static File spanishRelatedFile;

    public static void main(String[] args) throws Exception {
        Dao dao = new Dao();
        germanFile = new File(this.getClass().getResource("/german/German_hymns.txt").getPath());

        Iterator<String> iterator = germanFile.iterator();
        Integer hymnNumber = 0;
        Integer stanzaCounter = 0;
        Integer stanzaOrderCounter=0;
        HymnsEntity hymn=null;
        StanzaEntity stanza=null;
        StringBuilder stanzaBuilder=null;
        while (iterator.hasNext()) {
            String line = iterator.next().trim();
            if(line.isEmpty()) {
                line = iterator.next().trim();
                if(line.isEmpty()) {
                    line = iterator.next().trim();
                    def hymnNumberText = iterator.next().trim();
                    println hymnNumberText + " " + line
                    println "*****************************************************************************"

                } else {
                    println line[0,line.indexOf(" ")]



                }






            } else { // if line isn't empty

            }

        }

    }

}
