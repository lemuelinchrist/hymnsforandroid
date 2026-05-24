package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 *
 * @author Antigravity CLI
 * @since 2026-05-21
 *
 */
class ProvisionGreek {
    static File greekFile;
    Integer stanzaCounter = 0;
    Integer stanzaOrderCounter = 0;
    String line
    Iterator<String> iterator
    HymnsEntity hymn = null;
    StanzaEntity stanza = null;
    int gkNo = 1;
    Set<String> anomalies = new HashSet<>();
    private Dao dao = new Dao()

    public static void main(String[] args) {
        def greek = new ProvisionGreek();
        greek.removeGreekHymns()
        greek.provision();

        println "Greek import finished!!!!!"
    }

    void removeGreekHymns() {
        println "Cleaning up existing Greek hymns..."
        for (int x = 1; x <= 500; x++) {
            dao.delete("GK" + x)
        }
    }

    void provision() throws Exception {
        greekFile = new File(this.getClass().getResource("/GreekHymnal1-124_formatted.txt").getPath());
        println "Reading from: ${greekFile.path}"

        iterator = greekFile.iterator();

        while (iterator.hasNext()) {
            line = iterator.next().trim();
            if (line.isNumber() || (line.matches(".*Coro.*") && !line.contains("Coro parte"))) {
                createNewStanza()
            } else if (line.startsWith('GK-')) {
                wrapup()
                createNewHymn()
            } else if (line.contains("**end**")) {
                wrapup()
            } else if (!line.isEmpty()) {
                if (stanza != null) {
                    stanza.text += line + "<br/>"
                }
            }
        }
        wrapup()

        println("Anomalies found: " + anomalies.toString())
    }

    def wrapup() {
        if (hymn == null) return

        // If only one stanza and it's a chorus, change it to 1
        if (hymn.getStanzas().size() == 1 && hymn.getStanzas().get(0).getNo().equalsIgnoreCase("chorus")) {
            hymn.getStanzas().get(0).no = "1";
        }

        // Set search index lines
        for (StanzaEntity s : hymn.getStanzas()) {
            if (s.no.equals("1")) {
                if (s.text.contains("<br/>")) {
                    hymn.firstStanzaLine = s.text.substring(0, s.text.indexOf("<br/>"))
                } else {
                    hymn.firstStanzaLine = s.text
                }
            }
            if (s.no.contains("chorus")) {
                if (s.text.contains("<br/>")) {
                    hymn.firstChorusLine = s.text.substring(0, s.text.indexOf("<br/>")).toUpperCase()
                } else {
                    hymn.firstChorusLine = s.text.toUpperCase()
                }
            }
        }
        
        // Final fallback for search index if no "1" stanza was found
        if (hymn.firstStanzaLine == null && !hymn.getStanzas().isEmpty()) {
            String firstText = hymn.getStanzas().get(0).text
            if (firstText.contains("<br/>")) {
                hymn.firstStanzaLine = firstText.substring(0, firstText.indexOf("<br/>"))
            } else {
                hymn.firstStanzaLine = firstText
            }
        }

        println hymn
        dao.save(hymn)
        hymn = null // Reset for next
    }

    def createNewHymn() {
        gkNo = Integer.parseInt(line.replaceAll('[^0-9]', ''))
        println "******* Generating Greek Hymn ${gkNo}..."
        hymn = new HymnsEntity();
        hymn.id = 'GK' + gkNo
        hymn.no = gkNo.toString()
        hymn.hymnGroup = 'GK'
        hymn.stanzas = new ArrayList<StanzaEntity>();
        stanzaCounter = 0
        stanzaOrderCounter = 0

        String nextText;
        while (iterator.hasNext()) {
            nextText = iterator.next().trim()
            if (nextText.startsWith("Subject:")) {
                hymn.setMainCategory(nextText.substring(nextText.indexOf(":") + 1).trim())
            } else if (nextText.startsWith("Related:")) {
                hymn.setRelatedString(nextText.substring(nextText.indexOf(":") + 1).trim())
            } else if (nextText.startsWith("Parent:")) {
                hymn.parentHymn = nextText.substring(nextText.indexOf(":") + 1).trim()
            } else if (nextText.isNumber()) {
                line = nextText
                createNewStanza()
                break
            } else if (nextText.matches(".*Coro.*")) {
                line = nextText
                createNewStanza()
                break
            } else if (nextText.isEmpty()) {
                continue
            } else {
                // Unexpected text, assume start of stanza 1 if we haven't started yet
                line = "1"
                createNewStanza()
                stanza.text += nextText + "<br/>"
                break
            }
        }
    }

    StanzaEntity createNewStanza() {
        String no = line.split("\\.")[0];
        if (no.isNumber()) {
            stanzaCounter++
            if (Integer.parseInt(no) != stanzaCounter) {
                anomalies.add(hymn.id + " stanza " + no)
            }
        } else {
            no = "chorus"
        }

        stanza = new StanzaEntity()
        stanza.setNo(no)
        stanza.setParentHymn(hymn)
        stanza.text = ""
        stanza.order = ++stanzaOrderCounter
        hymn.getStanzas().add(stanza)
        return stanza
    }
}
