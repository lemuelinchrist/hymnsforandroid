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

    public static void main(String[] args) {
        def german = new ProvisionGermanV2();
        german.provision();
    }

    void provision() throws Exception {
        Dao dao = new Dao();
        germanFile = new File(this.getClass().getResource("/german/New_German_hymns.txt").getPath());

        Iterator<String> iterator = germanFile.iterator();
        Integer hymnNumber = 0;
        Integer stanzaCounter = 0;
        Integer stanzaOrderCounter=0;
        HymnsEntity hymn=null;
        StanzaEntity stanza=null;
        StringBuilder stanzaBuilder=null;
        while (iterator.hasNext()) {

            String line = iterator.next().trim();
            if (line.matches('G\\d*')) {
                if(line!="G" + ++hymnNumber) {
                    throw new Exception("Hymn numbers in text file not in sequence!!")
                }
                println "******* Generating German Hymn ${hymnNumber}..."
                hymn=new HymnsEntity();
                hymn.id='G'+hymnNumber
                hymn.no=hymnNumber.toString()
                hymn.hymnGroup='G'
                hymn.stanzas=new ArrayList<StanzaEntity>();
                stanzaCounter=0;
                stanzaOrderCounter=0;

                String nextText;
                while(true) {
                    nextText=iterator.next().trim()
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
                    } else if(nextText.contains("Reference:")) {
                        hymn.verse =nextText.substring(nextText.indexOf(":") + 1)
                    } else if (nextText.isEmpty()){
                        break

                    } else {
                        throw new Exception("Can't make out text content: " + nextText)
                    }



                }

                println hymn

            }

//            if(line.isEmpty()) {
//                line = iterator.next().trim();
//                if (line.isEmpty()) {
//                    // finalize current hymn before iterating
//                    if (hymnNumber!=0) {
//                        println "Hymn conversion done! : "
//                        println hymn;
//                        dao.save(hymn);
//                        dao.addRelatedHymn(hymn.parentHymn, hymn.id);
//                    }
//
//                    hymnNumber++;
//                    if (hymnNumber==501) break;
//
//                    line = iterator.next().trim();
//                    if(!line.equals(hymnNumber+".")) {
//                        throw new RuntimeException("Missing Hymn: " + hymnNumber);
//                    }
//

//
//                    def related = relatedIterator.next().trim();
//                    if (related.isEmpty()) {
//                        hymn.parentHymn=null
//                    } else if (!related[0].equals("C") && !related[0].equals("N")) {
//                        // english
//                        hymn.parentHymn="E"+related
//                    } else {
//                        // chinese and new songs
//                        hymn.parentHymn = related;
//                    }
//
//
//
//                } else if (line.toLowerCase().contains("coro:")) {
//                    line = iterator.next().trim();
//                    if (line.isEmpty()) throw new RuntimeException("blank line after chorus");
//
//                    stanza=new StanzaEntity();
//                    stanza.parentHymn=hymn;
//                    hymn.stanzas.add(stanza);
//                    stanza.no="chorus";
//                    stanza.order=++stanzaOrderCounter;
//
//                    stanza.text = line + "<br/>"
//                    if (hymn.firstChorusLine==null || hymn.firstChorusLine.isEmpty()) {
//                        hymn.firstChorusLine = line.toUpperCase();
//                    }
//
//                } else if(!line[0].isInteger() && !line[0].equals('(') && !line[0].equals('+')) {
//                    throw new RuntimeException("Invalid start of stanza");
//                } else if(line[0].isInteger()) {
//
//                    stanza=new StanzaEntity();
//                    stanza.parentHymn=hymn;
//                    hymn.stanzas.add(stanza);
//                    stanza.no=++stanzaCounter;
//                    stanza.order=++stanzaOrderCounter;
//                    if (!line.contains(""+stanzaCounter)) {
//                        throw new RuntimeException("wrong stanza number! "+ line)
//                    }
//                    def stanzaCounterDigitCount = stanzaCounter.toString().length()
//                    stanza.text = line.substring(stanzaCounterDigitCount).trim() + "<br/>"
//                    if (stanza.no.equals("1")) {
//                        hymn.firstStanzaLine = line.substring(stanzaCounterDigitCount).trim();
//                    }
//
//
//                } else if(line[0].equals('(') || line[0].equals('+')) {
//                    stanza=new StanzaEntity();
//                    stanza.parentHymn=hymn;
//                    hymn.stanzas.add(stanza);
//                    stanza.no="end-note";
//                    stanza.order=++stanzaOrderCounter;
//
//                    stanza.text = line + "<br/>"
//                }
//
//            } else { // if line isn't empty
//                stanza.text+=line+"<br/>"
//            }

        }

    }
}
