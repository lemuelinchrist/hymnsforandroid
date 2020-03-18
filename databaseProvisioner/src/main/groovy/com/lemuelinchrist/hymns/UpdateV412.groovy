package com.lemuelinchrist.hymns


import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Created by lemuel on 20/4/2017.
 */
class UpdateV412 {

    static Dao dao = new Dao()

    static void main(String[] args) {
//        change587To1087()
//        extractNS566To617()
//        extractOthers()
//        extractNewTagalog1249To1360()
//        extractNewEnglish1249To1360()
//        removeAllTS()
//        changeLyrics()
        List<HymnsEntity> hymns = dao.findAll(" h.hymnGroup='Z'")
        for(HymnsEntity hymn: hymns) {
            fixRelated(hymn)

        }

        hymns = dao.findAll(" h.hymnGroup='ZS'")
        for(HymnsEntity hymn: hymns) {
            fixRelated(hymn)
        }


    }

    public static void fixRelated(HymnsEntity hymn) {
        if (hymn.parentHymn != null && !hymn.parentHymn.isEmpty()) {
            dao.addRelatedHymn(hymn.getParentHymn(), hymn.getId())
        } else {
            String parentHymnID = hymn.id.replace("Z", "C")
            hymn.parentHymn = parentHymnID
            dao.save(hymn)
            dao.addRelatedHymn(parentHymnID, hymn.getId())
            dao.addRelatedHymn(hymn.getId(), parentHymnID)
        }
    }


}
