package com.lemuelinchrist.hymns.lib;


import com.lemuelinchrist.hymns.lib.beans.HymnsEntity;

import java.util.ArrayList;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;

/**
 * Created by lemuelcantos on 10/8/13.
 */
public class HymnalNetResourceDownloader {

    public static final String DATA_DIR = Constants.DATA_DIR;
    public static String SHEET_MUSIC_PIANO_DIR = DATA_DIR + "/sheetMusicPiano";
    public static String SHEET_MUSIC_Guitar_DIR = DATA_DIR + "/sheetMusicGuitar";
    public static String MIDI_PIANO_DIR = DATA_DIR + "/midiPiano";

    public static void main(String args[]) {
//        downloadSheetMusic();
//        downloadMidi();

//        renameLongBeach();
        renameMidiToTune();
    }

    private static void renameLongBeach() {
        for (int x = 1; x <= 82; x++) {
            String fileName = MIDI_PIANO_DIR+ "/LB" + x + ".mid";
            String newName = MIDI_PIANO_DIR+"/NS"+Integer.toString(x+500)+".mid";
            FileUtils.renameFile(fileName,newName);



        }

    }

    private static void renameMidiToTune() {


        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(Constants.HYMNS_UNIT);
            em = factory.createEntityManager();
            for (int x = 1; x <= 1348; x++) {


                String fileName = MIDI_PIANO_DIR+ "/E" + x + ".mid";

                if(!FileUtils.doesFileExist(fileName)) {
                    System.out.println("File: "+fileName+" Does not exist. Skipping...");
                    continue;
                }

                HymnsEntity hymn = em.find(HymnsEntity.class, "E"+x);
                String destination = DATA_DIR + "/midiRenamed/m" + hymn.getTune().toLowerCase().trim() + ".mid";
                FileUtils.copyFile(fileName, destination);


                System.out.println("file E"+x+".mid copied at: " + destination + "\n tune is: " +hymn.getTune());

            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
        }

        // new songs
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(Constants.HYMNS_UNIT);
            em = factory.createEntityManager();
            for (int x = 1; x <= 582; x++) {


                String fileName = MIDI_PIANO_DIR+ "/NS" + x + ".mid";

                if(!FileUtils.doesFileExist(fileName)) {
                    System.out.println("File: "+fileName+" Does not exist. Skipping...");
                    continue;
                }

                HymnsEntity hymn = em.find(HymnsEntity.class, "NS"+x);
                String tune = hymn.getTune();
                if(tune==null || tune.isEmpty()) {
                    continue;
//                    tune=hymn.getId();
//                    em.getTransaction().begin();
//                    hymn.setTune(hymn.getId());
//                    em.getTransaction().commit();
                }
                String destination = DATA_DIR + "/midiRenamed/m" + tune.toLowerCase() + ".mid";
                FileUtils.copyFile(fileName, destination);


                System.out.println("file NS"+x+".mid copied at: " + destination + "\n tune is: " + tune.toLowerCase());

            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
        }


    }

    private static void downloadMidi() {
        ArrayList<String> failedDownloads = new ArrayList<String>();
        for (int x = 1; x <= 1348; x++) {
            try {
                // add leading zeros to hymn number
                String hymnNo = String.format("%04d", Integer.valueOf(x));
                FileUtils.saveUrl(MIDI_PIANO_DIR + "/E" + x + ".mid", "http://www.hymnal.net/Hymns/Hymnal/midi/e" + hymnNo + "_i.mid");

            } catch (Exception e) {
                System.out.println("Warning! midi failed to download: " + "E" + x);
                failedDownloads.add("E" + x);
            }

        }


        for (int x = 1; x <= 82; x++) {
            try {
                // add leading zeros to hymn number
                String hymnNo = String.format("%02d", Integer.valueOf(x));
                FileUtils.saveUrl(MIDI_PIANO_DIR + "/LB" + x + ".mid", "http://www.hymnal.net/Hymns/LongBeach/midi/lb" + hymnNo + ".mid");

            } catch (Exception e) {
                System.out.println("Warning! midi failed to download: " + "LB" + x);
                failedDownloads.add("LB" + x);
            }

        }

        for (int x = 1; x <= 416; x++) {
            try {
                // add leading zeros to hymn number
                String hymnNo = String.format("%04d", Integer.valueOf(x));
                FileUtils.saveUrl(MIDI_PIANO_DIR + "/NS" + x + ".mid", "http://www.hymnal.net/Hymns/NewSongs/midi/ns" + hymnNo + ".mid");

            } catch (Exception e) {
                System.out.println("Warning! midi failed to download: " + "NS" + x);
                failedDownloads.add("NS" + x);
            }

        }
        System.out.println("failed downloads" + failedDownloads);


    }

    private static void downloadSheetMusic() {
        ArrayList<String> failedDownloads = new ArrayList<String>();
        for (int x = 1; x <= 1348; x++) {
            try {
                // add leading zeros to hymn number
                String hymnNo = String.format("%04d", Integer.valueOf(x));
                FileUtils.saveUrl(SHEET_MUSIC_PIANO_DIR + "/E" + x + ".png", "http://www.hymnal.net/Hymns/Hymnal/images/e" + hymnNo + "_p.png");

            } catch (Exception e) {
                System.out.println("Warning! Sheet failed to download: " + "E" + x);
                failedDownloads.add("E" + x);
            }

        }


        for (int x = 1; x <= 82; x++) {
            try {
                // add leading zeros to hymn number
                String hymnNo = String.format("%02d", Integer.valueOf(x));
                FileUtils.saveUrl(SHEET_MUSIC_PIANO_DIR + "/LB" + x + ".png", "http://www.hymnal.net/Hymns/LongBeach/images/lb" + hymnNo + "_p.png");

            } catch (Exception e) {
                System.out.println("Warning! Sheet failed to download: " + "LB" + x);
                failedDownloads.add("LB" + x);
            }

        }

        for (int x = 1; x <= 416; x++) {
            try {
                // add leading zeros to hymn number
                String hymnNo = String.format("%04d", Integer.valueOf(x));
                FileUtils.saveUrl(SHEET_MUSIC_PIANO_DIR + "/NS" + x + ".png", "http://www.hymnal.net/Hymns/NewSongs/images/ns" + hymnNo + "_p.png");

            } catch (Exception e) {
                System.out.println("Warning! Sheet failed to download: " + "NS" + x);
                failedDownloads.add("NS" + x);
            }

        }


        /// redownload failed attempts
        int[] lb = {25, 61, 64, 68, 72, 73};
        for (int x : lb) {
            try {
                // add leading zeros to hymn number
                String hymnNo = String.format("%02d", Integer.valueOf(x));
                FileUtils.saveUrl(SHEET_MUSIC_PIANO_DIR + "/LB" + x + ".png", "http://www.hymnal.net/Hymns/LongBeach/images/lb" + hymnNo + "_g.png");

            } catch (Exception e) {
                System.out.println("Warning! Sheet failed to download: " + "LB" + x);
                failedDownloads.add("LB" + x);
            }

        }

        int[] ns = {196, 215, 236, 260, 274, 324, 325, 333, 335, 336, 337, 342, 343, 346, 347, 349, 389};
        for (int x : ns) {
            try {
                // add leading zeros to hymn number
                String hymnNo = String.format("%04d", Integer.valueOf(x));
                FileUtils.saveUrl(SHEET_MUSIC_PIANO_DIR + "/NS" + x + ".png", "http://www.hymnal.net/Hymns/NewSongs/images/ns" + hymnNo + "_g.png");

            } catch (Exception e) {
                System.out.println("Warning! Sheet failed to download: " + "NS" + x);
                failedDownloads.add("NS" + x);
            }

        }


        System.out.println("failed downloads" + failedDownloads);


    }


}
