package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor
import com.lemuelinchrist.hymns.lib.MidiManager
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

/**
 * Created by lemuelcantos on 6/7/16.
 */
class ExtractMissingFiles {
    public static void  main(arg) {
        println 'hello'
        FindMissingMidis();







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
                missingMidis+=hymn.id
            }

        }
        println "missing midis:"
        println missingMidis


    }
}
