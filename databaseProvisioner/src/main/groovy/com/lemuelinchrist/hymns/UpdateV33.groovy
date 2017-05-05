package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 * Created by lemuel on 20/4/2017.
 */
class UpdateV33 {
    // This script tries to fix missing first stanza lines of all hymns.

    public static void main(String[] args) {
//        extractNS544To565();
//        provisionGerman()
//        provisionGermanNonHymns()
//        fixMissingStanzas()
//        fixSongsWithChorusOnly()

    }

    public static void extractNS544To565() {
        println 'hello'
        Dao dao = new Dao();

        for (int x = 544; x<=565; x++) {
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, ""+x, 'NS', ""+x);
            dao.save(hymn);
        }

    }

    public static void fixSongsWithChorusOnly() {
        println 'hello'
        Dao dao = new Dao();
        HymnsEntity hymn;

        for (int x = 533; x<=565; x++) {
            hymn = dao.find("NS"+x);
            boolean hasChorusOnly=true
            for(StanzaEntity stanza:hymn.getStanzas()) {
                if (stanza.no.trim().equals("1")) {
                    hasChorusOnly=false;
                    break;
                }
            }
            if (hasChorusOnly) {

                int stanzaCounter=0
                for(StanzaEntity stanza:hymn.getStanzas()) {
                    if(stanza.no.trim().equals("chorus")){
                        stanza.no=Integer.toString(++stanzaCounter);
                    }
                }
                println(hymn);
                dao.save(hymn)

            }
        }

    }

    public static void fixMissingStanzas() {
        Dao dao = new Dao();
        println "finding all hymns"
        List<HymnsEntity> hymns = dao.findAll("h.firstStanzaLine=null");

        for (HymnsEntity hymn : hymns) {
            if (hymn.firstChorusLine == null) {
                def text = hymn.stanzas[0].text
                text = text.substring(0, text.indexOf("<"))
                println hymn.id + ": extracting - " + text;
                hymn.firstStanzaLine = text
            } else {
                println hymn.id + ": moving firstChorusLine - " + hymn.firstChorusLine;
                hymn.firstStanzaLine = hymn.firstChorusLine;
                hymn.firstChorusLine = null;
            }

            // T635:
            if (hymn.id.equals("T635")) {
                hymn.firstStanzaLine = "Sa winala di sa ’tamo"

            }

            dao.save(hymn);
        }

        //E268
        HymnsEntity hymn = dao.find("E268")
        hymn.firstStanzaLine="How I praise Thee, precious Savior,"
        hymn.stanzas[0].text="How I praise Thee, precious Savior,<br/>That Thy love laid hold of me;<br/>Thou hast saved and cleansed and filled me,<br/>That I might Thy channel be.<br/>"
        dao.save(hymn)
    }

    public static void provisionGerman() {
        File germanFile;

        Dao dao = new Dao();
        germanFile = new File(this.getClass().getResource("/german/German_hymns.txt").getPath());

        Iterator<String> iterator = germanFile.iterator();
        Integer hymnNumber = 0;
        Integer stanzaCounter = 0;
        Integer stanzaOrderCounter = 0;
        HymnsEntity hymn = null;
        StanzaEntity stanza = null;
        StringBuilder stanzaBuilder = null;
        ArrayList<String> hymnsWithMoreThanOneChorus = [];
        HymnsEntity englishHymn;
        boolean skipBlock = false;
        while (iterator.hasNext()) {
            String line = iterator.next().trim();
            if (line.isEmpty()) {
                line = iterator.next().trim();
                if (line.isEmpty()) {
                    // hymn just ended. finalize hymn and prepare a new one

                    // *************** finalizing Hymn ************************************
                    if (hymn != null) {
                        println hymn;
                        dao.save(hymn);
                        dao.addRelatedHymn(hymn.parentHymn, hymn.id);
                    }

                    try {
                        line = iterator.next().trim();
                    } catch (NoSuchElementException e) {
                        break;
                    }
                    String hymnNumberText = iterator.next().trim().replace("*", "").replace("+", "");

                    englishHymn = dao.find("E" + hymnNumberText);
                    println "*****************************************************************************"
                    println hymnNumberText + " " + line;
                    println "No of Chorus: " + englishHymn.getNumberOfChorus();
                    println "*****************************************************************************"

                    hymn = new HymnsEntity();
                    stanza = null;
                    hymn.id = 'G' + hymnNumberText
                    hymn.no = hymnNumberText
                    hymn.hymnGroup = 'G'
                    hymn.stanzas = new ArrayList<StanzaEntity>();
                    hymn.parentHymn = "E" + hymnNumberText;

                    String[] subjects = line.split("–")
                    hymn.mainCategory = subjects[0].trim();
                    if (subjects.size() > 1) {
                        hymn.subCategory = subjects[1];
                    }
                    stanzaCounter = 0;
                    stanzaOrderCounter = 0;
                    if (englishHymn.getNumberOfChorus() > 1) {
                        hymnsWithMoreThanOneChorus += hymnNumberText;
                    }

                } else {


                    stanzaOrderCounter++;
                    stanzaBuilder = new StringBuilder();
                    skipBlock = false;
                    // trying to check whether the new section is a chorus, or stanza, or something else
                    def firstWord = line.substring(0, line.indexOf(" "))

                    if (firstWord.equals("----")) {
                        stanza = new StanzaEntity();
                        stanza.parentHymn = hymn
                        stanza.order = stanzaOrderCounter;
                        hymn.stanzas += stanza;
                        stanza.no = "end-note";
                        stanza.text = line.substring(4).trim() + "<br/>";

                    } else if (firstWord.isNumber()) {
                        stanzaCounter++;
                        def lyric = line.substring(line.indexOf(" "), line.size()).trim();
                        if (firstWord.toInteger() != stanzaCounter) throw new Exception("stanza counter mismatch! firstWord: " + firstWord + " , stanzaCounter: " + stanzaCounter);

                        stanza = new StanzaEntity();
                        stanza.parentHymn = hymn
                        stanza.order = stanzaOrderCounter;
                        stanza.no = firstWord;
                        hymn.stanzas += stanza;
                        stanza.text = lyric + "<br/>";
                        if (stanzaCounter == 1) {
                            hymn.firstStanzaLine = lyric;

                        }

                    } else if (englishHymn.getNumberOfChorus() > 1 || hymn.firstChorusLine == null) {
                        stanza = new StanzaEntity();
                        stanza.parentHymn = hymn
                        stanza.order = stanzaOrderCounter;
                        hymn.stanzas += stanza;
                        stanza.no = "chorus";

                        if (line.trim()[0].equals("(")) {
                            stanza.note = line.trim();
                            line = iterator.next();
                        }
                        stanza.text = line.trim() + "<br/>";
                        if (hymn.firstChorusLine == null) {
                            hymn.firstChorusLine = line.trim().toUpperCase();
                        }


                    } else {
                        skipBlock = true;
                    }
                }

            } else if (!skipBlock) { // if line isn't empty

                if (stanza == null) continue;
                stanza.text += line.trim() + "<br/>"

            }

        } // end of main loop
        println hymnsWithMoreThanOneChorus
    }

    public static void provisionGermanNonHymns() {
        File germanFile;
        String[] parentHymns = ["CS1004", "NS151"]
        Dao dao = new Dao();
        germanFile = new File(this.getClass().getResource("/german/German_non_hymns.txt").getPath());

        Iterator<String> iterator = germanFile.iterator();
        Integer hymnNumber = 0;
        Integer stanzaCounter = 0;
        Integer stanzaOrderCounter = 0;
        HymnsEntity hymn = null;
        StanzaEntity stanza = null;
        StringBuilder stanzaBuilder = null;
        ArrayList<String> hymnsWithMoreThanOneChorus = [];
        HymnsEntity englishHymn;
        boolean skipBlock = false;

        while (iterator.hasNext()) {
            String line = iterator.next().trim();
            if (line.isEmpty()) {
                line = iterator.next().trim();
                if (line.isEmpty()) {
                    // hymn just ended. finalize hymn and prepare a new one

                    // *************** finalizing Hymn ************************************
                    if (hymn != null) {
                        println hymn;
                        dao.save(hymn);
                        dao.addRelatedHymn(hymn.parentHymn, hymn.id);
                    }

                    try {
                        line = iterator.next().trim();
                    } catch (NoSuchElementException e) {
                        break;
                    }
                    String hymnNumberText = iterator.next().trim().replace("*", "").replace("+", "");

                    println "*****************************************************************************"
                    println hymnNumberText + " " + line;
                    println "*****************************************************************************"

                    hymn = new HymnsEntity();
                    stanza = null;
                    hymn.id = 'G' + hymnNumberText
                    hymn.no = hymnNumberText
                    hymn.hymnGroup = 'G'
                    hymn.stanzas = new ArrayList<StanzaEntity>();
                    hymn.parentHymn = parentHymns[hymnNumber++]

                    String[] subjects = line.split("–")
                    hymn.mainCategory = subjects[0].trim();
                    if (subjects.size() > 1) {
                        hymn.subCategory = subjects[1];
                    }
                    stanzaCounter = 0;
                    stanzaOrderCounter = 0;


                } else {


                    stanzaOrderCounter++;
                    stanzaBuilder = new StringBuilder();
                    skipBlock = false;
                    // trying to check whether the new section is a chorus, or stanza, or something else
                    def firstWord = line.substring(0, line.indexOf(" "))


                    if (firstWord.equals("----")) {
                        stanza = new StanzaEntity();
                        stanza.parentHymn = hymn
                        stanza.order = stanzaOrderCounter;
                        hymn.stanzas += stanza;
                        stanza.no = "end-note";
                        stanza.text = line.substring(4).trim() + "<br/>";

                    } else if (firstWord.isNumber()) {
                        stanzaCounter++;
                        def lyric = line.substring(line.indexOf(" "), line.size()).trim();
                        if (firstWord.toInteger() != stanzaCounter) throw new Exception("stanza counter mismatch! firstWord: " + firstWord + " , stanzaCounter: " + stanzaCounter);

                        stanza = new StanzaEntity();
                        stanza.parentHymn = hymn
                        stanza.order = stanzaOrderCounter;
                        stanza.no = firstWord;
                        hymn.stanzas += stanza;
                        stanza.text = lyric + "<br/>";
                        if (stanzaCounter == 1) {
                            hymn.firstStanzaLine = lyric;

                        }

                    }
                }

            } else if (!skipBlock) { // if line isn't empty

                if (stanza == null) continue;
                stanza.text += line.trim() + "<br/>"

            }

        } // end of main loop
        println hymnsWithMoreThanOneChorus
    }
}
