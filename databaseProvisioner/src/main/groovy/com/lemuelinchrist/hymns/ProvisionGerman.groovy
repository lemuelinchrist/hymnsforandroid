package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 * Created by lemuel on 8/4/2017.
 */
class ProvisionGerman {
    static File germanFile;
    static File spanishRelatedFile;

    public static void main(String[] args) throws Exception {
        Dao dao = new Dao();
        germanFile = new File(this.getClass().getResource("/german/German_hymns.txt").getPath());

        Iterator<String> iterator = germanFile.iterator();
        Integer hymnNumber = 0;
        Integer stanzaCounter = 0;
        Integer stanzaOrderCounter=0;
        HymnsEntity hymn=null;
        StanzaEntity stanza=null;
        StringBuilder stanzaBuilder=null;
        ArrayList<String> hymnsWithMoreThanOneChorus= [];
        HymnsEntity englishHymn;
        boolean skipBlock=false;
        while (iterator.hasNext()) {
            String line = iterator.next().trim();
            if(line.isEmpty()) {
                line = iterator.next().trim();
                if(line.isEmpty()) {
                    // hymn just ended. finalize hymn and prepare a new one

                    // *************** finalizing Hymn ************************************
                    if(hymn!=null) {
                        println hymn;
                        dao.save(hymn);
                        dao.addRelatedHymn(hymn.parentHymn, hymn.id);
                    }

                    try {
                        line = iterator.next().trim();
                    } catch (NoSuchElementException e) {
                        break;
                    }
                    String hymnNumberText = iterator.next().trim().replace("*","").replace("+","");

                    englishHymn = dao.find("E"+hymnNumberText);
                    println "*****************************************************************************"
                    println hymnNumberText + " " + line;
                    println "No of Chorus: " + englishHymn.getNumberOfChorus();
                    println "*****************************************************************************"

                    hymn=new HymnsEntity();
                    stanza=null;
                    hymn.id='G'+hymnNumberText
                    hymn.no=hymnNumberText
                    hymn.hymnGroup='G'
                    hymn.stanzas=new ArrayList<StanzaEntity>();
                    hymn.parentHymn="E"+hymnNumberText;

                    String[] subjects = line.split("–")
                    hymn.mainCategory=subjects[0].trim();
                    if (subjects.size()>1) {
                        hymn.subCategory = subjects[1];
                    }
                    stanzaCounter=0;
                    stanzaOrderCounter=0;
                    if (englishHymn.getNumberOfChorus() > 1 ) {
                        hymnsWithMoreThanOneChorus+=hymnNumberText;
                    }

                } else {


                    stanzaOrderCounter++;
                    stanzaBuilder=new StringBuilder();
                    skipBlock=false;
                    // trying to check whether the new section is a chorus, or stanza, or something else
                    def firstWord =  line.substring(0,line.indexOf(" "))


                    if (firstWord.isNumber()) {
                        stanzaCounter++;
                        def lyric = line.substring(line.indexOf(" "), line.size()).trim();
                        if (firstWord.toInteger() != stanzaCounter) throw new Exception("stanza counter mismatch! firstWord: " + firstWord + " , stanzaCounter: " + stanzaCounter);

                        stanza=new StanzaEntity();
                        stanza.parentHymn=hymn
                        stanza.order=stanzaOrderCounter;
                        stanza.no=firstWord;
                        hymn.stanzas+=stanza;
                        stanza.text=lyric + "<br/>";
                        if (stanzaCounter==1) {
                            hymn.firstStanzaLine=lyric;

                        }

                    } else if ( englishHymn.getNumberOfChorus() > 1 || hymn.firstChorusLine==null ){
                        stanza=new StanzaEntity();
                        stanza.parentHymn=hymn
                        stanza.order=stanzaOrderCounter;
                        hymn.stanzas+=stanza;
                        stanza.no="chorus";
                        stanza.text=line.trim()+"<br/>";
                        if (hymn.firstChorusLine==null) {
                            hymn.firstChorusLine=line.trim().toUpperCase();
                        }


                    } else {
                        skipBlock=true;
                    }
                }

            } else if (!skipBlock) { // if line isn't empty

                if (stanza == null) continue;
                stanza.text+= line.trim() + "<br/>"

            }

        } // end of main loop
        println hymnsWithMoreThanOneChorus

    }

}
