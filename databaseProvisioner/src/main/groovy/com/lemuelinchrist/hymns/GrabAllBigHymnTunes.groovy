package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Constants
import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity

import java.nio.file.FileAlreadyExistsException
import java.nio.file.Files
import java.nio.file.Paths

/**
 * Created by lemuelcantos on 6/7/16.
 */
class GrabAllBigHymnTunes {
    public static final String DATA_DIR = Constants.DATA_DIR;
    public static String MIDI_PIANO_DIR = DATA_DIR + "/midi/";


    public static void  main(arg) {
        println 'hello'
        getTunes()

    }

    public static void getTunes() {
        def dupes = []
        Dao dao = new Dao()
        for(def x=1; x<=1360; x++) {
            HymnsEntity hymn = dao.find("E"+x);
//            FileUtils.copyFile(DATA_DIR + "/raw/m"+hymn.getTune().trim()+".mid",MIDI_PIANO_DIR)
            String filename = "m"+hymn.getTune().trim()+".mid";
            try {
                Files.copy(Paths.get(DATA_DIR + "/raw/" + filename), Paths.get(MIDI_PIANO_DIR + filename))
            }catch (FileAlreadyExistsException e) {
                dupes+=hymn.id;
            }

        }
        println "dupes: " + dupes

    }

}
