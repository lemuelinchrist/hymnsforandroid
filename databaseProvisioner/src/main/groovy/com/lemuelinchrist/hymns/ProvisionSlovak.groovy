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
class ProvisionSlovak {
    static File slovakFile;
    Integer stanzaCounter = 0;
    Integer stanzaOrderCounter=0;
    String line
    Iterator<String> iterator
    Integer hymnNumber = 0;
    HymnsEntity hymn=null;
    StanzaEntity stanza=null;
    StringBuilder stanzaBuilder=null
    int ssNo=1;
    List<String> anomalies = new ArrayList<>();
    private Dao dao = new Dao()
    String videoLink=null
    String soundcloudLink=null


    public static void main(String[] args) {
        def slovak = new ProvisionSlovak();
        slovak.provision();
//        spanish.removeSpanishHymns()

        println "end!!!!!"
    }

    void removeSpanishHymns() {
        for(int x=1001;x<=1349;x++) {
            dao.delete("SK"+x)
        }
    }


    void provision() throws Exception {
        slovakFile = new File(this.getClass().getResource("/2024_02HymnsSK_final_proof06.txt").getPath());

        iterator = slovakFile.iterator();

        while (iterator.hasNext()) {

            line = iterator.next().trim();
            if(line.isNumber() || line.split("\\.")[0].isNumber() || line.contains("CHORUS")) {
                createNewStanza()

            } else if (line.matches('^HYMN:.*')) {
                wrapup()
                createNewHymn()
            } else if(line.contains("**end**")) {
                wrapup()
            } else if(!line.isEmpty()) {

                stanza.text+=line+"<br/>"
            }

        }

        println("anomalies: ")
        for(String anomaly: anomalies) {
            println(anomaly)
        }
    }

    def wrapup() {
        if(hymn==null) return

        if(hymn.getStanzas().size()==1 && hymn.getStanzas().get(0).getNo().equalsIgnoreCase("chorus")) {
            hymn.getStanzas().get(0).no=1;
        }

//        for(StanzaEntity firstStanza: hymn.getStanzas()) {
//            if(firstStanza.no.equals("1")) {
//                hymn.firstStanzaLine = firstStanza.text.substring(0,firstStanza.text.indexOf("<"))
//                break
//            }
//        }
//        for(StanzaEntity firstChorus: hymn.getStanzas()) {
//            if(firstChorus.no.contains("chorus")) {
//                hymn.firstChorusLine = firstChorus.text.substring(0,firstChorus.text.indexOf("<")).toUpperCase()
//                break
//            }
//        }

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
//        if (line.replaceAll('[^0-9]','') != Integer.toString(ssNo++)) {
//            throw new Exception("Hymn numbers in text file not in sequence!! no. " + (ssNo-1) )
//        }
        if(!line.trim().matches(".*SK\\d+\$")) {
            anomalies.add("Hymn number doesn't follow format: " + line)
        }
        hymnNumber = Integer.parseInt( line.replaceAll('[^0-9]',''));
        println "******* Generating Slovak Hymn ${hymnNumber}..."
        hymn = new HymnsEntity();
        hymn.id = line.substring(line.indexOf(":") + 1).trim()
        hymn.no = hymnNumber.toString()
        hymn.hymnGroup = 'SK'
        hymn.stanzas = new ArrayList<StanzaEntity>();
        stanzaCounter = 0
        stanzaOrderCounter = 0

        String nextText;
        while (true) {
            nextText = iterator.next().trim()
            if (nextText.toLowerCase().contains("subject:")) {
                nextText = nextText.substring(nextText.indexOf(":") + 1).trim()
                String[] subjectArray = nextText.split("–|-")
                hymn.setMainCategory(subjectArray[0].trim())
                if (subjectArray.size() > 1) {
                    hymn.setSubCategory(subjectArray[1].trim())
                } else {
                    hymn.setSubCategory("")
                }

            } else if (nextText.toLowerCase().contains("related:")) {
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
            } else if (nextText.toLowerCase().contains("meter:")) {
                hymn.meter = nextText.substring(nextText.indexOf(":") + 1).trim()
                if(hymn.meter.isEmpty()) hymn.meter=null;
            } else if (nextText.toLowerCase().contains("verse:")) {
                hymn.verse = nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.toLowerCase().contains("music soundcloud:")) {
                soundcloudLink=nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.toLowerCase().contains("soundcloud:")) {
                soundcloudLink=nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.toLowerCase().contains("video:")) {
                videoLink=nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.toLowerCase().contains("hymn code:")) {
                hymn.tune = nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.toLowerCase().contains("tune on hymnalnet:")) {
                hymn.tune = nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if(nextText.toLowerCase().contains("author")) {
                hymn.author = nextText.substring(nextText.indexOf(":") + 1).trim()
                if(hymn.author.isEmpty()) hymn.author=null;
            } else if(nextText.toLowerCase().contains("composer")) {
                hymn.composer = nextText.substring(nextText.indexOf(":") + 1).trim()
                if(hymn.composer.isEmpty()) hymn.composer=null;
            } else if(nextText.toLowerCase().contains("first line stanza")) {
                hymn.firstStanzaLine = nextText.substring(nextText.indexOf(":") + 1)
                        .replaceAll("<",'').replaceAll(">",'').trim()
                if(hymn.firstStanzaLine.isEmpty()) hymn.firstStanzaLine=null
            } else if(nextText.toLowerCase().contains("first line chorus")) {
                hymn.firstChorusLine = nextText.substring(nextText.indexOf(":") + 1)
                        .replaceAll("<",'').replaceAll(">",'').toUpperCase().trim()
                if(hymn.firstChorusLine.isEmpty()) hymn.firstChorusLine=null
            } else if (nextText.toLowerCase().matches('^[0-9]+$')) {
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
            if(!line.contains("CHORUS")) {
                def error = "Problem stanza in " + hymn.id + ". The first line is supposed to be marked as CHORUS or a stanza no: " + line
//                throw new Exception(error)
                anomalies.add(error)
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
