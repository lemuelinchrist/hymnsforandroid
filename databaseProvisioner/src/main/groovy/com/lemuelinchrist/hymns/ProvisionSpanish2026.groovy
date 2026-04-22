package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 *
 * @author Lemuel Cantos
 * @since 2026-04-02
 *
 */
class ProvisionSpanish2026 {
    static File spanishFile;
    Integer stanzaCounter = 0;
    Integer stanzaOrderCounter=0;
    String line
    Iterator<String> iterator
    HymnsEntity hymn=null;
    StanzaEntity stanza=null;
    StringBuilder stanzaBuilder=null
    int ssNo=1;
    Set<String> anomalies = new HashSet<>();
    private Dao dao = new Dao()
    String videoLink=null
    String soundcloudLink=null


    public static void main(String[] args) {
        def spanish = new ProvisionSpanish2026();
        spanish.removeSpanishHymns()
        spanish.provision();

        println "end!!!!!"
    }

    void removeSpanishHymns() {
        for(int x=1;x<=800;x++) {
            dao.delete("S"+x)
        }
    }


    void provision() throws Exception {
        spanishFile = new File(this.getClass().getResource("/Spanish2026.txt").getPath());

        iterator = spanishFile.iterator();

        while (iterator.hasNext()) {

            line = iterator.next().trim();
            if(line.isNumber() || line.split("\\.")[0].isNumber() || (line.matches(".*\\bCoro\\b.*")
                    && !line.contains("Coro parte"))   ) {
                createNewStanza()

            } else if (line.matches('^S-.*')) {
                wrapup()
                createNewHymn()
            } else if (line.startsWith("End-note:")) {
                createNewNote()
            } else if(line.contains("**end**")) {
                wrapup()
            } else if(!line.isEmpty()) {

                stanza.text+=line+"<br/>"
            }

        }
        wrapup()

        println("anomalies: " + anomalies.toString())
    }

    def createNewNote() {
        stanza = new StanzaEntity()
        stanza.setNo("note")
        stanza.setParentHymn(hymn)
        stanza.text=""
        stanza.order= ++stanzaOrderCounter
        hymn.getStanzas().add(stanza)
        return stanza
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
        ssNo=Integer.parseInt(line.replaceAll('[^0-9]',''))
        println "******* Generating Spanish 2026 Hymn ${ssNo}..."
        hymn = new HymnsEntity();
        hymn.id = 'S' + ssNo
        hymn.no = ssNo.toString()
        hymn.hymnGroup = 'S'
        hymn.stanzas = new ArrayList<StanzaEntity>();
        stanzaCounter = 0
        stanzaOrderCounter = 0

        String nextText;
        while (true) {
            if (!iterator.hasNext()) break;
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
                anomalies.add(hymn.id)
            }
        } else {
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
