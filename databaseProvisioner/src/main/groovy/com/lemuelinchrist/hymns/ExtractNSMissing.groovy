package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Syncs the New Songs that hymnal.net's sitemap (sitemaps/hymns-ns.xml, 2026-11-05) lists and the database lacks:
 * NS598 and NS1162-NS1166, NS1171. Runs on the current DB (no importSql). A pause between pages keeps the request rate low.
 * Gradle: runExtractNSMissing (use --exclude-task :sqlite:importSql if the task chain pulls it in).
 */
class ExtractNSMissing {
    static void main(args) {
        Dao dao = new Dao()
        for (int x : [598, 1162, 1163, 1164, 1165, 1166, 1171]) {
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, "" + x, 'NS', "" + x)
            dao.save(hymn)
            println "NS${x} saved"
            sleep(30000)
        }
    }
}
