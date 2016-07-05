package com.lemuelinchrist.hymns.archive.third;

import com.lemuelinchrist.hymns.FileUtils;
import com.lemuelinchrist.hymns.beans.HymnsEntity;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;
import javax.persistence.Query;

/**
 * Created by lemuelcantos on 20/8/13.
 */
public class ResourceDownloader {
    public static final String DATA_DIR = "/Users/lemuelcantos/Dropbox/hymnDev/HymnsForAndroidProject/HymnsJpa/data";
    public static final String MIDI_PIANO_DIR = DATA_DIR + "/midi2014";
    private static final String HYMNS_UNIT = "hymnsUnit";
    private static final String SHEET_PIANO_DIR = DATA_DIR + "/pianoSvg";
    private static final String SHEET_GUITAR_DIR = DATA_DIR + "/guitarSvg";

    public static void main(String[] args) throws IOException {
//        downloadMidi();
//        renameVerbatimToHymnCode();
//        downloadAllMidi();
        downloadAllGuitar();



    }

    private static void downloadAllGuitar() throws IOException {

        EntityManager em = null;
        EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
        em = factory.createEntityManager();
        Query query = em.createQuery("select h from HymnsEntity h");

        List<HymnsEntity> hymns = query.getResultList();
        List<String> error = new ArrayList<String>();
        String[] hymnList = {"NS586", "NS417", "NS418", "NS419", "NS420", "NS421", "NS422", "NS423", "NS424", "NS425", "NS426", "NS427", "NS428", "NS429", "NS430", "NS431", "NS432", "NS433", "NS434", "NS435",
                "NS436", "NS437", "NS438", "NS439", "NS440", "NS441", "NS442", "NS443", "NS444", "NS445", "NS446", "NS447", "NS448", "NS449", "NS450",
                "NS451", "NS452", "NS453", "NS454", "NS455", "NS456", "NS457", "NS458", "NS459", "NS460", "NS461", "NS462", "NS463", "NS464", "NS465", "NS466",
                "NS467", "NS468", "NS469", "NS470", "NS471", "NS472", "NS473", "NS474", "NS475", "NS476", "NS477", "NS478", "NS479", "BF434", "BF435", "BF436"};

//        for (HymnsEntity hymnFromDb : hymns) {
//            if (hymnFromDb.getSheetMusicLink()==null) continue;
//            System.out.println("downloading guitar and piano for hymn: " + hymnFromDb.getId()+" at: " + hymnFromDb.getSheetMusicLink());
//            try {
//                FileUtils.saveUrl(SHEET_PIANO_DIR + "/" + hymnFromDb.getId() + ".svg", hymnFromDb.getSheetMusicLink().replace("_g", "_p").replace("http", "https").replace(".svg", ".svg?"));
//                FileUtils.saveUrl(SHEET_GUITAR_DIR + "/" + hymnFromDb.getId() + ".svg", hymnFromDb.getSheetMusicLink().replace("_p", "_g").replace("http", "https").replace(".svg", ".svg?"));
//            }catch (Exception e) {
//                error.add(hymnFromDb.getId());
//            }
//
//        }
//        System.out.println("errors: " + error);
        for (String hymn : hymnList) {
            HymnsEntity hymnFromDb=em.find(HymnsEntity.class,hymn);
            if (hymnFromDb.getSheetMusicLink()==null) continue;
            System.out.println("downloading guitar and piano for hymn: " + hymnFromDb.getId()+" at: " + hymnFromDb.getSheetMusicLink());
            try {
                FileUtils.saveUrl(SHEET_PIANO_DIR + "/" + hymnFromDb.getId() + ".svg", hymnFromDb.getSheetMusicLink().replace("_g", "_p").replace(".svg", ".svg?"));
                FileUtils.saveUrl(SHEET_GUITAR_DIR + "/" + hymnFromDb.getId() + ".svg", hymnFromDb.getSheetMusicLink().replace("_p", "_g").replace(".svg", ".svg?"));
            }catch (Exception e) {
                System.out.println("error! " );
                e.printStackTrace();
                error.add(hymnFromDb.getId());
            }

        }
        System.out.println("errors: " + error);



    }

    private static void downloadAllMidi() throws IOException {
        EntityManager em = null;
        EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
        em = factory.createEntityManager();
        String newSongsLink="https://www.hymnal.net/en/hymn/ns/";
        String newTunesLink="https://www.hymnal.net/en/hymn/nt/";

        for(int x=434;x<437;x++) {
            HymnsEntity hymn = em.find(HymnsEntity.class, "BF" + x);
            if (hymn.getSheetMusicLink()==null) continue;
            System.out.println("downloading midi for hymn: " + hymn.getId()+" at: " + hymn.getSheetMusicLink());
            FileUtils.saveUrl(MIDI_PIANO_DIR + "/" + hymn.getTune() + ".mid", newTunesLink + hymn.getParentHymn() + "/f=mid");
            System.out.println("saved it as: " + hymn.getTune());

        }


    }



}
