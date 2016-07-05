package com.lemuelinchrist.hymns.archive.second;

import com.lemuelinchrist.hymns.FileUtils;
import com.lemuelinchrist.hymns.beans.HymnsEntity;

import java.util.ArrayList;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;

/**
 * Created by lemuelcantos on 20/8/13.
 */
public class ResourceDownloader {
    public static final String DATA_DIR = "/Users/lemuelcantos/Dropbox/androidHymns/HymnsForAndroidProject/HymnsJpa/data";
    public static final String MIDI_PIANO_DIR = DATA_DIR + "midiVerbatim";
    private static final String HYMNS_UNIT = "hymnsUnit";

    public static void main(String[] args) {
//        downloadVerbatim();
//        renameVerbatimToHymnCode();
        checkHymnEnglishComplete();

    }

    private static void checkHymnEnglishComplete() {
        EntityManager em = null;
        ArrayList<String> missingTunes = new ArrayList<String>();
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            for (int x = 1; x <= 1348; x++) {

                HymnsEntity hymn = em.find(HymnsEntity.class, "E"+x);
                String destination = DATA_DIR + "/midiEnglishMerged/m" + hymn.getTune().toLowerCase().trim() + ".mid";
                String fileName = MIDI_PIANO_DIR+ "/E" + x + ".mid";

                if(!FileUtils.doesFileExist(destination)) {
//                    if(FileUtils.doesFileExist(destination)) {
//                        System.out.println("File: "+fileName+" with Tune: "+hymn.getTune()+" already created. Skipping...");
//                    } else {
                        System.out.println("Warning! missing tune: "+hymn.getId()+" ");
                        missingTunes.add(hymn.getId());

//                    }
                    continue;
                }
//                FileUtils.copyFile(fileName, destination);
//                System.out.println("file E"+x+".mid copied at: " + destination + "\n tune is: " +hymn.getTune());

            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
            System.out.println("missing tunes: " + missingTunes);
        }

    }

    private static void renameVerbatimToHymnCode() {
        EntityManager em = null;
        ArrayList<String> missingTunes = new ArrayList<String>();
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            for (int x = 1; x <= 1348; x++) {


                HymnsEntity hymn = em.find(HymnsEntity.class, "E"+x);
                String destination = DATA_DIR + "/midiVerbatimRenamed/m" + hymn.getTune().toLowerCase().trim() + ".mid";
                String fileName = MIDI_PIANO_DIR+ "/E" + x + ".mid";

                if(!FileUtils.doesFileExist(fileName)) {
                    if(FileUtils.doesFileExist(destination)) {
                        System.out.println("File: "+fileName+" with Tune: "+hymn.getTune()+" already created. Skipping...");
                    } else {
                        System.out.println("Warning! missing tune: "+hymn.getId()+" ");
                        missingTunes.add(hymn.getId());

                    }
                    continue;
                }


                FileUtils.copyFile(fileName, destination);


                System.out.println("file E"+x+".mid copied at: " + destination + "\n tune is: " +hymn.getTune());

            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
            System.out.println("missing tunes: " + missingTunes);
        }
    }

    private static void downloadVerbatim() {
        ArrayList<String> failedDownloads = new ArrayList<String>();


        for (int x = 1; x <= 1348; x++) {
            try {
                // add leading zeros to hymn number
                if (FileUtils.doesFileExist(MIDI_PIANO_DIR + "/E" + x + ".mid")) continue;
                String hymnNo = String.format("%04d", Integer.valueOf(x));
                FileUtils.saveUrl(MIDI_PIANO_DIR + "/E" + x + ".mid", "http://www.hymnal.net/Hymns/Hymnal/verbatim/e" + hymnNo + ".mid");

            } catch (Exception e) {
                System.out.println("Warning! midi failed to download: " + "E" + x);
                failedDownloads.add("E" + x);
            }

        }

        for (int x = 1; x <= 82; x++) {
            try {
                if (FileUtils.doesFileExist(MIDI_PIANO_DIR + "/lb" + x + ".mid")) continue;
                // add leading zeros to hymn number
                String hymnNo = String.format("%02d", Integer.valueOf(x));
                FileUtils.saveUrl(MIDI_PIANO_DIR + "/LB" + x + ".mid", "http://www.hymnal.net/Hymns/LongBeach/verbatim/lb" + hymnNo + ".mid");

            } catch (Exception e) {
                System.out.println("Warning! midi failed to download: " + "LB" + x);
                failedDownloads.add("LB" + x);
            }

        }

        for (int x = 1; x <= 416; x++) {
            try {
                if (FileUtils.doesFileExist(MIDI_PIANO_DIR + "/NS" + x + ".mid")) continue;
                // add leading zeros to hymn number
                String hymnNo = String.format("%04d", Integer.valueOf(x));
                FileUtils.saveUrl(MIDI_PIANO_DIR + "/NS" + x + ".mid", "http://www.hymnal.net/Hymns/NewSongs/verbatim/ns" + hymnNo + ".mid");

            } catch (Exception e) {
                System.out.println("Warning! midi failed to download: " + "NS" + x);
                failedDownloads.add("NS" + x);
            }

        }


        System.out.println("failed downloads" + failedDownloads);


    }

}
