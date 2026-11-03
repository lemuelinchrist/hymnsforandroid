package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element

/**
 * Appends the Urdu New Songs and Long Beach hymns of hymnal.net to Urdu.txt (the file ProvisionLanguageFile reads).
 *
 * hymnal.net lists them in its sitemap (https://www.hymnal.net/sitemaps/hymns-ns.xml and hymns-lb.xml: the pages whose
 * number ends in "ur", e.g. /en/hymn/ns/292ur); they are not in the Urdu hymnal (/hymn/ur/N). Numbering: New Songs
 * NS n = UR 10000 + n (UR10292), Long Beach LB n = UR 20000 + n (UR20082). The parent is the New Songs hymn (LB n is
 * NS 10000 + n in our database).
 *
 * Run: ./gradlew :databaseProvisioner:runExtractUrduNewSongs   (then runUrdu and :sqlite:exportSql). Hymns already in
 * Urdu.txt are left as they are. Needs the network; waits a second between pages.
 *
 * @since 2026-11-02
 */
class ExtractUrduNewSongs {

    // hymnal.net page numbers (the sitemap of 2026-11-02): [book, number]
    static final List<List> PAGES = [
            ['ns', [6, 12, 17, 19, 21, 25, 27, 28, 33, 46, 97, 99, 102, 110, 118, 143, 151, 158, 163, 164, 180, 211, 226, 285, 290,
                    292, 309, 321, 351, 352, 359, 361, 362, 367, 370, 476, 501, 506, 511, 512]],
            ['lb', [13, 14, 40, 51, 52, 65, 66, 75, 76, 82]],
    ]

    static void main(String[] args) {
        File file = new File(args.length > 0 ? args[0] : 'databaseProvisioner/src/main/resources/Urdu.txt')
        if (!file.exists()) file = new File('src/main/resources/Urdu.txt')
        String existing = file.getText('UTF-8')
        HymnalNetExtractor.enableSSLSocket()
        StringBuilder out = new StringBuilder()
        int added = 0
        for (List page : PAGES) {
            String book = page[0]
            for (Integer n : page[1]) {
                int urNo = (book == 'ns' ? 10000 : 20000) + n
                String header = "UR-${urNo}"
                if (existing.contains(header + "\n")) { println "${header} is already in the file"; continue }
                String parent = book == 'ns' ? "NS${n}" : "NS${10000 + n}"
                String url = "https://www.hymnal.net/en/hymn/${book}/${n}ur"
                println "Reading ${url}"
                Document doc = Jsoup.connect(url).userAgent('Mozilla/5.0').referrer('https://www.hymnal.net/').get()
                out.append(block(doc, header, parent, url))
                added++
                Thread.sleep(1000)
            }
        }
        if (added > 0) {
            String sep = existing.endsWith("\n\n") ? "" : (existing.endsWith("\n") ? "\n" : "\n\n")
            file.write(existing + sep + out.toString(), 'UTF-8')
        }
        println "Added ${added} hymns to ${file.path}"
    }

    static String block(Document doc, String header, String parent, String url) {
        String category = dd(doc, 'Category')
        String sub = dd(doc, 'Subcategory')
        // the New Songs pages carry the category and the subcategory in one line, joined by "۔۔۔۔"
        String subject = category
        if (sub) subject = category + ' – ' + sub
        else if (category.contains('۔۔۔۔')) subject = category.split('۔۔۔۔', 2).collect { it.trim() }.join(' – ')

        StringBuilder sb = new StringBuilder()
        sb.append(header).append('\n')
        if (subject) sb.append('Subject: ').append(subject).append('\n')
        sb.append('Related: ').append(parent).append('\n\n')

        int no = 0
        String lastChorus = null
        for (Element verse : doc.select('div.lyrics div.verse')) {
            Element tc = verse.selectFirst('div.text-container')
            if (tc == null) continue
            List<String> lines = HymnalNetExtractor.formatBreaks(tc.html()).replace('&nbsp;', ' ').split('<br\\s*/?>')
                    .collect { Jsoup.parse(it).text().trim() }.findAll { !it.isEmpty() }
            if (lines.isEmpty()) continue
            String type = verse.attr('data-type')
            if (type == 'chorus') {
                String text = lines.join('\n')
                if (text == lastChorus) continue
                lastChorus = text
                sb.append('Coro:\n').append(text).append('\n\n')
            } else {
                Element num = verse.selectFirst('div.verse-num > span')
                no = num != null && num.text().trim().isNumber() ? Integer.parseInt(num.text().trim()) : no + 1
                sb.append(no).append('\n').append(lines.join('\n')).append('\n\n')
            }
        }
        if (no == 0 && !sb.toString().contains('Coro:')) throw new RuntimeException("No lyrics found at " + url)
        return sb.append('\n').toString()
    }

    static String dd(Document doc, String label) {
        for (Element dt : doc.select('dl.hn-dl dt')) {
            if (dt.text().trim() == label) return dt.nextElementSibling()?.text()?.trim() ?: ''
        }
        return ''
    }
}
