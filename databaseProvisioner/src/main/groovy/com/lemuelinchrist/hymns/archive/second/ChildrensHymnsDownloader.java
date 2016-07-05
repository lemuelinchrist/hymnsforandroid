package com.lemuelinchrist.hymns.archive.second;

import com.lemuelinchrist.hymns.FileUtils;
import com.lemuelinchrist.hymns.HymnalNetExtractor;
import com.lemuelinchrist.hymns.beans.HymnsEntity;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;

/**
 * Created by lemuelcantos on 22/8/13.
 */
public class ChildrensHymnsDownloader {
    private static final String MIDI_PIANO_DIR = ResourceDownloader.DATA_DIR+"/midiPiano";
    private static final String GUITAR_DIR = ResourceDownloader.DATA_DIR + "/sheetMusicGuitar";
    private static final String PIANO_DIR = ResourceDownloader.DATA_DIR + "/sheetMusicPiano";
    private static final String URL_CHILDREN_MIDI= "http://www.hymnal.net/Hymns/Children/midi/c****.mid";
    private static final String URL_CHILDREN_GUITAR="http://www.hymnal.net/Hymns/Children/images/child****_g.png";
    private static final String URL_CHILDREN_PIANO="http://www.hymnal.net/Hymns/Children/images/child****_p.png";
    private static final String URL_CHILDREN="http://www.hymnal.net/en/hymn.php/c/";
    private static final String HYMNS_UNIT = "hymnsUnit";
    public static final String RENAMED_DIR = ResourceDownloader.DATA_DIR + "/midiRenamed";


    public static void main(String[] args) throws Exception{
//        downloadMidi();
//        downloadGuitarAndPiano();

//        HymnalNetExtractor.convertWebPageToHymn(URL_CHILDREN,"CH","21");

//        downloadLyrics();
//        renameMidi();
    }

    private static void renameMidi() {
        EntityManager em = null;

        String fileExtension = ".mid";
        String sourceDir = MIDI_PIANO_DIR;
        String hymnGroup = "CH";
        String destinationPrefix = "/m";
        String destinationDir = RENAMED_DIR;
        int begin = 1;
        int end = 74;

        try {

            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();

            for (int x = begin; x <= end; x++) {

                String fileName = sourceDir + "/"+ hymnGroup + x + fileExtension;

                if(!FileUtils.doesFileExist(fileName)) {
                    System.out.println("File: "+fileName+" Does not exist. Skipping...");
                    continue;
                }

                HymnsEntity hymn = em.find(HymnsEntity.class, hymnGroup +x);

                String destination = destinationDir + destinationPrefix + hymn.getTune().toLowerCase().trim() + fileExtension;
                FileUtils.copyFile(fileName, destination);


                System.out.println("file E"+x+".mid copied at: " + destination + "\n tune is: " +hymn.getTune());

            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
        }

    }

    private static void downloadLyrics() throws Exception{
        EntityManager em = null;

        int x;
        EntityManagerFactory factory;
        factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
        em = factory.createEntityManager();

        List<Integer> failedDownloads = new ArrayList<Integer>();

        String url = URL_CHILDREN;
        String hymnGroupCode = "CH";
        // 22,31
        int begin = 1;
        int end = 74;
        String numberOfDigits="%04d";

        try {

            for (x = begin; x <= end; x++) {

                try {
                    HymnsEntity hymnFromWeb = HymnalNetExtractor.convertWebPageToHymn(url, hymnGroupCode, "" + x,hymnGroupCode+x);
                    // add leading zeros to hymn number

                    String hymnNo = String.format(numberOfDigits, Integer.valueOf(x));

                    hymnFromWeb.setSheetMusicLink("http://www.hymnal.net/Hymns/Children/images/child****_g.png".replace("****",hymnNo));
                    em.getTransaction().begin();
                    em.persist(hymnFromWeb);
                    em.getTransaction().commit();
                    System.out.println("info saved for " + x);


                } catch (IOException e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
                    failedDownloads.add(x);
                }

            }


        } catch (Exception e) {
            System.out.println("download failed");

        }finally {
            System.out.println("failed downloads : " + failedDownloads);
        }

    }

    private static void downloadGuitarAndPiano() {

        String filePrefix = "/CH";
        String fileSuffix = ".png";
        String dir = PIANO_DIR;
        int begin=1;
        int end = 74;
        String numberOfDigits = "%04d";
        String urlString = URL_CHILDREN_PIANO;

        ArrayList<Integer> failedDownloads = new ArrayList<Integer>();
        ArrayList<Integer> successfulDownloads = new ArrayList<Integer>();
        try {
            for (int x = begin; x <= end; x++) {
                try {



                    if (FileUtils.doesFileExist(dir + filePrefix + x + fileSuffix)) continue;
                    // add leading zeros to hymn number

                    String hymnNo = String.format(numberOfDigits, Integer.valueOf(x));
                    FileUtils.saveUrl(dir + filePrefix + x + fileSuffix, urlString.replace("****",hymnNo));
                    successfulDownloads.add(x);

                } catch (Exception e) {
                    System.out.println("Warning! midi failed to download: " + filePrefix + x);
                    failedDownloads.add(x);
                }

            }
        } finally {
            System.out.println("failedDownloads: " + failedDownloads);
            System.out.println("failedDownload count: " + failedDownloads.size());

            System.out.println("successful downloads: " + successfulDownloads);
            System.out.println("successful downloads count: " + successfulDownloads.size());
        }


    }

    private static void downloadMidi() {
        ArrayList<String> failedDownloads = new ArrayList<String>();


        for (int x = 1; x <= 1348; x++) {
            try {
                // add leading zeros to hymn number
                if (FileUtils.doesFileExist(MIDI_PIANO_DIR + "/newE" + x + ".mid")) continue;
                String hymnNo = String.format("%04d", Integer.valueOf(x));
                FileUtils.saveUrl(MIDI_PIANO_DIR + "/newE" + x + ".mid", "http://www.hymnal.net/Hymns/NewTunes/midi/e" + hymnNo + "_new.mid");

            } catch (Exception e) {
                System.out.println("Warning! midi failed to download: " + "E" + x);
                failedDownloads.add("E" + x);
            }

        }
    }
}
