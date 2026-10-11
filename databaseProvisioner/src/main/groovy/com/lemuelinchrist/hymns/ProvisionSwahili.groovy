package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 * Provisions the Kiswahili hymnal (SW) from Swahili.txt.
 *
 * Source: Brother Kimathi's "SWAHILI HYMN BOOK .docx" (docs/v5.5), a scan of a printed hymnal. Hymn numbers are the
 * printed page numbers, as he asked, so the numbers have gaps. Format per hymn: "SW-<n>", then Subject:/Related:/Parent:,
 * then numbered stanzas ("1", "2", ...) and "Chorus:" blocks, separated by blank lines.
 *
 * @since 2026-10-11
 */
class ProvisionSwahili {
    static File swahiliFile;
    Integer stanzaCounter = 0;
    Integer stanzaOrderCounter = 0;
    String line
    Iterator<String> iterator
    HymnsEntity hymn = null;
    StanzaEntity stanza = null;
    Set<String> anomalies = new HashSet<>();
    private Dao dao = new Dao()

    public static void main(String[] args) {
        def swahili = new ProvisionSwahili();
        swahili.removeSwahiliHymns()
        swahili.provision();

        println "Swahili import finished!!!!!"
    }

    void removeSwahiliHymns() {
        println "Cleaning up existing Swahili hymns..."
        for (int x = 1; x <= 300; x++) {
            dao.delete("SW" + x)
        }
    }

    void provision() throws Exception {
        swahiliFile = new File(this.getClass().getResource("/Swahili.txt").getPath());
        println "Reading from: ${swahiliFile.path}"

        iterator = swahiliFile.iterator();

        while (iterator.hasNext()) {
            line = iterator.next().trim();
            if (line.isNumber() || line.startsWith("Chorus:")) {
                createNewStanza()
            } else if (line.startsWith('SW-')) {
                wrapup()
                createNewHymn()
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

        // Set search index lines
        for (StanzaEntity s : hymn.getStanzas()) {
            if (s.no.equals("1") && hymn.firstStanzaLine == null) {
                hymn.firstStanzaLine = firstLineOf(s.text)
            }
            if (s.no.equals("chorus") && hymn.firstChorusLine == null) {
                hymn.firstChorusLine = firstLineOf(s.text).toUpperCase()
            }
        }
        if (hymn.firstStanzaLine == null && !hymn.getStanzas().isEmpty()) {
            hymn.firstStanzaLine = firstLineOf(hymn.getStanzas().get(0).text)
        }

        println hymn
        dao.save(hymn)
        hymn = null
        stanza = null
    }

    static String firstLineOf(String text) {
        return text.contains("<br/>") ? text.substring(0, text.indexOf("<br/>")) : text
    }

    def createNewHymn() {
        int swNo = Integer.parseInt(line.replaceAll('[^0-9]', ''))
        println "******* Generating Swahili Hymn ${swNo}..."
        hymn = new HymnsEntity();
        hymn.id = 'SW' + swNo
        hymn.no = swNo.toString()
        hymn.hymnGroup = 'SW'
        hymn.stanzas = new ArrayList<StanzaEntity>();
        stanza = null
        stanzaCounter = 0
        stanzaOrderCounter = 0

        while (iterator.hasNext()) {
            line = iterator.next().trim()
            if (line.startsWith("Subject:")) {
                hymn.setMainCategory(line.substring(line.indexOf(":") + 1).trim())
            } else if (line.startsWith("Related:")) {
                hymn.setRelatedString(line.substring(line.indexOf(":") + 1).trim())
            } else if (line.startsWith("Parent:")) {
                hymn.parentHymn = line.substring(line.indexOf(":") + 1).trim()
            } else if (line.isNumber() || line.startsWith("Chorus:")) {
                createNewStanza()
                break
            } else if (!line.isEmpty()) {
                throw new RuntimeException("${hymn.id}: unexpected line before the first stanza: " + line)
            }
        }
    }

    StanzaEntity createNewStanza() {
        String no
        if (line.isNumber()) {
            no = line
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
