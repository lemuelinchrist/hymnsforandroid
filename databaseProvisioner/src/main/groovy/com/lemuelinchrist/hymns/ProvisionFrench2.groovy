package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 *
 * @author Lemuel Cantos
 *
 */
class ProvisionFrench2 {
    static File frenchFile;
    static final GROUP_ID="FR";
    static final CHORUS_WORD="Refrain";
    Integer stanzaCounter = 0;
    Integer stanzaOrderCounter=0;
    String line
    Iterator<String> iterator
    Integer hymnNumber = 215;
    HymnsEntity hymn=null;
    StanzaEntity stanza=null;
    StringBuilder stanzaBuilder=null
    int ssNo=216;
    Set<Integer> anomalies = new HashSet<>();
    private Dao dao = new Dao()
    String videoLink=null
    String soundcloudLink=null


    public static void main(String[] args) {
        def french = new ProvisionFrench2();
        french.provision();
//        french.removefrenchHymns()

        println "end!!!!!"
    }

    void removefrenchHymns() {
        for(int x=216;x<=248;x++) {
            dao.delete(GROUP_ID+x)
        }
    }


    void provision() throws Exception {
        frenchFile = new File(this.getClass().getResource("/french2.txt").getPath());

        iterator = frenchFile.iterator();

        while (iterator.hasNext()) {

            line = iterator.next().trim();
            if(line.isNumber() || line.split("\\.")[0].isNumber() || line.contains(CHORUS_WORD)) {
                createNewStanza()

            } else if (line.matches('^'+GROUP_ID+'-.*')) {
                wrapup()
                createNewHymn()
            } else if(line.contains("**end**")) {
                wrapup()
            } else if(!line.isEmpty()) {

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

        // save video and soundcloud links
        if(videoLink!=null) {
            stanza = new StanzaEntity()
            stanza.setNo("YouTube Link")
            stanza.setParentHymn(hymn)
            stanza.text = videoLink
            stanza.order = ++stanzaOrderCounter
            hymn.getStanzas().add(stanza)

            videoLink=null
        }
        if(soundcloudLink!=null) {
            stanza = new StanzaEntity()
            stanza.setNo("SoundCloud Link")
            stanza.setParentHymn(hymn)
            stanza.text = soundcloudLink
            stanza.order = ++stanzaOrderCounter
            hymn.getStanzas().add(stanza)

            soundcloudLink=null
        }

        println hymn
        dao.save(hymn)
    }

    def createNewHymn() {
        if (line.replaceAll('[^0-9]','') != Integer.toString(ssNo++)) {
            throw new Exception("Hymn numbers in text file not in sequence!! no. " + (ssNo-1) )
        }
        hymnNumber++;
        println "******* Generating french Hymn ${hymnNumber}..."
        hymn = new HymnsEntity();
        hymn.id = GROUP_ID + hymnNumber
        hymn.no = hymnNumber.toString()
        hymn.hymnGroup = GROUP_ID
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
                hymn.setRelatedString(nextText.replace(" ", "")
                        .replace(";", ","))
                for (String oneRelated : hymn.getRelated()) {
                    if (oneRelated.contains("E") || oneRelated.contains("NS") || oneRelated.contains("BF")) {
                        if(hymn.parentHymn==null || hymn.parentHymn == "BF") { // BF has least priority
                            hymn.parentHymn = oneRelated.replace(" ", "")
                        }
                    }
                }
            } else if (nextText.contains("Meter:")) {
                hymn.meter = nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.contains("Verses:")) {
                hymn.verse = nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.toLowerCase().contains("music soundcloud:")) {
                soundcloudLink=nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.toLowerCase().contains("soundcloud:")) {
                soundcloudLink=nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.toLowerCase().contains("video:")) {
                videoLink=nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.toLowerCase().contains("hymn code hymnalnet:")) {
                hymn.tune = nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.toLowerCase().contains("tune on hymnalnet:")) {
                hymn.tune = nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.matches('^[0-9]+$')) {
                line = nextText;
                stanza = createNewStanza()
                break

            } else if(nextText.isEmpty()) {
                continue
            } else {
//                throw new Exception("Can't make out text content: " + nextText)
                line = nextText;
                stanza = createNewStanza()
                break
            }

        }

    }

    StanzaEntity createNewStanza() {
        String no = line.split("\\.")[0];
        if(no.isNumber()) {
            stanzaCounter++
            if(Integer.parseInt(no)!=stanzaCounter) {
                throw new Exception("stanza numbering not followed: " + no)
                anomalies.add(hymn.id)
            }
        } else {
            if(!line.contains(CHORUS_WORD)) {
                throw new Exception("Cant make out line. supposed to be chorus or stanza no: " +line)
            }

            no="chorus"
        }


        stanza = new StanzaEntity()
        stanza.setNo(no)
        stanza.setParentHymn(hymn)
        stanza.text=""
        stanza.order= ++stanzaOrderCounter
        hymn.getStanzas().add(stanza)
        return stanza
    }
}
