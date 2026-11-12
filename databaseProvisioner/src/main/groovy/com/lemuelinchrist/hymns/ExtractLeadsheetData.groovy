package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import org.jsoup.Jsoup
import org.jsoup.nodes.Document

/**
 * Saves the sheet data of hymns we already have, from their hymnal.net pages, as
 * databaseProvisioner/data/leadsheetData/<id>.json. Since 2026-11 the site serves no sheet SVG file: the page holds
 * the sheet as JSON (key, time, tempo, chords, melody in numbered notation) and draws it in the browser. The database
 * is only read.
 *
 *   ./gradlew :databaseProvisioner:runExtractLeadsheetData -Phymns=NS226,NS1166,BF69:h/8773
 *
 * An item is a hymn id, with ":<page>" when the page is not the plain one of its book (NS n = ns/n, E n = h/n,
 * CH n = c/n). A page is saved only when it is the hymn asked for: its canonical address is the page, and its hymn
 * code is the tune code we hold (a page fetched too fast answers with another hymn). One page every 15 seconds.
 */
class ExtractLeadsheetData {
    static final String HYMNAL_NET = 'https://www.hymnal.net/en/hymn/'
    static final Map<String, String> BOOK_PAGES = [NS: 'ns', E: 'h', CH: 'c']

    static void main(String[] args) {
        if (!args) throw new IllegalArgumentException('pass the hymns: -Phymns=NS226,BF69:h/8773')
        Dao dao = new Dao()
        HymnalNetExtractor.enableSSLSocket()
        List<String> failed = []
        args.eachWithIndex { String item, int i ->
            if (i > 0) sleep(15000)
            String id = item.tokenize(':')[0]
            HymnsEntity hymn = dao.find(id)
            if (hymn == null) throw new IllegalArgumentException("$id is not in the database")
            String page = item.contains(':') ? item.substring(item.indexOf(':') + 1) : defaultPage(hymn)
            String url = HYMNAL_NET + page
            String json = null
            for (int attempt = 1; attempt <= 3 && json == null; attempt++) {
                if (attempt > 1) sleep(30000)
                println "$id: $url"
                Document doc = Jsoup.connect(url).get()
                String problem = wrongPage(doc, url, hymn)
                if (problem) {
                    println "$id: not saved, $problem"
                    continue
                }
                json = HymnalNetExtractor.readLeadsheetData(doc)
                if (json == null) {
                    println "$id: the page has no sheet data"
                    break
                }
            }
            if (json == null) failed << id
            else HymnalNetExtractor.saveLeadsheetData(id, json)
        }
        if (failed) throw new RuntimeException("no sheet data saved for: ${failed.join(', ')}")
    }

    static String defaultPage(HymnsEntity hymn) {
        String book = BOOK_PAGES[hymn.hymnGroup]
        if (book == null) throw new IllegalArgumentException("${hymn.id}: give its page, e.g. ${hymn.id}:h/8773")
        return "$book/${hymn.no}"
    }

    /** Why the page is not this hymn's, or null when it is. */
    static String wrongPage(Document doc, String url, HymnsEntity hymn) {
        String canonical = doc.select('link[rel=canonical]').attr('href')
        if (canonical != url) return "the page says it is $canonical"
        String code = HymnalNetExtractor.readTuneCode(doc)
        if (hymn.tune && code && hymn.tune.trim() != code.trim()) return "its hymn code is $code, ours is ${hymn.tune}"
        return null
    }
}
