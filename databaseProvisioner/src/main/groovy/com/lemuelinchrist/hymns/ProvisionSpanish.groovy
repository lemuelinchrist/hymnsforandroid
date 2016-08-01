package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 * Created by lcantos on 29/7/2016.
 */
class ProvisionSpanish {
    static File spanishFile;
    static File spanishRelatedFile;

    public static void main(String[] args) throws Exception {
//        Dao dao = new Dao();
        spanishFile = new File(this.getClass().getResource("/spanish.txt").getPath());
        spanishRelatedFile = new File(this.getClass().getResource("/spanishRelated.txt").getPath());

        Iterator<String> iterator = spanishFile.iterator();
        Iterator<String> relatedIterator = spanishRelatedFile.iterator();
        Integer hymnNumber = 0;
        Integer stanzaCounter = 0;
        HymnsEntity hymn=null;
        StanzaEntity stanza=null;
        while (iterator.hasNext()) {
            String line = iterator.next().trim();
            if(line.isEmpty()) {
                line = iterator.next().trim();
                if (line.isEmpty()) {
                    // finalize current hymn before iterating
//                    println hymn;

                    hymnNumber++;
                    if (hymnNumber==501) break;

                    line = iterator.next().trim();
                    if(!line.equals(hymnNumber+".")) {
                        throw new RuntimeException("Missing Hymn: " + hymnNumber);
                    }

                    println "Generating Spanish Hymn ${hymnNumber}..."
                    hymn=new HymnsEntity();
                    hymn.id='S'+hymnNumber
                    hymn.no=hymnNumber
                    hymn.hymnGroup='S'
                    stanzaCounter=0;

                    def related = relatedIterator.next().trim();
                    if (related.isEmpty()) {
                        hymn.parentHymn=null
                    } else if (!related[0].equals("C")) {
                        // english
                        hymn.parentHymn="E"+related
                    } else {
                        // chinese
                        hymn.parentHymn = related;
                    }



                } else if (line.toLowerCase().contains("coro:")) {
                    line = iterator.next().trim();
                    if (line.isEmpty()) throw new RuntimeException("blank line after chorus");

                } else if(!line[0].isInteger() && !line[0].equals('(') && !line[0].equals('+')) {
                    throw new RuntimeException("Invalid start of stanza");
                } else if(line[0].isInteger()) {
                    stanza=new StanzaEntity();
                    stanzaCounter++;
                    if (!line.contains(""+stanzaCounter)) {
                        println "wrong stanza number: " + line;
                    }

                }

            }

        }

    }

}
