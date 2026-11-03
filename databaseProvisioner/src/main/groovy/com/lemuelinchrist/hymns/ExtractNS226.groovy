package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * New Songs 226 ("Who is She?"), a standalone hymn that was missing from our database (found 2026-11-02, when the
 * Urdu New Songs came: UR10226 needs it as its parent). Run it in one Gradle call before runUrdu:
 * ./gradlew :databaseProvisioner:runExtractNS226 :databaseProvisioner:runUrdu :sqlite:exportSql
 */
class ExtractNS226 {
    static void main(args) {
        Dao dao = new Dao()
        dao.delete('NS226')
        HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, '226', 'NS', '226')
        dao.save(hymn)
    }
}
