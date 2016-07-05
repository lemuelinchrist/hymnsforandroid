package com.lemuelinchrist.hymns.archive.second;

import com.lemuelinchrist.hymns.FileUtils;
import com.lemuelinchrist.hymns.HymnalNetExtractor;
import com.lemuelinchrist.hymns.beans.HymnsEntity;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;
import javax.persistence.Query;

/**
 * Created by lemuelcantos on 22/8/13.
 */
public class NewTunesDownloader {

    private static final String MIDI_PIANO_DIR = ResourceDownloader.DATA_DIR+"/midiPiano";
    private static final Object GUITAR_DIR = ResourceDownloader.DATA_DIR + "/sheetMusicGuitar";
    private static final Object PIANO_DIR = ResourceDownloader.DATA_DIR + "/sheetMusicPiano";
    private static final String HYMNS_UNIT = "hymnsUnit";
    private static final String URL_NEW_TUNES="http://www.hymnal.net/en/hymn.php/nt/";


    public static void main(String[] args) throws Exception {
//        downloadMidi();
//        downloadGuitarAndPiano();
//        findParentHymnsOfBeFilledNewTunes();

//        findNewHymnsThatAreNotAlreadyExisting();

//        downloadLyrics();

//        renameMidi();

        fixTunesByMakingThemString();


    }
    private static void fixTunesByMakingThemString() {
        EntityManager em = null;
        HashSet<String> failedHymns = new HashSet<String>();
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.hymnGroup='BF' or h.hymnGroup='CH'");

            List<HymnsEntity> hymns = query.getResultList();
            for (HymnsEntity hymnFromDb : hymns) {
                if (hymnFromDb.getTune() == null) continue;
                try {
                    em.getTransaction().begin();
                    hymnFromDb.setTune(" " + hymnFromDb.getTune().trim());

                    em.getTransaction().commit();
                    System.out.println(hymnFromDb);
                } catch (Exception e) {
                    System.out.println("warning! hymn failed to save: " + hymnFromDb.getId());
                    failedHymns.add(hymnFromDb.getId());

                }
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
            System.out.println("hymns that failed: " + failedHymns);
        }

    }

    private static void renameMidi() {
        EntityManager em = null;

        String fileExtension = ".mid";
        String sourceDir = MIDI_PIANO_DIR;
        String hymnGroup = "newE";
        String destinationPrefix = "/m";
        String destinationDir = ChildrensHymnsDownloader.RENAMED_DIR;
        int begin = 1;
        int end = 74;

        try {

            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            Integer[] newTuneNumbers = {293, 325, 252, 367, 1222, 389, 673, 439, 287, 724, 378, 721, 722, 474, 477, 647, 995, 605, 407, 716, 343, 857, 788, 789, 513, 512, 553, 223, 352, 1008, 412, 708, 498};


            for (Integer x : newTuneNumbers) {

                String fileName = sourceDir + "/"+ hymnGroup + x + fileExtension;

                if(!FileUtils.doesFileExist(fileName)) {
                    System.out.println("File: "+fileName+" Does not exist. Skipping...");
                    continue;
                }

                Query query = em.createQuery("select h from HymnsEntity h where h.hymnGroup='BF' and h.parentHymn='E"+x+"' ");
                HymnsEntity hymn = (HymnsEntity)query.getSingleResult();

                System.out.println(hymn.getId());
                String destination = destinationDir + destinationPrefix + hymn.getTune().toLowerCase().trim() + fileExtension;
                FileUtils.copyFile(fileName, destination);


//                System.out.println("file E"+x+".mid copied at: " + destination + "\n tune is: " +hymn.getTune());

            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
        }
    }

    private static void findNewHymnsThatAreNotAlreadyExisting() {
        String[] alreadyExisting = {"E383","E1278","E154","E711","E350","E599","E531","E1049","E426","E323","E578","E1050","E172","E643","E432","E1299","E641","E547","E1057","E96","E204","E377","E642","E394","E600","E33","E720","E434","E521","E1325","E1158","E285","E1307","E284","E431","E575","E12","E723","E1174","E1079","E437","E208","E1238","E165","E1048"};

        String[] b = {"E1008","E165","E367","E498","E673","E1048","E172","E377","E512","E708","E1049","E204","E378","E513","E711","E1050","E208","E383","E521","E716","E1057","E223","E389","E531","E720","E1079","E252","E394","E547","E721","E1158","E284","E407","E553","E722","E1174","E285","E412","E575","E723","E12","E287","E426","E578","E724","E1222","E293","E431","E599","E788","E1238","E323","E432","E600","E789","E1278","E325","E434","E605","E857","E1299","E33","E437","E641","E96","E1307","E343","E439","E642","E995","E1325","E350","E474","E643","E154","E352","E477","E647"};
        HashSet<String> available = new HashSet<String>(Arrays.asList(b));
        for(String a:alreadyExisting) {
            available.remove(a);

        }
        System.out.println("available: " + available);
    }

    private static void findParentHymnsOfBeFilledNewTunes() {
        int[] bf = {101,158,174,32,53,106,162,175,325,59,109,164,176,34,61,12,165,177,345,66,133,167,185,35,78,134,169,26,36,79,135,170,271,37,93,136,171,3,43,94,152,172,31,46,99};

        EntityManager em = null;

        int x;
        EntityManagerFactory factory;
        factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
        em = factory.createEntityManager();
        for (int h:bf) {
            HymnsEntity hymn=em.find(HymnsEntity.class,"BF"+h);
            System.out.print("\""+hymn.getParentHymn()+"\",");

        }
    }

    private static void downloadGuitarAndPiano() {
        ArrayList<Integer> failedDownloads = new ArrayList<Integer>();


        try {
            for (int x = 1; x <= 1348; x++) {
                try {

                    if (FileUtils.doesFileExist(GUITAR_DIR + "/newE" + x + ".png")) continue;
                    // add leading zeros to hymn number
                    String hymnNo = String.format("%04d", Integer.valueOf(x));
                    // change _g to _p for piano
                    FileUtils.saveUrl(GUITAR_DIR + "/newE" + x + ".png", "http://www.hymnal.net/Hymns/NewTunes/images/e" + hymnNo + "_new_g.png");

                } catch (Exception e) {
                    System.out.println("Warning! midi failed to download: " + "E" + x);
                    failedDownloads.add(x);
                }

            }
        } finally {
            System.out.println("failedDownloads: " + failedDownloads);
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

    private static void downloadLyrics() throws Exception{
        EntityManager em = null;


        EntityManagerFactory factory;
        factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
        em = factory.createEntityManager();

        List<Integer> failedDownloads = new ArrayList<Integer>();

        String url = URL_NEW_TUNES;
        String hymnGroupCode = "BF";
        Integer[] newTuneNumbers = {293, 325, 252, 367, 1222, 389, 673, 439, 287, 724, 378, 721, 722, 474, 477, 647, 995, 605, 407, 716, 343, 857, 788, 789, 513, 512, 553, 223, 352, 1008, 412, 708, 498};
        int begin = 1;
        int end = 1348;
        String numberOfDigits="%04d";


        try {
            int befilledIterator = 401;
            for (Integer x:Arrays.asList(newTuneNumbers)) {

                try {
                    HymnsEntity hymnFromWeb = HymnalNetExtractor.convertWebPageToHymn(url, hymnGroupCode, "" + x,hymnGroupCode+x);

                    // add leading zeros to hymn number
                    String hymnNo = String.format(numberOfDigits, Integer.valueOf(x));

                    hymnFromWeb.setSheetMusicLink("http://www.hymnal.net/Hymns/NewTunes/images/e****_new_g.png".replace("****",hymnNo));
                    hymnFromWeb.setParentHymn("E" + x);
                    hymnFromWeb.setId("BF" + befilledIterator);
                    hymnFromWeb.setNo("" + befilledIterator++);
                    hymnFromWeb.setStanzas(null);
                    hymnFromWeb.setFirstStanzaLine(hymnFromWeb.getFirstStanzaLine()+" (New Tune)");
                    if(hymnFromWeb.getFirstChorusLine()!=null) {
                        hymnFromWeb.setFirstChorusLine(hymnFromWeb.getFirstChorusLine()+" (New Tune)");
                    }

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
}
