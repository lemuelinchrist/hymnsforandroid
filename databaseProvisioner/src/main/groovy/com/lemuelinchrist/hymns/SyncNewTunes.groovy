package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import org.jsoup.Jsoup

/**
 * Syncs the New Tunes (BF436 and up) with hymnal.net (en/hymn/nt/<key>). A New Tune is another tune for an English
 * hymn; hymnal.net keys it by the English number ("251") and a "b" for a second one ("284b"). Our BF numbers do not
 * follow theirs, so a tune is found by its sheet link: tools/svg-to-lilypond/svg/hymnalnet_links.tsv says
 * "BF440 .../NewTunes/svg/e0251_new_p.svg", that is key 251. A tune we do not have yet gets the next BF number.
 *
 *   JAVA_HOME=/home/lemue/.jdk ./gradlew :databaseProvisioner:runSyncNewTunes                 (every tune on the site)
 *   JAVA_HOME=/home/lemue/.jdk ./gradlew :databaseProvisioner:runSyncNewTunes -Pkeys=251,284b (only these)
 *   ... -Pnew=true -Plimit=15                                      (only tunes we do not have, at most 15 this run)
 *
 * hymnal.net cuts an address off after a few dozen requests in a short time (seen 2026-11-04: refused connections,
 * then "Remote host terminated the handshake", for an hour or more), however slow the pauses are. So a full sync is
 * done in batches: -Pnew=true -Plimit=15, a long wait (20 minutes or more) between runs. The site's list of keys is
 * saved in data/nt_keys.txt after the first run, so a batch does not read the 20 index pages again; -Prefresh=true
 * reads them again. A tune counts as "ours" when its sheet link is in a hymnalnet_links.tsv (see below).
 *
 * Runs on the current DB (no importSql). Sheets go to the staging folders (databaseProvisioner/data/...), not the app;
 * copy them over afterwards (see the hymn-provisioning skill).
 *
 * - The parent is the English hymn (E<number>); a tune whose English hymn we do not have is listed and skipped.
 * - Category and subcategory are the parent's (hymnal.net spells some differently, e.g. "Fullness").
 * - new_tune is 1; the apps add " (New Tune)" to the first lines themselves (the data has no such text).
 * - A tune we have is replaced; its YouTube and SoundCloud links are kept (Dao.delete removes them, so they are saved
 *   again). BF439 is a tune from the regular hymn page (e0300b), not a New Tune: it is not touched.
 * - hymnal.net serves a fake page (another song's sheet) now and then: a page whose sheet is not its own is retried,
 *   never saved.
 */
class SyncNewTunes {
    static final int PAUSE_MS = 30000

    static void main(String[] args) {
        Set<String> only = (args.length > 0 && args[0]) ? args[0].tokenize(',') as Set : null
        boolean newOnly = args.length > 1 && args[1] == "true"
        int limit = (args.length > 2 && args[2]) ? args[2] as int : Integer.MAX_VALUE
        boolean refresh = args.length > 3 && args[3] == "true"
        Dao dao = new Dao()

        // BF number of each key we have, from the sheet links of the converter folder and then of the staging folder
        // (a later row of the same BF number wins, so a tune saved twice counts for its last sheet)
        Map<String, String> keyOfId = [:]
        int maxNo = 0
        [new File(Constants.DATA_DIR, "../../tools/svg-to-lilypond/svg/hymnalnet_links.tsv"),
         new File(Constants.DATA_DIR, "hymnalnet_links.tsv")].findAll { it.exists() }.each { f ->
            f.eachLine { line ->
                def m = line.split("\t")
                if (!m[0].startsWith("BF")) return
                maxNo = Math.max(maxNo, m[0].substring(2) as int)
                if (m.length > 1) {
                    def k = m[1] =~ /NewTunes\/svg\/e0*(\d+b?)_new_p\.svg/
                    if (k.find()) keyOfId[m[0]] = k.group(1)
                }
            }
        }
        // the DB is the last word on which BF numbers exist
        dao.findAll("h.hymnGroup = 'BF'").each { maxNo = Math.max(maxNo, it.no as int) }
        Map<String, String> haveByKey = [:]
        keyOfId.each { id, key -> haveByKey[key] = id }

        List<String> keys = siteKeys(refresh).findAll { (only == null || only.contains(it)) && !(newOnly && haveByKey.containsKey(it)) }
        List<String> skipped = [], failed = [], added = [], replaced = []
        int left = 0
        for (String key : keys) {
            if (added.size() + replaced.size() >= limit) {
                left++
                continue
            }
            String number = key.replace("b", "")
            String parent = "E" + number
            if (dao.find(parent) == null) {
                skipped << "$key (no $parent)"
                continue
            }
            boolean existing = haveByKey.containsKey(key)
            String id = existing ? haveByKey[key] : "BF" + (++maxNo)
            HymnsEntity hymn = fetch(key, id.substring(2))
            if (hymn == null) {
                failed << key
                if (!existing) maxNo--
                continue
            }
            prepare(dao, hymn, parent)

            def links = []
            Set<String> related = [] as Set
            HymnsEntity old = dao.find(id)
            if (old != null) {
                related += old.related
                links = dao.copyLinks(id)
                dao.delete(id)
            }
            hymn.setRelated(related.findAll { it?.trim() } as Set)
            dao.save(hymn)
            links.each { dao.save(it) }
            (existing ? replaced : added) << "$id<-$key"
        }
        println "New Tunes synced. Replaced ${replaced.size()}: $replaced"
        println "Added ${added.size()}: $added"
        println "Skipped: $skipped"
        println "Failed (only fake pages): $failed"
        println "Left for the next batch: $left"
    }

    /** Every key of the site's index, in number order with the plain tune before its "b" (kept in data/nt_keys.txt). */
    static List<String> siteKeys(boolean refresh) {
        File cache = new File(Constants.DATA_DIR, "nt_keys.txt")
        if (!refresh && cache.exists() && cache.text.trim()) return cache.text.tokenize()
        def letters = Jsoup.connect("https://www.hymnal.net/en/song-index/nt").userAgent("Mozilla/5.0").get()
                .select("a.hn-letter").collect { it.text().trim() }
        def keys = [] as Set
        letters.each { l ->
            sleep(PAUSE_MS)
            Jsoup.connect("https://www.hymnal.net/en/song-index/nt/" + l).userAgent("Mozilla/5.0").get()
                    .select("a.hn-hrow[href*=/hymn/nt/]").each { keys << it.attr("href").split("/")[-1] }
        }
        List<String> sorted = keys.toList().sort { a, b -> (a.replace("b", "") as int) <=> (b.replace("b", "") as int) ?: a.compareTo(b) }
        cache.text = sorted.join("\n") + "\n"
        return sorted
    }

    static HymnsEntity fetch(String key, String bfNo) {
        String own = String.format("e%04d%s_new_", key.replace("b", "") as int, key.endsWith("b") ? "b" : "")
        for (int attempt = 1; attempt <= 3; attempt++) {
            sleep(PAUSE_MS * attempt)
            try {
                HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.NEW_TUNES_SHEET_LINK, key, 'BF', bfNo)
                if (hymn.sheetMusicLink?.contains(own)) return hymn
                println "$key: fake page (sheet ${hymn.sheetMusicLink}), retrying"
            } catch (java.net.ConnectException e) {
                throw new RuntimeException("hymnal.net refuses the connection ($key): stopped. Wait, then run again; tunes done so far are saved.", e)
            } catch (Exception e) {
                println "$key: ${e.message}, retrying"
            }
        }
        return null
    }

    static void prepare(Dao dao, HymnsEntity hymn, String parentId) {
        HymnsEntity parent = dao.find(parentId)
        hymn.setParentHymn(parentId)
        hymn.setNewTune(1)
        if (parent.mainCategory) hymn.setMainCategory(parent.mainCategory)
        if (parent.subCategory) hymn.setSubCategory(parent.subCategory)
    }
}
