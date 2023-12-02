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
class ProvisionGermanYouth {
    static File germanFile;
    Integer stanzaCounter = 0;
    Integer stanzaOrderCounter=0;
    String line
    Iterator<String> iterator
    Integer hymnNumber = 2000;
    HymnsEntity hymn=null;
    StanzaEntity stanza=null;
    StringBuilder stanzaBuilder=null
    int ypg=1;
    Set<Integer> anomalies = new HashSet<>();
    private Dao dao = new Dao()


    public static void main(String[] args) {
        def german = new ProvisionGermanYouth();
        german.provision();
//        german.removeGermanHymns()
        println "end!!!!!"
    }

    void removeGermanHymns() {
        for(int x=2001;x<=2271;x++) {
            dao.delete("G"+x)
        }
    }


    void provision() throws Exception {
//        germanFile = new File(this.getClass().getResource("/german/New_German_hymns.txt").getPath());
        germanFile = new File(this.getClass().getResource("/german/GermanYPsongs_v2.txt").getPath());

        iterator = germanFile.iterator();

        while (iterator.hasNext()) {

            line = iterator.next().trim();
            if(line.isNumber()) {
                createNewStanza(false)

            } else if (line.matches('^YPG.*')) {
                wrapup()
                createNewHymn()
            } else if(line.contains("**end**")) {
                wrapup()
            } else if(!line.isEmpty()){

                stanza.text+=line+"<br/>"
            }

        }

        println("anomalies: " + anomalies.toString())
    }

    def wrapup() {
        if(hymn==null) return

        if(hymn.getStanzas().size()==1 && hymn.getStanzas().get(0).getNo().equalsIgnoreCase("chorus")) {
            hymn.getStanzas().get(0).no=1;
        }

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
    }

    def createNewHymn() {
        if (line.replaceAll('[^0-9]','') != Integer.toString(ypg++)) {
            throw new Exception("Hymn numbers in text file not in sequence!! no. " + (ypg-1) )
        }
        hymnNumber++;
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
            } else if (nextText.contains("Meter:")) {
                hymn.meter = nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.contains("Verses:")) {
                hymn.verse = nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.matches('^[0-9]+$')) {
                line = nextText;
                stanza = createNewStanza(false)
                break

            } else if(nextText.isEmpty()) {
                continue
            } else {
//                throw new Exception("Can't make out text content: " + nextText)
                line = nextText;
                stanza = createNewStanza(true)
                break
            }

        }

    }

    StanzaEntity createNewStanza(boolean isFirstLineLyric) {
        String no = line;
        if(line.isNumber()) {
            stanzaCounter++
            if(Integer.parseInt(line)!=stanzaCounter) {
//                throw new Exception("stanza numbering not followed: " + line)
                anomalies.add(hymn.id)
            }
        } else {
//            if(!line.contains("chorus")) {
//                throw new Exception("Cant make out line. supposed to be chorus or stanza no: " +line)
//            }

            no="chorus"
        }


        stanza = new StanzaEntity()
        stanza.setNo(no)
        stanza.setParentHymn(hymn)
        if(isFirstLineLyric) {
            stanza.text=line.trim() + "<br/>"
        } else {
            stanza.text=""
        }
        stanza.order= ++stanzaOrderCounter
        hymn.getStanzas().add(stanza)
        return stanza
    }
}
