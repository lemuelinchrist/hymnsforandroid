package com.lemuelinchrist.hymns.lib

/**
 * Created by lemuelcantos on 17/7/16.
 */
class MidiManager {
    public static Set getAllAvailableMidis() {
        def file = new File(Constants.MIDI_DIR);
        Set midis=[];
        file.eachFile {midiFile ->
            midis+=midiFile.name
        }
        midis
    }
}
