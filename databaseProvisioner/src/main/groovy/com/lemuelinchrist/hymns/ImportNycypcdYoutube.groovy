package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.LinkEntity

/**
 * Imports the YouTube recordings of the hymns as link rows of kind youtube (the "Listen and links" card).
 * NycypcdYoutube.txt: one recording per line, tab separated: hymn id, video id, publisher, album, "instrumental" or empty.
 * The publisher (label) is who made the recording, the album its album or playlist; either may be empty, never the YouTube
 * channel (tools/youtube-monitor/link_meta.py fills them from recordings.tsv). A line with only two columns is a recording
 * of the NYCYPCD channel. A hymn's recordings get order 1, 2, ... sorted by priority (from recordings.tsv, default 3),
 * then sung before instrumental, then file order.
 * It starts by deleting every youtube row that has a publisher or an album (the rows of a book's editor have neither and
 * stay), so it can be run again.
 */
class ImportNycypcdYoutube {

    static void main(String[] args) {
        def resource = ImportNycypcdYoutube.class.getResource("/NycypcdYoutube.txt")
        if (resource == null) throw new Exception("Resource not found!")
        Dao dao = new Dao()
        dao.deleteImportedRecordings()

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

        def file = new File(resource.toURI())
        def entries = []
        int idx = 0
        file.eachLine("UTF-8") { line ->
            if (line.trim().isEmpty() || line.startsWith("#")) return
            def parts = line.split("\t", -1)
            String hymnId = parts[0].trim()
            if (dao.find(hymnId) == null) throw new Exception("Hymn $hymnId does not exist")
            String vid = parts[1].trim()
            int prio = priorities.containsKey(vid) ? priorities[vid] : 3
            boolean inst = parts.length > 4 && parts[4].trim() == "instrumental"
            entries << [hymnId: hymnId, vid: vid, parts: parts, prio: prio, inst: inst ? 1 : 0, idx: idx++]
        }

        entries.sort { a, b ->
            (a.prio <=> b.prio) ?: (a.inst <=> b.inst) ?: (a.idx <=> b.idx)
        }

        def order = [:]
        int saved = 0
        entries.each { e ->
            def parts = e.parts
            int n = (order[e.hymnId] ?: 0) + 1
            order[e.hymnId] = n
            LinkEntity link = new LinkEntity()
            link.setHymnId(e.hymnId)
            link.setKind("youtube")
            link.setLabel(parts.length > 2 ? parts[2].trim() : "NYCYPCD")
            link.setAlbum(parts.length > 3 && parts[3].trim() ? parts[3].trim() : null)
            link.setInstrumental(e.inst == 1 ? 1 : null)
            link.setUrl("https://www.youtube.com/watch?v=" + e.vid)
            link.setOrder(n)
            dao.save(link)
            saved++
        }
        println "Recordings saved: $saved for ${order.size()} hymns"
    }
}
