package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.FileUtils
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.MidiManager
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Created by lemuelcantos on 6/7/16.
 */
class ExtractMissingFiles {
    public static void  main(arg) {
        println 'hello'
        HymnalNetExtractor.enableSSLSocket();

        // download missing midis
        def missingMidis = FindMissingMidis();
        missingMidis.each { HymnsEntity hymn ->
            // get midi
            if(Constants.getHymnalNetUrl(hymn)!=null)
                FileUtils.saveUrl(Constants.MIDI_PIANO_DIR + "/m" + hymn.getTune().trim() + ".mid", Constants.getHymnalNetUrl(hymn) + hymn.getNo() + "/f=mid");

        }







    }

    protected static FindMissingMidis() {
        def midiSet =  MidiManager.getAllAvailableMidis()

        Dao dao = new Dao();
        def hymns = dao.findAll("h.tune is not null");
        def missingMidis=[]
        hymns.each { HymnsEntity hymn ->
            println "hymn: " + hymn.id + " tune: " + hymn.tune;
            if(!midiSet.contains("m"+hymn.tune.trim()+".mid")){
                println "ooops! m${hymn.tune.trim()}.mid not found! hymn id is: ${hymn.id}"
                missingMidis+=hymn
            }

        }

        return missingMidis

    }
}
