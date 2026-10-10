package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Group C cleanup (v5.5, 2026-10-10): these NS hymns were once saved from hymnal.net's fake pages (the scrambled words,
 * sheet, code and MIDI of another hymn). Fetches the real songs again. Delete the old rows first (Dao.save() can't
 * overwrite an existing ID):
 *   sqlite3 app/src/main/assets/hymns.sqlite "DELETE FROM stanza WHERE parent_hymn IN ('NS881',...); DELETE FROM hymns WHERE _id IN (...)"
 *
 * hymnal.net serves a fake page when a page is fetched too fast, so every page is checked: a real page links a sheet
 * with its own number (ns0881_p.svg on ns/881). A fake is retried after a pause and never saved.
 */
class ExtractNSFakePageReplacements {
    static final List<Integer> HYMNS = [881, 978, 981, 995, 997]

    public static void main(arg) {
        Dao dao = new Dao()

        for (int x : HYMNS) {
            HymnsEntity hymn = null
            for (int attempt = 1; attempt <= 3 && hymn == null; attempt++) {
                sleep(15000)
                HymnsEntity fetched = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, "" + x, 'NS', "" + x)
                String expected = String.format("ns%04d_", x)
                if (fetched.sheetMusicLink?.contains(expected)) {
                    hymn = fetched
                } else {
                    println "NS$x: fake page (sheet ${fetched.sheetMusicLink}), retrying"
                }
            }
            if (hymn == null) throw new RuntimeException("NS$x: only fake pages after 3 attempts")
            dao.save(hymn)
        }
    }

}
