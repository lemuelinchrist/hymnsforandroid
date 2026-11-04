package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.LinkEntity

/**
 * Imports the YouTube recordings of the NYCYPCD channel as link rows of kind youtube (label NYCYPCD).
 * NycypcdYoutube.txt: one "hymn id TAB video id" per line, matched by the match-youtube-songs skill and checked by Lemuel.
 * A hymn with two recordings gets order 1 and 2. Run after importSql (the Gradle task depends on it), so it is not repeated.
 */
class ImportNycypcdYoutube {

    static void main(String[] args) {
        def resource = ImportNycypcdYoutube.class.getResource("/NycypcdYoutube.txt")
        if (resource == null) throw new Exception("Resource not found!")
        Dao dao = new Dao()
        def order = [:]
        int saved = 0
        new File(resource.toURI()).eachLine("UTF-8") { line ->
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
            link.setLabel("NYCYPCD")
            link.setUrl("https://www.youtube.com/watch?v=" + parts[1])
            link.setOrder(n)
            dao.save(link)
            saved++
        }
        println "NYCYPCD links saved: $saved for ${order.size()} hymns"
    }
}
