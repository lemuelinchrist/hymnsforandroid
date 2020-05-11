package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 *
 * @author Lemuel Cantos
 * @since 2020*
 */
class ProvisionIndonesianSupplement {
    static File indonesianFile;
    Integer stanzaCounter = 0;
    Integer stanzaOrderCounter = 0;
    Integer hymnCounter=1000;
    ArrayList<String> malformedHymns =[]

    String line
    Iterator<String> iterator
    HymnsEntity hymn = null;
    StanzaEntity stanza = null;
    StringBuilder stanzaBuilder = null
    private Dao dao = new Dao()
    boolean isNewHymn


    static void main(String[] args) {
        def indonesian = new ProvisionIndonesianSupplement();
        indonesian.provision();
        println "end!!!!!"
    }

    void provision() throws Exception {
//        germanFile = new File(this.getClass().getResource("/german/New_German_hymns.txt").getPath());
        indonesianFile = new File(this.getClass().getResource("/indonesian/IndonesiaSuppliment.txt").getPath());

        iterator = indonesianFile.iterator();

        while (iterator.hasNext()) {

            lookForTheNextNonEmptyLine()



//            print line
            if (line.matches('^\\d+')) {

//                // 782 is expected to be missing
//                if(++hymnCounter==782) {
//                    hymnCounter++
//                }

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
        println "******* Generating Indonesian Supplement Hymn ${hymnCounter}..."

        stanzaCounter = 0
        stanzaOrderCounter = 0

        hymn = new HymnsEntity();
        hymn.id = 'I' + (hymnCounter)
        hymn.no = (hymnCounter).toString()
        hymn.hymnGroup = 'I'
        hymn.stanzas = new ArrayList<StanzaEntity>()

        def categories = iterator.next().trim()
        if(categories.contains(".")) {
            throw new Exception("this line might be a related line instead of a category")
        }
        def splitCategories = categories.split(" - ")
        if (splitCategories.length==1) {
            hymn.mainCategory = splitCategories[0].trim()
        } else if (splitCategories.length == 2 ) {
            hymn.mainCategory = splitCategories[0].trim()
            hymn.subCategory = splitCategories[1].trim()
        }

        line = iterator.next().trim()
        //related
        if(line.length() >= 2) {
            def related = line.replace(".","")
            hymn.addRelated(related)

            //find English related if available
            HymnsEntity relatedHymn = dao.find(related)
            if(relatedHymn==null) {
                throw new Exception("Related not found!: " + related)
            }
            if(relatedHymn.getParentHymn()!=null && !relatedHymn.getParentHymn().isEmpty()) {
                hymn.parentHymn=relatedHymn.getParentHymn()
            } else {
                hymn.parentHymn=relatedHymn.id
            }

        }

        // generate first stanza
        lookForTheNextNonEmptyLine()
        StanzaEntity stanza = createNewStanza()
        hymn.stanzas+=stanza
        hymn.firstStanzaLine=stanza.text.split("<br/>")[0]

    }

    StanzaEntity createNewStanza() {
        StanzaEntity stanza = new StanzaEntity()
        stanza.setParentHymn(hymn)
        stanza.text = ''
        stanza.order = ++stanzaOrderCounter


        if(line.equals("Koor:") || line.equals("Koor :")) {
            lookForTheNextNonEmptyLine()
            if(hymn.firstChorusLine==null || hymn.firstChorusLine.isEmpty()) {
                hymn.firstChorusLine=line
            }
            stanza.no= "chorus"
        } else {
            def numberInLine = line.split(" ")[0]
            stanzaCounter++
            if(!numberInLine.equals(stanzaCounter.toString()) && hymn.id != "I1702") {
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

        return stanza
    }

    def lookForTheNextNonEmptyLine() {
        while (iterator.hasNext()) {
            line = iterator.next().trim()
            if(!line.isEmpty()) break
        }
    }
}
