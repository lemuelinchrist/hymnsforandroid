package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.LinkEntity

/**
 * Imports the YouTube recordings of the NYCYPCD channel as link rows of kind youtube (label NYCYPCD).
 * NycypcdYoutube.txt: one "hymn id TAB video id" per line, matched by the match-youtube-songs skill and checked by Lemuel.
 * An optional third column replaces the label NYCYPCD for that link (a recording by someone else, e.g. the composer).
 * A hymn with two recordings gets order 1 and 2. It starts by deleting the rows labelled NYCYPCD, so it can be run again.
 */
class ImportNycypcdYoutube {

    static void main(String[] args) {
        def resource = ImportNycypcdYoutube.class.getResource("/NycypcdYoutube.txt")
        if (resource == null) throw new Exception("Resource not found!")
        Dao dao = new Dao()
        dao.deleteLinks("youtube", "NYCYPCD")
        // the labels of the third column go too, so that a re-run does not double those links
        def file = new File(resource.toURI())
        file.readLines("UTF-8").findAll { !it.trim().isEmpty() && !it.startsWith("#") }
                .collect { it.split("\t") }.findAll { it.length > 2 && it[2].trim() }
                .collect { it[2].trim() }.unique().each { dao.deleteLinks("youtube", it) }
        def order = [:]
        int saved = 0
        file.eachLine("UTF-8") { line ->
            line = line.trim()
            if (line.isEmpty() || line.startsWith("#")) return
            def parts = line.split("\t")
            String hymnId = parts[0]
            if (dao.find(hymnId) == null) throw new Exception("Hymn $hymnId does not exist")
            int n = (order[hymnId] ?: 0) + 1
            order[hymnId] = n
            LinkEntity link = new LinkEntity()
            link.setHymnId(hymnId)
            link.setKind("youtube")
            link.setLabel(parts.length > 2 && parts[2].trim() ? parts[2].trim() : "NYCYPCD")
            link.setUrl("https://www.youtube.com/watch?v=" + parts[1])
            link.setOrder(n)
            dao.save(link)
            saved++
        }
        println "NYCYPCD links saved: $saved for ${order.size()} hymns"
    }
}
