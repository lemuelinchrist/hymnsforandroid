package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 *
 * @author Lemuel Cantos
 * @since 2020*
 */
class ProvisionIndonesian {
    static File indonesianFile;
    Integer stanzaCounter = 0;
    Integer stanzaOrderCounter = 0;
    Integer hymnCounter=0;
    ArrayList<String> malformedHymns =[]

    String line
    Iterator<String> iterator
    HymnsEntity hymn = null;
    StanzaEntity stanza = null;
    StringBuilder stanzaBuilder = null
    private Dao dao = new Dao()
    boolean isNewHymn


    static void main(String[] args) {
        def indonesian = new ProvisionIndonesian();
        indonesian.provision();
        println "end!!!!!"
    }

    void provision() throws Exception {
//        germanFile = new File(this.getClass().getResource("/german/New_German_hymns.txt").getPath());
        indonesianFile = new File(this.getClass().getResource("/indonesian/BahasaIndonesiaHymn.txt").getPath());

        iterator = indonesianFile.iterator();

        while (iterator.hasNext()) {

            line = iterator.next().trim()



//            print line
            if (line.matches('^\\d+')) {

                // 782 is expected to be missing
                if(++hymnCounter==782) {
                    hymnCounter++
                }

                if(line.toInteger()!=hymnCounter) {
                    malformedHymns.add(line)
                    hymnCounter = line.toInteger()
                }
                finalizeCurrentHymn()
                createNewHymn()
                println hymn

            } else if (line.isEmpty()) {
                finalizeCurrentHymn()
//                break
            } else {
//                    createNewStanza()

            }

//            println hymn
        }

        println("missing hymns: " + malformedHymns)

    }

    def finalizeCurrentHymn() {

    }

    def createNewHymn() {
        println "******* Generating Chinese Hymn ${hymnCounter}..."
        hymn = new HymnsEntity();
        hymn.id = 'I' + hymnCounter
        hymn.no = hymnCounter.toString()
        hymn.hymnGroup = 'I'
        hymn.stanzas = new ArrayList<StanzaEntity>()
        stanzaCounter = 0
        stanzaOrderCounter = 0

        def splitCategories = iterator.next().trim().split(" - ")
        if (splitCategories.length!=2) {
            throw new Exception("bad categories: " + hymn.id)
        }
        hymn.mainCategory = splitCategories[0].trim()
        hymn.subCategory = splitCategories[1].trim()

        line = iterator.next().trim()
        if(line.length() >= 2 && line.substring(0,2).equals('C.')) {
            def chineseRelated = "C" + line.substring(2).trim()
            hymn.addRelated(chineseRelated)

            //find English related if available
            HymnsEntity chineseHymn = dao.find(chineseRelated)
            if(chineseHymn==null) {
                throw new Exception("Chinese not found!: " + chineseRelated)
            }
            if(chineseHymn.getParentHymn()!=null && !chineseHymn.getParentHymn().isEmpty()) {
                hymn.parentHymn=chineseHymn.getParentHymn()
            } else {
                hymn.parentHymn=chineseHymn
            }

        }





    }

//    StanzaEntity createNewStanza() {
//
//
//        return stanza
//    }
}
