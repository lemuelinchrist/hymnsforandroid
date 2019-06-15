package com.lemuelinchrist.hymns;

import com.lemuelinchrist.hymns.lib.Dao;
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity;
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity;

import java.io.File;
import java.util.Iterator;

/**
 * @author Lemuel Cantos
 * @since 15/6/2019
 */
public class ProvisionJapanese {
    File japaneseFile;
    File japaneseSupplementFile;

    public static void main(String args) {
        ProvisionJapanese japanese = new ProvisionJapanese();
        japanese.provision();
    }

    public void provision() {
        Dao dao = new Dao();
        japaneseFile = new File(this.getClass().getResource("/japanese.txt").getPath());
        japaneseSupplementFile = new File(this.getClass().getResource("/japaneseSupplement.txt").getPath());

        Iterator<String> iterator = japaneseFile.iterator();
        Iterator<String> supplementIterator = japaneseSupplementFile.iterator();
        Integer hymnNumber = 0;
        Integer stanzaCounter = 0;
        Integer stanzaOrderCounter = 0;
        HymnsEntity hymn = null;
        StanzaEntity stanza = null;
        StringBuilder stanzaBuilder = null;
        while (iterator.hasNext()) {
        }
    }
}
