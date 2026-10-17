package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 * Provisions the French youth songbook (FY) from FrenchYouth.txt.
 *
 * Source: "Cantique des jeunes (Recueil lyonnais 19-07-2024).pdf" (docs/v5.6). The book does not number its songs (its
 * index gives page numbers, often two songs to a page), so the songs are numbered in book order. Format per song:
 * "FY-<n>", then Related:/Parent:, then numbered stanzas ("1", "2", ...) and "Chorus:" blocks, separated by blank lines.
 *
 * @since 2026-10-17
 */
class ProvisionFrenchYouth {
    static File frenchYouthFile;
    Integer stanzaCounter = 0;
    Integer stanzaOrderCounter = 0;
    String line
    Iterator<String> iterator
    HymnsEntity hymn = null;
    StanzaEntity stanza = null;
    Set<String> anomalies = new HashSet<>();
    private Dao dao = new Dao()

    public static void main(String[] args) {
        def frenchYouth = new ProvisionFrenchYouth();
        frenchYouth.removeFrenchYouthHymns()
        frenchYouth.provision();

        println "French youth import finished!!!!!"
    }

    void removeFrenchYouthHymns() {
        println "Cleaning up existing French youth hymns..."
        for (int x = 1; x <= 400; x++) {
            HymnsEntity old = dao.find("FY" + x)
            if (old != null) {
                // links added to hymns that are not the parent (e.g. a Tagalog hymn) are not undone by dao.delete
                (old.related - [old.parentHymn]).findAll { it?.trim() }.each { dao.removeRelatedHymn(it, old.id) }
            }
            dao.delete("FY" + x)
        }
    }

    void provision() throws Exception {
        frenchYouthFile = new File(this.getClass().getResource("/FrenchYouth.txt").getPath());
        println "Reading from: ${frenchYouthFile.path}"

        iterator = frenchYouthFile.iterator();

        while (iterator.hasNext()) {
            line = iterator.next().trim();
            if (line.isNumber() || line.startsWith("Chorus:")) {
                createNewStanza()
            } else if (line.startsWith('FY-')) {
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
        // dao.save() links the hymn back from its parent only; a Related: that is not the parent (T10240, ...) needs the
        // reverse link too, so the language switch works from that hymn as well
        (hymn.related - [hymn.parentHymn]).findAll { it?.trim() && dao.find(it) != null }.each { dao.addRelatedHymn(it, hymn.id) }
        hymn = null
        stanza = null
    }

    static String firstLineOf(String text) {
        return text.contains("<br/>") ? text.substring(0, text.indexOf("<br/>")) : text
    }

    def createNewHymn() {
        int fyNo = Integer.parseInt(line.replaceAll('[^0-9]', ''))
        println "******* Generating French youth hymn ${fyNo}..."
        hymn = new HymnsEntity();
        hymn.id = 'FY' + fyNo
        hymn.no = fyNo.toString()
        hymn.hymnGroup = 'FY'
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
