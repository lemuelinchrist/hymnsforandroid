package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.LinkEntity

/**
 * Imports the YouTube recordings of the hymns as link rows of kind youtube (the "Listen and links" card).
 * NycypcdYoutube.txt: one recording per line, tab separated: hymn id, video id, publisher, album, "instrumental" or empty.
 * The publisher (label) is who made the recording, the album its album or playlist; either may be empty, never the YouTube
 * channel (tools/youtube-monitor/link_meta.py fills them from recordings.tsv). A line with only two columns is a recording
 * of the NYCYPCD channel. A hymn's recordings get order 1, 2, ... in the file's order.
 * It starts by deleting every youtube row that has a publisher or an album (the rows of a book's editor have neither and
 * stay), so it can be run again.
 */
class ImportNycypcdYoutube {

    static void main(String[] args) {
        def resource = ImportNycypcdYoutube.class.getResource("/NycypcdYoutube.txt")
        if (resource == null) throw new Exception("Resource not found!")
        Dao dao = new Dao()
        dao.deleteImportedRecordings()
        def file = new File(resource.toURI())
        def order = [:]
        int saved = 0
        file.eachLine("UTF-8") { line ->
            if (line.trim().isEmpty() || line.startsWith("#")) return
            def parts = line.split("\t", -1)
            String hymnId = parts[0].trim()
            if (dao.find(hymnId) == null) throw new Exception("Hymn $hymnId does not exist")
            int n = (order[hymnId] ?: 0) + 1
            order[hymnId] = n
            LinkEntity link = new LinkEntity()
            link.setHymnId(hymnId)
            link.setKind("youtube")
            link.setLabel(parts.length > 2 ? parts[2].trim() : "NYCYPCD")
            link.setAlbum(parts.length > 3 && parts[3].trim() ? parts[3].trim() : null)
            link.setInstrumental(parts.length > 4 && parts[4].trim() == "instrumental" ? 1 : null)
            link.setUrl("https://www.youtube.com/watch?v=" + parts[1].trim())
            link.setOrder(n)
            dao.save(link)
            saved++
        }
        println "Recordings saved: $saved for ${order.size()} hymns"
    }
}
