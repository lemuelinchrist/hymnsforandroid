package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.LinkEntity

/**
 * Imports the YouTube recordings of the hymns as link rows of kind youtube (the "Listen and links" card).
 * Source (since 2026-11-23): tools/youtube-monitor/recordings.tsv, the rows with platform youtube and status linked (one entry per hymn of the
 * `hymns` column; `link label` = publisher, `album / playlist` without a trailing "(by ...)", `instrumental` = 1, `priority`). A row with neither a
 * label nor an album is skipped (it is a link added by hand in the database, which the import never deletes). The old NycypcdYoutube.txt is read
 * only when the environment variable LINK_SOURCE=txt is set (kept for comparing the two).
 * NycypcdYoutube.txt: one recording per line, tab separated: hymn id, video id, publisher, album, "instrumental" or empty.
 * The publisher (label) is who made the recording, the album its album or playlist; either may be empty, never the YouTube
 * channel (tools/youtube-monitor/link_meta.py fills them from recordings.tsv). A line with only two columns is a recording
 * of the NYCYPCD channel. Sung recordings are stored under the hymn id; instrumental recordings are resolved to the hymn's
 * trimmed tune code (or accept a raw tune code directly) and capped at one per tune code (the single highest-priority match;
 * any non-imported instrumental already on that tune counts toward the cap, while all matched recordings remain preserved
 * in NycypcdYoutube.txt and recordings.tsv). Order per target key (hymn id or tune code): 1, 2, ... sorted by priority
 * (from recordings.tsv, default 3), then sung before instrumental, then file order.
 * It starts by deleting every youtube row that has a publisher or an album (the rows of a book's editor have neither and
 * stay), so it can be run again.
 */
class ImportNycypcdYoutube {

    /** Resolves a hymn id (walking parent_hymn, stopping at own-tune boundary) or raw tune code to its trimmed tune code. */
    static String resolveTune(Dao dao, String hymnOrTune, Closure<Set<String>> lazyTunes) {
        def cur = dao.find(hymnOrTune)
        if (cur == null) {
            if (lazyTunes().contains(hymnOrTune)) return hymnOrTune
            throw new Exception("Hymn or tune '$hymnOrTune' does not exist")
        }
        for (int depth = 0; depth < 6 && cur != null; depth++) {
            String t = cur.tune?.trim()
            if (t && t != "0") return t
            if (!cur.parentHymn) break
            def parent = dao.find(cur.parentHymn)
            if (parent == null) break
            if (cur.newTune == 1 && parent.newTune != 1) break
            cur = parent
        }
        throw new Exception("Hymn '$hymnOrTune' has no tune code")
    }

    static void main(String[] args) {
        def resource = ImportNycypcdYoutube.class.getResource("/NycypcdYoutube.txt")
        if (resource == null && System.getenv("LINK_SOURCE") == "txt") throw new Exception("Resource not found!")
        Dao dao = new Dao()
        dao.deleteImportedRecordings()

        Set<String> allTunesCache = null
        Closure<Set<String>> lazyTunes = {
            if (allTunesCache == null) {
                allTunesCache = new HashSet<>()
                dao.findAll("h.tune is not null and h.tune <> ''").each { h ->
                    String t = h.tune?.trim()
                    if (t && t != "0") allTunesCache.add(t)
                }
            }
            return allTunesCache
        }

        def priorities = [:]
        def recFile = [new File("../tools/youtube-monitor/recordings.tsv"), new File("tools/youtube-monitor/recordings.tsv")].find { it.exists() }
        if (recFile != null) {
            def recLines = recFile.readLines("UTF-8")
            if (!recLines.isEmpty()) {
                def header = recLines[0].split("\t", -1).toList()
                int vidCol = header.indexOf("video id")
                int prioCol = header.indexOf("priority")
                if (vidCol >= 0 && prioCol >= 0) {
                    recLines.drop(1).each { l ->
                        if (!l.trim()) return
                        def cols = l.split("\t", -1)
                        if (cols.length > Math.max(vidCol, prioCol)) {
                            String pStr = cols[prioCol].trim()
                            if (pStr.isInteger()) priorities[cols[vidCol].trim()] = pStr.toInteger()
                        }
                    }
                }
            }
        }

        def entries = []
        int idx = 0
        def addEntry = { String hymnId, String vid, String label, String album, boolean inst, int prio ->
            String targetKey
            if (inst) {
                targetKey = resolveTune(dao, hymnId, lazyTunes)
            } else {
                if (dao.find(hymnId) == null) throw new Exception("Hymn $hymnId does not exist")
                targetKey = hymnId
            }
            entries << [targetKey: targetKey, vid: vid, parts: [hymnId, vid, label, album, inst ? "instrumental" : ""] as String[], prio: prio, inst: inst ? 1 : 0, idx: idx++]
        }
        if (System.getenv("LINK_SOURCE") == "txt") {
            def file = new File(resource.toURI())
            file.eachLine("UTF-8") { line ->
                if (line.trim().isEmpty() || line.startsWith("#")) return
                def parts = line.split("\t", -1)
                String vid = parts[1].trim()
                addEntry(parts[0].trim(), vid, parts.length > 2 ? parts[2].trim() : "NYCYPCD", parts.length > 3 ? parts[3].trim() : "",
                        parts.length > 4 && parts[4].trim() in ["instrumental", "1"], priorities.containsKey(vid) ? priorities[vid] : 3)
            }
        } else {
            if (recFile == null) throw new Exception("recordings.tsv not found")
            def lines = recFile.readLines("UTF-8")
            def header = lines[0].split("\t", -1).toList()
            def col = { String n -> int i = header.indexOf(n); if (i < 0) throw new Exception("recordings.tsv has no column $n"); i }
            int cVid = col("video id"), cStatus = col("status"), cHymns = col("hymns"), cLabel = col("link label"), cAlbum = col("album / playlist"),
                cPlat = col("platform"), cInst = col("instrumental"), cOrd = header.indexOf("link order")
            int skipped = 0
            lines.drop(1).each { l ->
                if (!l.trim()) return
                def c = l.split("\t", -1)
                if (c[cPlat] != "youtube" || c[cStatus] != "linked") return
                String label = c[cLabel].trim()
                String album = c[cAlbum].replaceAll('\\s*\\(by [^)]*\\)\\s*$', "").trim()
                if (album == "videos") album = ""     // the channel's "all videos" list is not an album
                if (!label && !album) { skipped++; println "Skipped ${c[cVid]} (no label and no album: a link added by hand)"; return }
                String vid = c[cVid].trim()
                boolean inst = c[cInst].trim() == "1"
                String ord = cOrd >= 0 && c.length > cOrd ? c[cOrd].trim() : ""
                int before = idx
                c[cHymns].trim().split('\\s+').each { h -> addEntry(h, vid, label, album, inst, priorities.containsKey(vid) ? priorities[vid] : 3) }
                // rows with a link order sort by it; the others come after them, in file order
                entries.eachWithIndex { e, i -> if (i >= entries.size() - (idx - before)) e.idx = (ord.isInteger() ? ord.toInteger() : 1000000 + before) * 100 + (i - (entries.size() - (idx - before))) }
            }
        }

        entries.sort { a, b ->
            (a.prio <=> b.prio) ?: (a.inst <=> b.inst) ?: (a.idx <=> b.idx)
        }

        def order = [:]
        Set<String> seenInstTune = new HashSet<>(dao.existingInstrumentalTunes())
        int saved = 0
        entries.each { e ->
            if (e.inst == 1 && !seenInstTune.add(e.targetKey)) return
            def parts = e.parts
            int n = (order[e.targetKey] ?: 0) + 1
            order[e.targetKey] = n
            LinkEntity link = new LinkEntity()
            link.setHymnId(e.targetKey)
            link.setKind("youtube")
            link.setLabel(parts.length > 2 ? parts[2].trim() : "NYCYPCD")
            link.setAlbum(parts.length > 3 && parts[3].trim() ? parts[3].trim() : null)
            link.setInstrumental(e.inst == 1 ? 1 : null)
            link.setUrl("https://www.youtube.com/watch?v=" + e.vid)
            link.setOrder(n)
            dao.save(link)
            saved++
        }
        println "Recordings saved: $saved for ${order.size()} targets"
    }
}
