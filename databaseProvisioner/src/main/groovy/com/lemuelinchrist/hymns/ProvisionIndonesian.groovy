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

            lookForTheNextNonEmptyLine()



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

            } else if (line.isEmpty()) {
                finalizeCurrentHymn()
                break
            } else {
                   hymn.stanzas+= createNewStanza()
            }

        }
        finalizeCurrentHymn()
        println("missing hymns: " + malformedHymns)

    }

    def finalizeCurrentHymn() {
        if (hymn==null) return
        println hymn
        dao.save(hymn)
    }

    def createNewHymn() {
        println "******* Generating Indonesian Hymn ${hymnCounter}..."

        stanzaCounter = 0
        stanzaOrderCounter = 0

        hymn = new HymnsEntity();
        hymn.id = 'I' + hymnCounter
        hymn.no = hymnCounter.toString()
        hymn.hymnGroup = 'I'
        hymn.stanzas = new ArrayList<StanzaEntity>()

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
                hymn.parentHymn=chineseHymn.id
            }

        }

        // generate first stanza
        lookForTheNextNonEmptyLine()
        StanzaEntity stanza = createNewStanza()
        hymn.stanzas+=stanza
    }

    StanzaEntity createNewStanza() {
        StanzaEntity stanza = new StanzaEntity()
        stanza.setParentHymn(hymn)
        stanza.text = ''
        stanza.order = ++stanzaOrderCounter

        if(line.equals("Syair Kedua") || line.equals("Syair Kesatu")) {
            stanza.no="beginning-note"

        } else if(line.equals("Koor:")) {
            lookForTheNextNonEmptyLine()
            if(hymn.firstChorusLine==null || hymn.firstChorusLine.isEmpty()) {
                hymn.firstChorusLine=line
            }
            stanza.no= "chorus"
        } else {
            def numberInLine = line.split(" ")[0]
            stanzaCounter++
            if(!numberInLine.equals(stanzaCounter.toString()) && hymn.no!="388" && hymn.no!="485" && hymn.no!="717") {
                throw new Exception("stanza "+ stanzaCounter + " not found: " + hymn.id)
            }
            stanza.no = numberInLine
            line = line.replace(numberInLine,"").trim()
        }

        while(iterator.hasNext()) {
            stanza.text+=line
            stanza.text+="<br/>"
            line = iterator.next().trim()
            if(line.isEmpty()) break
        }

        if(stanzaCounter==1) hymn.firstStanzaLine=stanza.text.split("<br/>")[0]

        return stanza
    }

    def lookForTheNextNonEmptyLine() {
        while (iterator.hasNext()) {
            line = iterator.next().trim()
            if(!line.isEmpty()) break
        }
    }
}
