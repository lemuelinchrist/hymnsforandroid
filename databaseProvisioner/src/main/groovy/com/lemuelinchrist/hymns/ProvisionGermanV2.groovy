package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 *
 * @author Lemuel Cantos
 * @since 21/10/2018
 *
 */
class ProvisionGermanV2 {
    static File germanFile;
    Integer stanzaCounter = 0;
    Integer stanzaOrderCounter=0;
    String line
    Iterator<String> iterator
    Integer hymnNumber = 0;
    HymnsEntity hymn=null;
    StanzaEntity stanza=null;
    StringBuilder stanzaBuilder=null;


    public static void main(String[] args) {
        def german = new ProvisionGermanV2();
        german.provision();

        println "end!!!!!"
    }

    void removeGermanHymns() {

    }


    void provision() throws Exception {
//        Dao dao = new Dao();
        germanFile = new File(this.getClass().getResource("/german/New_German_hymns.txt").getPath());

        iterator = germanFile.iterator();

        while (iterator.hasNext()) {

            line = iterator.next().trim();
            if(line.isEmpty()) {
                line = iterator.next().trim();
                if (line.matches('G\\d*')) {
                    wrapup()
                    createNewHymn()

                } else if(line.isEmpty()) {
                    wrapup()
                    break
                } else {
                    createNewStanza()

                }

            }
             else {

                stanza.text+=line+"<br/>"
            }

        }

    }

    def wrapup() {
        if(hymn==null) return
        for(StanzaEntity firstStanza: hymn.getStanzas()) {
            if(firstStanza.no.equals("1")) {
                hymn.firstStanzaLine = firstStanza.text.substring(0,firstStanza.text.indexOf("<"))
                break
            }
        }
        for(StanzaEntity firstChorus: hymn.getStanzas()) {
            if(firstChorus.no.contains("chorus")) {
                hymn.firstChorusLine = firstChorus.text.substring(0,firstChorus.text.indexOf("<")).toUpperCase()
                break
            }
        }

        println hymn
    }

    def createNewHymn() {
        if (line != "G" + ++hymnNumber) {
            throw new Exception("Hymn numbers in text file not in sequence!!")
        }
        println "******* Generating German Hymn ${hymnNumber}..."
        hymn = new HymnsEntity();
        hymn.id = 'G' + hymnNumber
        hymn.no = hymnNumber.toString()
        hymn.hymnGroup = 'G'
        hymn.stanzas = new ArrayList<StanzaEntity>();
        stanzaCounter = 0
        stanzaOrderCounter = 0

        String nextText;
        while (true) {
            nextText = iterator.next().trim()
            if (nextText.contains("Subject:")) {
                nextText = nextText.substring(nextText.indexOf(":") + 1).trim()
                String[] subjectArray = nextText.split("–")
                hymn.setMainCategory(subjectArray[0].trim())
                if (subjectArray.size() > 1) {
                    hymn.setSubCategory(subjectArray[1].trim())
                }

            } else if (nextText.contains("Related:")) {
                nextText = nextText.substring(nextText.indexOf(":") + 1).trim()
                hymn.setRelatedString(nextText.replace(" ", ""))
                String[] relatedArray = nextText.split(",")
                for (String oneRelated : relatedArray) {
                    if (oneRelated.contains("E")) {
                        hymn.parentHymn = oneRelated.replace(" ", "")
                    }
                }
            } else if (nextText.contains("Meter: ")) {
                hymn.meter = nextText.substring(nextText.indexOf(":") + 1)
            } else if (nextText.contains("Reference:")) {
                hymn.verse = nextText.substring(nextText.indexOf(":") + 1)
            } else if (nextText.isEmpty()) {
                line = iterator.next().trim();
                stanza = createNewStanza()
                break

            } else {
                throw new Exception("Can't make out text content: " + nextText)
            }

        }

    }

    StanzaEntity createNewStanza() {

        if(line.isNumber()) {
            stanzaCounter++
            if(Integer.parseInt(line)!=stanzaCounter) {
                throw new Exception("stanza numbering not followed: " + line)
            }
        } else {
            if(!line.contains("Chorus:")) {
                throw new Exception("Cant make out line. supposed to be chorus or stanza no: " +line)
            }
            line="chorus"
        }


        stanza = new StanzaEntity()
        stanza.setNo(line)
        stanza.setParentHymn(hymn)
        stanza.text=""
        stanza.order= ++stanzaOrderCounter
        hymn.getStanzas().add(stanza)
        return stanza
    }
}
