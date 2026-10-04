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
    Integer hymnNumber = 1000;
    HymnsEntity hymn=null;
    StanzaEntity stanza=null;
    StringBuilder stanzaBuilder=null
    private Dao dao = new Dao()


    public static void main(String[] args) {
        def german = new ProvisionGermanV2();
        german.removeGermanHymns()
        // Main German hymnal (G1-G460)
        german.provision("/german/New_German_hymns.txt", 0)
        // German new hymns (G1001-G1020)
        german.provision("/german/GermanNewHymn_2019Dec.txt", 1000)
        println "end!!!!!"
    }

    void removeGermanHymns() {
        for(int x=1;x<=1336;x++) {
            dao.delete("G"+x)
        }
    }


    void provision(String resource, Integer startNumber) throws Exception {
        germanFile = new File(this.getClass().getResource(resource).getPath());
        hymnNumber = startNumber
        hymn = null

        iterator = germanFile.iterator();

        while (iterator.hasNext()) {

            line = iterator.next().trim();
            if (hymn == null && line.matches('G\\d+')) {
                // first hymn header with no blank line before it (start of file)
                createNewHymn()
            } else if(line.isEmpty()) {
                if (!iterator.hasNext()) {
                    wrapup()
                    break
                }
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

            if (!iterator.hasNext()) {
                wrapup()
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
        dao.save(hymn)
        hymn = null
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
                // en dash is the standard separator; also accept " - "
                String[] subjectArray = nextText.split("–| - ", 2)
                hymn.setMainCategory(subjectArray[0].trim())
                if (subjectArray.size() > 1) {
                    hymn.setSubCategory(subjectArray[1].trim())
                }

            } else if (nextText.contains("Related:")) {
                nextText = nextText.substring(nextText.indexOf(":") + 1).trim()
                // Drop "R" (Russian) references: the app has no Russian hymns
                List<String> relatedList = nextText.split(",")
                        .collect { it.replace(" ", "") }
                        .findAll { !it.isEmpty() && !it.startsWith("R") }
                hymn.setRelatedString(relatedList.join(","))
                for (String oneRelated : relatedList) {
                    if (oneRelated.startsWith("E")) {
                        hymn.parentHymn = oneRelated
                    }
                }
            } else if (nextText.contains("Meter: ")) {
                hymn.meter = nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.contains("Reference:")) {
                hymn.verse = nextText.substring(nextText.indexOf(":") + 1).trim()
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
