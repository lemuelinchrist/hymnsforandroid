package com.lemuelinchrist.hymns.archive.second;

import com.lemuelinchrist.hymns.HymnalNetExtractor;
import com.lemuelinchrist.hymns.beans.HymnsEntity;
import com.lemuelinchrist.hymns.beans.StanzaEntity;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;

/**
 * Created by lemuelcantos on 21/8/13.
 */
public class AddNewChineseSupplement {
    public static final String HYMNS_UNIT =
            "hymnsUnit";

    public static void main(String[] args) throws Exception {
//        downloadChineseSupplement();
//        System.out.println(HymnalNetExtractor.convertChineseWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_CHINESE_SUPPLEMENT, "CS", "30"));
//        addLineBreaksToStanzas();
    }

    private static void addLineBreaksToStanzas() {
        EntityManager em = null;

        int x;
        EntityManagerFactory factory;
        factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
        em = factory.createEntityManager();

        List<Integer> failedDownloads = new ArrayList<Integer>();

        try {

            // 28-37
            //138-150
            //248-258
            //330-349
            //430-470
            //534-543
            //619-629
            //753-762
            //850-880
            //916-930

            int begin = 916;
            int end = 930;
            for (x = begin; x <= end; x++) {

                try {

                    HymnsEntity hymn = em.find(HymnsEntity.class, "CS" + x);
                    if (hymn == null)
                        continue;

                    em.getTransaction().begin();
                    for (StanzaEntity stanza : hymn.getStanzas()) {
                        stanza.setText(stanza.getText() + "<br/>");
                    }
                    em.getTransaction().commit();
                    System.out.println("info saved for " + x);


                } catch (Exception e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
                    failedDownloads.add(x);
                }

            }


        } catch (Exception e) {
            System.out.println("download failed");

        } finally {
            System.out.println("failed downloads : " + failedDownloads);
        }
    }

    private static void downloadChineseSupplement() {
        EntityManager em = null;

        int x;
        EntityManagerFactory factory;
        factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
        em = factory.createEntityManager();

        List<Integer> failedDownloads = new ArrayList<Integer>();

        try {

            // 28-37
            //138-150
            //248-258
            //330-349
            //430-470
            //534-543
            //619-629
            //753-762
            //850-880
            //916-930

            for (x = 916; x <= 916; x++) {

                try {

//                    HymnsEntity hymn = em.find(HymnsEntity.class, "CS" + x);
//                    if (hymn == null)
//                        continue;
                    HymnsEntity hymnFromWeb = HymnalNetExtractor.convertChineseWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_CHINESE_SUPPLEMENT, "CS", "" + x);


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

        } finally {
            System.out.println("failed downloads : " + failedDownloads);
        }
    }
}
