package com.lemuelinchrist.hymns;

import com.lemuelinchrist.hymns.FileUtils;
import com.lemuelinchrist.hymns.HymnalNetExtractor;
import com.lemuelinchrist.hymns.beans.HymnsEntity;

import java.io.IOException;
import java.util.ArrayList;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;

/**
 * Created by lemuelcantos on 15/8/13.
 */
public class NewTunes {
    public static final String DATA_DIR = "/Users/lemuelcantos/Documents/android/HymnsJpa/data";

    private static final String MIDI_URL ="http://www.hymnal.net/Hymns/NewTunes/midi/e####_new.mid" ;
    public static String MIDI_PIANO_DIR = DATA_DIR + "/midiPianoNewTunes";


    public static void main (String[] args) {
//        getNewTunesForBeFilled();
//        System.out.println(FileUtils.listFilesForFolder(MIDI_PIANO_DIR));

//        getInfoForBeFilledNewTunes();
//        renameNewTunesToTuneCode();



    }

    private static void renameNewTunesToTuneCode() {
        EntityManager em = null;
        ArrayList<String> failedDownload = new ArrayList<String>();
        int x;
        EntityManagerFactory factory;
        factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
        em = factory.createEntityManager();
        try {
            // for new songs
            for (String midi: FileUtils.listFilesForFolder(MIDI_PIANO_DIR)) {
                if(midi.charAt(0)!='B') continue;

                try {

                    String hymnId = midi.replace(".mid", "");
                    System.out.println("Saving hymn info: "+hymnId);
                    HymnsEntity hymn = em.find(HymnsEntity.class, hymnId);

                    String fileName = MIDI_PIANO_DIR+ "/"+midi;

                    if(!FileUtils.doesFileExist(fileName)) {
                        System.out.println("File: "+fileName+" Does not exist. Skipping...");
                        continue;
                    }


                    String destination = DATA_DIR + "/midiRenamed/m" + hymn.getTune().toLowerCase().trim() + ".mid";
                    FileUtils.copyFile(fileName, destination);


                    System.out.println("file "+midi+" copied at: " + destination + "\n tune is: " +hymn.getTune());






                } catch (Exception e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " +midi);
                    failedDownload.add(midi);
                }

            }


        } catch (Exception e) {

            throw new RuntimeException(e);
        } finally {
            System.out.println("failed new songs: " + failedDownload);
        }

    }

    private static void getInfoForBeFilledNewTunes() {
        EntityManager em = null;
        ArrayList<String> failedDownload = new ArrayList<String>();
        int x;
        EntityManagerFactory factory;
        factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
        em = factory.createEntityManager();
        try {
            // for new songs
            for (String midi:FileUtils.listFilesForFolder(MIDI_PIANO_DIR)) {
                if(midi.charAt(0)!='B') continue;

                try {

                    String hymnId = midi.replace(".mid", "");
                    System.out.println("Saving hymn info: "+hymnId);
                    HymnsEntity hymn = em.find(HymnsEntity.class, hymnId);


                    String parentHymnNo = hymn.getParentHymn().substring(1);
                    HymnsEntity hymnFromWeb=HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_NEWTUNES,"BF",parentHymnNo,"BF"+parentHymnNo);

//                    // add leading zeros to hymn number
//                    String hymnNo = String.format("%04d", Integer.valueOf(parentHymnNo));
//                    FileUtils.saveUrl(MIDI_PIANO_DIR + "/BF" + x + ".mid", MIDI_URL.replace("####",hymnNo));


                    em.getTransaction().begin();
                    hymn.setTune(" " +hymnFromWeb.getTune());
                    hymn.setKey(hymnFromWeb.getKey());
                    hymn.setMeter(hymnFromWeb.getMeter());
                    hymn.setTime(hymnFromWeb.getTime());
                    hymn.setFirstStanzaLine(hymn.getFirstStanzaLine()+ " (New Tune)");
                    hymn.setFirstChorusLine(hymn.getFirstChorusLine() + " (New Tune)");

                    // add leading zeros to hymn number
                    String hymnNo = String.format("%04d", Integer.valueOf(parentHymnNo));
                    hymn.setSheetMusicLink("http://www.hymnal.net/Hymns/NewTunes/images/e"+hymnNo+"_new_g.png");

                    em.getTransaction().commit();

                    // add (new tune) note on index

                    // add hymn music sheet


                } catch (IOException e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " +midi);
                    failedDownload.add(midi);
                }

            }


        } catch (Exception e) {

            throw new RuntimeException(e);
        } finally {
            System.out.println("failed new songs: " + failedDownload);
        }

    }

    private static void getNewTunesForBeFilled() {
        EntityManager em = null;
        ArrayList<Integer> failedDownload1 = new ArrayList<Integer>();
        int x;
        EntityManagerFactory factory;
        factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
        em = factory.createEntityManager();
        try {
            // for new songs
            for (x = 1; x <= 384; x++) {

                try {

                    HymnsEntity hymn = em.find(HymnsEntity.class, "BF" + x);
                    if(hymn.getParentHymn()==null)
                        continue;
                    if(hymn.getParentHymn().isEmpty()) {
                        em.getTransaction().begin();
                        hymn.setParentHymn(null);
                        em.getTransaction().commit();
                        continue;
                    }
                    if (hymn.getParentHymn().charAt(0)!='E')
                        continue;

                    String parentHymnNo = hymn.getParentHymn().substring(1);

                    // add leading zeros to hymn number
                    String hymnNo = String.format("%04d", Integer.valueOf(parentHymnNo));
                    FileUtils.saveUrl(MIDI_PIANO_DIR + "/BF" + x + ".mid", MIDI_URL.replace("####",hymnNo));





                } catch (IOException e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
                    failedDownload1.add(x);
                }

            }


        } catch (Exception e) {

            throw new RuntimeException(e);
        } finally {
            System.out.println("failed new songs: " + failedDownload1);
        }

    }


}
