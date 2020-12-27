package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 *
 * @author Lemuel Cantos
 * @since 2020*
 */
class ProvisionFarsi {
    static File farsiFile;
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
        def farsi = new ProvisionFarsi();
        farsi.provision();
        println "end!!!!!"
    }

    void provision() throws Exception {
//        germanFile = new File(this.getClass().getResource("/german/New_German_hymns.txt").getPath());
        farsiFile = new File(this.getClass().getResource("/Farsi.txt").getPath());

        iterator = farsiFile.iterator();

        while (iterator.hasNext()) {

            // generate first stanza

            lookForTheNextNonEmptyLine()
            if(line.isNumber()) {
                stanza = createNewStanza()
                stanza.no=(++stanzaCounter).toString()
                if(stanza.no != line) throw new Exception("stanza number not in order! " + hymn )


            }else if(line.contains("CHORUS")) {
                stanza = createNewStanza()
                stanza.no="chorus"

            }else if (line.contains("HYMN")) {
                finalizeCurrentHymn()
                createNewHymn()

            } else {
                stanza.text+=line + '<br/>'

                if(stanza.no=='1' && isEmpty(hymn.firstStanzaLine)) {
                    hymn.firstStanzaLine=removeBeginningSymbol(line)
                }
                if(stanza.no=='chorus' && isEmpty(hymn.firstChorusLine)) {
                    hymn.firstChorusLine=removeBeginningSymbol(line)
                }

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

    String removeBeginningSymbol(String targetLine) {
        if("!،.:".contains(targetLine.reverse()[0])) {
            return targetLine.reverse().substring(1).reverse()
        } else {
            return targetLine
        }
    }

    def createNewHymn() {

        stanzaCounter = 0
        stanzaOrderCounter = 0

        hymn=new HymnsEntity();
        if(!line.contains("HYMN: F")) throw new Exception("hymn number not found");
        line = line.replace("HYMN: F","").trim()
        println "hymn: " + line;
        hymn.id="F" + line
        hymn.no=line
        hymn.hymnGroup='F'
        lookForTheNextNonEmptyLine()
        if(!line.contains("SUBJECT:")) throw new Exception("subject not found")
        line = line.replace("SUBJECT:","").trim()
        def splitLine = line.split("–")
        hymn.mainCategory = splitLine[0].trim()
        if(splitLine.size()>1) {
            hymn.subCategory = splitLine[1].trim()
        }
        lookForTheNextNonEmptyLine()
        if(!line.contains("METER:")) throw new Exception("meter not found")
        line = line.replace("METER:","").trim()
        hymn.meter=line

        lookForTheNextNonEmptyLine()
        if(line.contains("VERSES:")) {
            line = line.replace("VERSES:", "").trim()
            hymn.verse = line
            lookForTheNextNonEmptyLine()
        }

        if(!line.contains("AUTHOR:")) throw new Exception("author not found")
        line = line.replace("AUTHOR:","").trim()
        hymn.author=line
        lookForTheNextNonEmptyLine()
        if(!line.contains("COMPOSER:")) throw new Exception("composer not found")
        line = line.replace("COMPOSER:","").trim()
        hymn.composer=line
        lookForTheNextNonEmptyLine()
        if(!line.contains("RELATED:")) throw new Exception("related not found")
        line = line.replace("RELATED:","").trim()
        splitLine = line.split(",")
        splitLine.each {l ->
            if((l.contains("E")) || l.contains("NS") || l.contains("CH")) {
                hymn.parentHymn=l.trim()
            }
        }
        hymn.stanzas = new ArrayList<StanzaEntity>()
        println "******* Start Generating Farsi Hymn ${hymn.id}..."

    }

    StanzaEntity createNewStanza() {
        StanzaEntity stanza = new StanzaEntity()
        stanza.setParentHymn(hymn)
        stanza.text = ''
        stanza.order = ++stanzaOrderCounter
        hymn.stanzas+=stanza

        return stanza
    }

    def lookForTheNextNonEmptyLine() {
        while (iterator.hasNext()) {
            line = iterator.next().trim()
            if(!line.isEmpty()) break
        }
    }

    boolean isEmpty(String s) {
        s==null || s.isEmpty()
    }
}
