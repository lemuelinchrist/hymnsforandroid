package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 * Provisions a hymnal from a text file in Brother Victor's format (the format of Spanish2026.txt), one language per
 * argument: {@code R} (Russian), {@code MY} (Burmese), {@code TA} (Tamil), {@code UR} (Urdu). See LANGUAGES for each
 * one's file.
 *
 * Format per hymn: "<prefix>-<n>", then Subject: and Related: (the English hymn, which becomes the parent; see parentOf), then
 * numbered stanzas ("1", "2", ...), "Coro:" / "Coro 1:" choruses and at most one "End-note:" at the end, separated by
 * blank lines. Source files and open questions: docs/v5.7.
 *
 * Every language's task depends on importSql, which resets the database, so run them in one Gradle call:
 * ./gradlew :databaseProvisioner:runRussian :databaseProvisioner:runBurmese :databaseProvisioner:runTamil :databaseProvisioner:runUrdu
 *
 * @since 2026-10-21
 */
class ProvisionLanguageFile {

    static final Map<String, Map> LANGUAGES = [
            // the Russian hymnal: its own numbering (the "R" numbers in the German file's Related lines)
            R : [file: '/Russian.txt', prefix: 'RUS-', maxNo: 1000, splitSubject: false],
            // the Burmese hymnal: its own numbering, Subject is "category – subcategory". The extra songs after 235, 245
            // and 365 get numbers from 1001 until the brother tells us how his book numbers them.
            MY: [file: '/Burmese.txt', prefix: 'BUR-', maxNo: 1100, splitSubject: true,
                 altNumbers: ['235-alt1': 1001, '235-alt2': 1002, '235-alt3': 1003,
                              '245-alt1': 1004, '245-alt2': 1005, '365-alt': 1006]],
            // the Tamil hymns: numbered like the English hymnal (TA1 = E1), 1501 and up are other songs
            TA: [file: '/Tamil.txt', prefix: 'TA-', maxNo: 2000, splitSubject: false],
            // the Urdu hymns of hymnal.net, numbered like the English hymnal (UR1 = E1), up to E8773; Urdu.txt is made
            // from hymnal.net's pages (docs/v5.7, "Urdu Hymns")
            UR: [file: '/Urdu.txt', prefix: 'UR-', maxNo: 9000, splitSubject: true],
    ]

    final String group
    final Map language
    Integer stanzaCounter = 0;
    Integer stanzaOrderCounter = 0;
    String line
    Iterator<String> iterator
    HymnsEntity hymn = null;
    StanzaEntity stanza = null;
    Set<String> anomalies = new LinkedHashSet<>();
    private Dao dao = new Dao()

    ProvisionLanguageFile(String group) {
        this.group = group
        this.language = LANGUAGES[group]
        if (language == null) throw new IllegalArgumentException("Unknown language: " + group)
    }

    public static void main(String[] args) {
        for (String group : args) {
            def provisioner = new ProvisionLanguageFile(group)
            provisioner.removeHymns()
            provisioner.provision()
            println "${group} import finished!!!!!"
        }
    }

    void removeHymns() {
        println "Cleaning up existing ${group} hymns..."
        for (int x = 1; x <= language.maxNo; x++) {
            HymnsEntity old = dao.find(group + x)
            if (old != null) {
                // links added to hymns that are not the parent are not undone by dao.delete
                (old.related - [old.parentHymn]).findAll { it?.trim() }.each { dao.removeRelatedHymn(it, old.id) }
            }
            dao.delete(group + x)
        }
    }

    void provision() throws Exception {
        File file = new File(this.getClass().getResource(language.file).toURI())
        println "Reading from: ${file.path}"

        iterator = file.readLines('UTF-8').iterator()

        while (iterator.hasNext()) {
            line = iterator.next().trim();
            if (line.startsWith(language.prefix)) {
                wrapup()
                createNewHymn()
            } else if (line.startsWith("End-note:")) {
                createNewNote()
            } else if (isStanzaStart(line) && stanza?.no != "note") {
                createNewStanza()
            } else if (!line.isEmpty()) {
                if (stanza == null) throw new RuntimeException("${hymn?.id}: text before the first stanza: " + line)
                stanza.text += line + "<br/>"
            }
        }
        wrapup()

        println("Anomalies found: " + anomalies.toString())
    }

    // only a bare number starts a stanza: an end-note may list "1. Verses 1-8 and 26"
    static boolean isStanzaStart(String line) {
        return line.matches('[0-9]+') || line.matches('Coro( [0-9]+)?:')
    }

    def wrapup() {
        if (hymn == null) return

        if (hymn.stanzas.count { it.no != "note" } == 1 && hymn.stanzas[0].no == "chorus") {
            hymn.stanzas[0].no = "1"
        }
        for (StanzaEntity s : hymn.getStanzas()) {
            if (s.text.isEmpty()) throw new RuntimeException("${hymn.id}: empty stanza ${s.no}")
            if (s.no.equals("1") && hymn.firstStanzaLine == null) {
                hymn.firstStanzaLine = firstLineOf(s.text)
            }
            if (s.no.equals("chorus") && hymn.firstChorusLine == null) {
                hymn.firstChorusLine = firstLineOf(s.text).toUpperCase()
            }
        }
        if (hymn.firstStanzaLine == null) {
            hymn.firstStanzaLine = firstLineOf(hymn.stanzas.find { it.no != "chorus" && it.no != "note" }?.text ?: hymn.stanzas[0].text)
        }

        println hymn
        dao.save(hymn)
        // dao.save() links the hymn back from its parent only; another Related: needs the reverse link too
        (hymn.related - [hymn.parentHymn]).findAll { it?.trim() && dao.find(it) != null }.each { dao.addRelatedHymn(it, hymn.id) }
        hymn = null
        stanza = null
    }

    // the parent, in order of preference: English or New Songs, then Be Filled, then traditional Chinese (C, CS),
    // never simplified Chinese (the hymn-provisioning skill, "Which hymn is the parent")
    static String parentOf(Collection<String> related) {
        for (String pattern : ['(E|NS)[0-9]+', 'BF[0-9]+', '(C|CS)[0-9]+']) {
            String parent = related.find { it.matches(pattern) }
            if (parent != null) return parent
        }
        return null
    }

    static String firstLineOf(String text) {
        return text.contains("<br/>") ? text.substring(0, text.indexOf("<br/>")) : text
    }

    def createNewHymn() {
        String fileNo = line.substring(language.prefix.length())
        Integer no = fileNo.isNumber() ? Integer.parseInt(fileNo) : language.altNumbers?.get(fileNo)
        if (no == null) throw new RuntimeException("No number for hymn " + line)
        println "******* Generating ${group} Hymn ${no}..."
        hymn = new HymnsEntity();
        hymn.id = group + no
        hymn.no = no.toString()
        hymn.hymnGroup = group
        hymn.stanzas = new ArrayList<StanzaEntity>();
        stanza = null
        stanzaCounter = 0
        stanzaOrderCounter = 0

        while (iterator.hasNext()) {
            line = iterator.next().trim()
            if (line.startsWith("Subject:")) {
                String subject = line.substring(line.indexOf(":") + 1).trim()
                // en dash is the standard separator; also accept " - " and " -"
                String[] subjectArray = language.splitSubject ? subject.split('\\s*–\\s*|\\s+-\\s*', 2) : [subject]
                hymn.setMainCategory(subjectArray[0].trim())
                if (subjectArray.size() > 1) {
                    hymn.setSubCategory(subjectArray[1].trim())
                }
            } else if (line.startsWith("Related:")) {
                String related = line.substring(line.indexOf(":") + 1).replace(" ", "").replace(";", ",")
                if (!related.isEmpty()) {
                    hymn.setRelatedString(related)
                    hymn.parentHymn = parentOf(hymn.related)
                }
            } else if (line.startsWith("Verses:")) {
                hymn.verse = line.substring(line.indexOf(":") + 1).trim()
            } else if (isStanzaStart(line)) {
                createNewStanza()
                break
            } else if (!line.isEmpty()) {
                throw new RuntimeException("${hymn.id}: unexpected line before the first stanza: " + line)
            }
        }
    }

    def createNewNote() {
        stanza = new StanzaEntity()
        stanza.setNo("note")
        stanza.setParentHymn(hymn)
        String rest = line.substring(line.indexOf(":") + 1).trim()
        stanza.text = rest.isEmpty() ? "" : rest + "<br/>"
        stanza.order = ++stanzaOrderCounter
        hymn.getStanzas().add(stanza)
        return stanza
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
