package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.FileUtils
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Syncs Children songs (CH) with hymnal.net (en/hymn/c/<n>): each CH<n> in the range is replaced by hymnal.net's c/<n>,
 * or added if we don't have it. Safe to re-run on any range:
 *   JAVA_HOME=/home/lemue/.jdk ./gradlew :databaseProvisioner:runSyncChildren -Pfrom=1 -Pto=243
 *
 * Runs on the current DB (no importSql). Sheets and MIDI go to the staging folders (databaseProvisioner/data/...),
 * not the app; copy them over afterwards (see the hymn-provisioning skill).
 *
 * - hymnal.net serves a fake page (another song's words and sheet) for a number it doesn't have, or when pages are
 *   fetched too fast. A real page links its own sheet (child0082_p.svg on c/82), so anything else is retried after a
 *   pause, and never saved. A number that only gives fakes is listed at the end and our hymn is left as it is.
 * - Children MIDI files are named c0082.mid, not child0082.mid like the sheets, so the MIDI is fetched here. A song
 *   without one keeps the melody-only child0082_tune.midi that the extractor saved.
 * - Links from other hymns are kept: the old CH<n>'s related (e.g. F1405 on CH4) and any hymn whose parent is CH<n>
 *   (e.g. BF188 -> CH93).
 */
class SyncChildrenFromHymnalNet {
    static final String MIDI_URL = "https://www.hymnal.net/Hymns/Children/midi/c%04d.mid"
    static final int PAUSE_MS = 10000

    public static void main(String[] args) {
        int from = args[0] as int
        int to = args[1] as int
        Dao dao = new Dao()
        List<String> notSynced = []

        for (int x = from; x <= to; x++) {
            HymnsEntity hymn = fetch(x)
            if (hymn == null) {
                notSynced << "CH$x"
                continue
            }

            // keep the links other hymns made to CH<n>: from the old row, and from translations whose parent it is
            Set<String> related = hymn.related
            HymnsEntity old = dao.find(hymn.id)
            if (old != null) {
                related += old.related
                dao.delete(old.id)
            }
            related += dao.findAll("h.parentHymn = '${hymn.id}'")*.id
            hymn.setRelated(related.findAll { it?.trim() } as Set)
            dao.save(hymn)
            downloadMidi(x, hymn)
        }

        println "Synced CH$from-CH$to." + (notSynced ? " Not synced (only fake pages): $notSynced" : "")
    }

    static HymnsEntity fetch(int x) {
        String ownSheet = String.format("child%04d_", x)
        for (int attempt = 1; attempt <= 3; attempt++) {
            sleep(PAUSE_MS * attempt)
            try {
                HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_CHILDREN, "" + x, 'CH', "" + x)
                if (hymn.sheetMusicLink?.contains(ownSheet)) return hymn
                println "CH$x: fake page (sheet ${hymn.sheetMusicLink}), retrying"
            } catch (Exception e) {
                println "CH$x: ${e.message}, retrying"
            }
        }
        return null
    }

    static void downloadMidi(int x, HymnsEntity hymn) {
        String tune = hymn.tune?.trim()
        if (!tune) {
            println "CH$x: no tune code, no MIDI"
            return
        }
        String file = Constants.MIDI_PIANO_DIR + "/m" + tune + ".mid"
        try {
            FileUtils.saveUrl(file, String.format(MIDI_URL, x))
        } catch (IOException e) {
            // some songs only have the melody (child0021_tune.midi), which the extractor has already saved
            println "CH$x: no arrangement MIDI, keeping the melody-only one"
        }
        File midi = new File(file)
        byte[] bytes = midi.exists() ? midi.bytes : new byte[0]
        if (bytes.length < 4 || new String(bytes, 0, 4, "ISO-8859-1") != "MThd") {
            midi.delete()
            println "CH$x: no MIDI"
        }
    }
}
