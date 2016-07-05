package com.lemuelinchrist.hymns.archive.fourth;

import com.lemuelinchrist.hymns.HymnalNetExtractor;
import com.lemuelinchrist.hymns.beans.HymnsEntity;

import java.util.ArrayList;
import java.util.List;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;

/**
 * Created by lemuelcantos on 3/12/14.
 */
public class TagalogExtractor {
    public static void main(String[] args) throws Exception{
        extract();
//        EntityManagerFactory factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
//        EntityManager em = factory.createEntityManager();
//        Query query = em.createQuery("select h from HymnsEntity h where h.hymnGroup='T' ");
//
//        List<HymnsEntity> tagalog = query.getResultList();
//        for (HymnsEntity hymnFromDb : tagalog) {
//            em.getTransaction().begin();
//            hymnFromDb.setParentHymn("E"+hymnFromDb.getNo());
//            System.out.println("saving hymn: " + hymnFromDb.getId() + " with parent hymn: " + hymnFromDb.getParentHymn());
//            em.getTransaction().commit();
//            System.out.println("SAVED!");
//
//        }


    }

    private static void extract() {
        EntityManagerFactory factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
        EntityManager em = factory.createEntityManager();
        List<Integer> failedDownloads = new ArrayList<Integer>();

//        int[] y={1089, 1122, 1151, 1154, 1187, 1188, 1232, 1251, 1304, 1308};

        for(int x=1; x<=1348; x++){
            HymnsEntity englishHymn = em.find(HymnsEntity.class,"E"+x);
            if (englishHymn.getRelated().contains("T" + englishHymn.getNo())) {
                try {
                    System.out.println(englishHymn.getId());
                    HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_TAGALOG, "T", "" + x, "" + x);
                    hymn.setParentHymn("E"+hymn.getNo());
                    HymnalNetExtractor.saveHymn(hymn);
                }catch (Exception e) {
                    System.out.println(e);
                    e.printStackTrace();
                    failedDownloads.add(x);

                }

            }

        }
        System.out.println("failedDownloads: " + failedDownloads);
        System.out.println("failedDownload count: " + failedDownloads.size());
    }
}
