package com.lemuelinchrist.hymns;

import com.lemuelinchrist.hymns.beans.HymnsEntity;
import com.lemuelinchrist.hymns.beans.StanzaEntity;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;

public class DatabaseStuffer {

    public static final Map<String, String> urlMap = new HashMap<String, String>();
    static{
        urlMap.put("E",HymnalNetExtractor.HYMNAL_NET_URL);
//        urlMap.put("")
    }

    public static void main(String[] args) {


//        getAllNewSongs();
//        getAllLongBeach();
//        stuffVersesToAll();
        fixNewSongInfo();
    }

    private static void fixNewSongInfo() {
        EntityManager em = null;
        ArrayList<Integer> failedDownload1 = new ArrayList<Integer>();
        ArrayList<Integer> failedDownload2 = new ArrayList<Integer>();
        int x;
        EntityManagerFactory factory;
        factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
        em = factory.createEntityManager();

        try {
            // for new songs
            for (x = 1; x <= 416; x++) {

                try {

                    HymnsEntity hymn = em.find(HymnsEntity.class, "NS" + x);
                    if (hymn == null)
                        continue;
                    HymnsEntity hymnFromWeb=HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_NEWSONGS,"NS",""+x,"NS"+x);


                    em.getTransaction().begin();
                    hymn.setTune(hymnFromWeb.getTune());
                    hymn.setTime(hymnFromWeb.getTime());
                    hymn.setMeter(hymnFromWeb.getMeter());
                    hymn.setKey(hymnFromWeb.getKey());
                    em.getTransaction().commit();
                    System.out.println("info saved for "+x);


                } catch (IOException e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
                    failedDownload1.add(x);
                }

            }

            // for long beach
            for (x = 501; x <= 582; x++) {

                try {

                    HymnsEntity hymn = em.find(HymnsEntity.class, "NS" + x);
                    if (hymn == null)
                        continue;
                    HymnsEntity hymnFromWeb=HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_LONGBEACH,"LB",Integer.toString(x-500),"LB"+Integer.toString(x-500));

                    em.getTransaction().begin();
                    hymn.setTune(hymnFromWeb.getTune());
                    hymn.setTime(hymnFromWeb.getTime());
                    hymn.setMeter(hymnFromWeb.getMeter());
                    hymn.setKey(hymnFromWeb.getKey());
                    em.getTransaction().commit();
                    System.out.println("info saved for "+x);


                } catch (IOException e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
                    failedDownload2.add(x);
                }

            }
        } catch (Exception e) {

            throw new RuntimeException(e);
        } finally {
            System.out.println("failed new songs: " + failedDownload1);
            System.out.println("failed long beach: " + failedDownload2);
        }


    }

    private static void stuffVersesToAll() {

        EntityManager em = null;
        ArrayList<Integer> failedDownload = new ArrayList<Integer>();
        int x;
        EntityManagerFactory factory;


        x = 1;

        factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
        em = factory.createEntityManager();


        try {
            for (x = 1; x <= 1348; x++) {

                try {

                    HymnsEntity hymn = em.find(HymnsEntity.class, "E" + x);
                    if (hymn == null)
                        continue;
                    HymnsEntity hymnFromWeb=HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_URL,"E",""+x,"E"+x);

                    em.getTransaction().begin();
                    hymn.setVerse(hymnFromWeb.getVerse());
                    em.getTransaction().commit();
                    System.out.println("Verse saved for "+x);


                } catch (IOException e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
                    failedDownload.add(x);
                }

            }

      // for new songs
            for (x = 129; x <= 129; x++) {

                try {

                    HymnsEntity hymn = em.find(HymnsEntity.class, "NS" + x);
                    if (hymn == null)
                        continue;
                    HymnsEntity hymnFromWeb=HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_NEWSONGS,"NS",""+x,"NS"+x);

                    if (hymnFromWeb.getVerse()==null) {
                        System.out.println("NS"+x+" doesn't have verse. skipping...");
                        continue;
                    }
                    em.getTransaction().begin();
                    hymn.setVerse(hymnFromWeb.getVerse());
                    em.getTransaction().commit();
                    System.out.println("Verse saved for "+x);


                } catch (IOException e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
                    failedDownload.add(x);
                }

            }

            // for long beach
            for (x = 501; x <= 582; x++) {

                try {

                    HymnsEntity hymn = em.find(HymnsEntity.class, "NS" + x);
                    if (hymn == null)
                        continue;
                    HymnsEntity hymnFromWeb=HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_LONGBEACH,"LB",Integer.toString(x-500),"LB"+Integer.toString(x-500));

                    if (hymnFromWeb.getVerse()==null) {
                        System.out.println("NS"+x+" doesn't have verse. skipping...");
                        continue;
                    }
                    em.getTransaction().begin();
                    hymn.setVerse(hymnFromWeb.getVerse());
                    em.getTransaction().commit();
                    System.out.println("Verse saved for "+x);


                } catch (IOException e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
                    failedDownload.add(x);
                }

            }
//            Integer[] failures = {501, 502, 503, 510, 511, 538, 539, 540, 541, 542, 544, 545, 551, 552, 559, 560, 561, 562, 569, 570, 577, 578, 579};
//            for(int y: failures) {
//                try {
//
//                    HymnsEntity hymn = em.find(HymnsEntity.class, "NS" + y);
//                    if (hymn == null)
//                        continue;
//                    HymnsEntity hymnFromWeb=HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_LONGBEACH,"LB",Integer.toString(y-500));
//
//                    if (hymnFromWeb.getVerse()==null) {
//                        System.out.println("NS"+y+" doesn't have verse. skipping...");
//                        continue;
//                    }
//                    em.getTransaction().begin();
//                    hymn.setVerse(hymnFromWeb.getVerse());
//                    em.getTransaction().commit();
//                    System.out.println("Verse saved for "+y);
//
//
//                } catch (IOException e) {
//                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
//                    failedDownload.add(x);
//                }
//
//            }



        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {

             System.out.println("failed downloads: " +failedDownload);
        }


    }

    private static void getAllLongBeach() {

        EntityManager em = null;
        ArrayList<Integer> failedDownload = new ArrayList<Integer>();
        int x;
        EntityManagerFactory factory;


        x = 1;
        try {
            factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
            em = factory.createEntityManager();
            for (x = 1; x <= 82; x++) {

                try {

                    HymnsEntity longBeach = HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_LONGBEACH, "LB", "" + x,"LB"+x);
                    longBeach.setHymnGroup("NS");
                    longBeach.setNo(Integer.toString(x + 500));
                    longBeach.setId(longBeach.getHymnGroup() + longBeach.getNo());
                    // add leading zeros to hymn number
                    String hymnNo = String.format("%02d", Integer.valueOf(x));
                    em.getTransaction().begin();

                    longBeach.setSheetMusicLink("http://www.hymnal.net/Hymns/LongBeach/images/lb" + hymnNo + "_p.png");
                    em.persist(longBeach);
                    em.getTransaction().commit();
                    System.out.println("Hymn NS" + x + " saved!");

                } catch (IOException e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
                    failedDownload.add(x);
                }
            }




            // redownload failed ones
//            Integer[] failures = {27, 28, 29, 30, 31, 34};
//
//            for (Integer y :Arrays.asList(failures)) {
//
//                try {
//
//                    HymnsEntity longBeach = HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_LONGBEACH, "LB", "" + y);
//                    longBeach.setHymnGroup("NS");
//                    longBeach.setNo(Integer.toString(y+500));
//                    longBeach.setId(longBeach.getHymnGroup()+longBeach.getNo());
//                    // add leading zeros to hymn number
//                    String hymnNo = String.format("%02d", Integer.valueOf(y));
//                    em.getTransaction().begin();
//
//                    longBeach.setSheetMusicLink("http://www.hymnal.net/Hymns/LongBeach/images/lb" + hymnNo + "_p.png");
//                    em.persist(longBeach);
//                    em.getTransaction().commit();
//                    System.out.println("Hymn NS" + y + " saved!");
//
//                } catch (IOException e) {
//                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + y);
//                    failedDownload.add(y);
//                }
//            }


        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();

            System.out.println("failed downloads: " + failedDownload);
            System.out.println("iteration stopped at x: " + x);
        }

        // fix New Songs ******************

        try {
            factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
            em = factory.createEntityManager();
            for (x = 501; x <= 582; x++) {

                HymnsEntity hymn = em.find(HymnsEntity.class, "NS" + x);
                if (hymn == null) continue;

                em.getTransaction().begin();
                String firstLineChorus = hymn.getFirstChorusLine();
                if (firstLineChorus != null) {
                    firstLineChorus = firstLineChorus.replace("“", "\"").replace("”", "\"");
                    hymn.setFirstChorusLine(firstLineChorus.toUpperCase());
                }
                hymn.setFirstStanzaLine(hymn.getFirstStanzaLine().replace("“", "\"").replace("”", "\""));

                for (StanzaEntity stanza : hymn.getStanzas()) {
                    stanza.setText(stanza.getText() + "<br/>");
                }


                em.getTransaction().commit();
                System.out.println(hymn);


            }

        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();

        }


    }


    private static void getAllNewSongs() {

        EntityManager em = null;
        ArrayList<Integer> failedDownload = new ArrayList<Integer>();
        int x;
        EntityManagerFactory factory;


        x = 1;
        try {
            factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
            em = factory.createEntityManager();
            for (x = 408; x <= 416; x++) {

                try {

                    HymnsEntity newSong = HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_NEWSONGS, "NS", "" + x,"NS"+x);
                    // add leading zeros to hymn number
                    String hymnNo = String.format("%04d", Integer.valueOf(x));
                    em.getTransaction().begin();

                    newSong.setSheetMusicLink("http://www.hymnal.net/Hymns/NewSongs/images/ns" + hymnNo + "_p.png");
                    em.persist(newSong);
                    em.getTransaction().commit();
                    System.out.println("Hymn NS" + x + " saved!");

                } catch (IOException e) {
                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
                    failedDownload.add(x);
                }
            }

            // redownload failed ones
//            Integer[] failures = {146};
//
//            for (Integer y :Arrays.asList(failures)) {
//
//                try {
//
//                    HymnsEntity newSong = HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_NEWSONGS, "NS", "" + y);
//                    // add leading zeros to hymn number
//                    String hymnNo = String.format("%04d", Integer.valueOf(y));
//                    em.getTransaction().begin();
//
//                    newSong.setSheetMusicLink("http://www.hymnal.net/Hymns/NewSongs/images/ns"+hymnNo+"_p.png");
//                    em.persist(newSong);
//                    em.getTransaction().commit();
//                    System.out.println("Hymn NS" + y + " saved!");
//
//                } catch (IOException e) {
//                    System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + y);
//                    failedDownload.add(y);
//                }
//            }


        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();

            System.out.println("failed downloads: " + failedDownload);
            System.out.println("iteration stopped at x: " + x);
        }

        // fix New Songs ******************

        try {
            factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
            em = factory.createEntityManager();
            for (x = 1; x <= 416; x++) {

                HymnsEntity hymn = em.find(HymnsEntity.class, "NS" + x);
                if (hymn == null) continue;

                em.getTransaction().begin();
                String firstLineChorus = hymn.getFirstChorusLine();
                if (firstLineChorus != null) {
                    firstLineChorus = firstLineChorus.replace("“", "\"").replace("”", "\"");
                    hymn.setFirstChorusLine(firstLineChorus.toUpperCase());
                }
                hymn.setFirstStanzaLine(hymn.getFirstStanzaLine().replace("“", "\"").replace("”", "\""));

                for (StanzaEntity stanza : hymn.getStanzas()) {
                    stanza.setText(stanza.getText() + "<br/>");
                }


                em.getTransaction().commit();
                System.out.println(hymn);


            }

        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();

        }


    }


    private static void getAllCebuanoHymns() {

        EntityManager em = null;
        ArrayList<Integer> failedDownload = new ArrayList<Integer>();
        int x = 1;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
            em = factory.createEntityManager();
            for (x = 1; x <= 1348; x++) {

                HymnsEntity hymn = em.find(HymnsEntity.class, "E" + x);
//                String cebuanoHymnId = hymn.getRelatedHymnByGroupId("CB");
//                if (cebuanoHymnId != null) {
//
//                    try {
//
//                        HymnsEntity cebuanoHymn = HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_CEBUANO, "CB", "" + x, "CB"+x);
//                        em.getTransaction().begin();
//                        em.persist(cebuanoHymn);
//                        em.getTransaction().commit();
//                        System.out.println("Hymn CB" + x + " saved!");
//
//                    } catch (IOException e) {
//                        System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + x);
//                        failedDownload.add(x);
//                    }
//                }

            }

        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();

            System.out.println("failed downloads: " + failedDownload);
            System.out.println("iteration stopped at x: " + x);
        }

        // redownload failed ones
        ArrayList<Integer> stillFailingDownloads = new ArrayList<Integer>();

        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
            em = factory.createEntityManager();

            for (int y : failedDownload) {

                HymnsEntity hymn = em.find(HymnsEntity.class, "E" + y);
//                String cebuanoHymnId = hymn.getRelatedHymnByGroupId("CB");
//                if (cebuanoHymnId != null) {
//
//                    try {
//                        HymnsEntity cebuanoHymn = HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_CEBUANO, "CB", "" + y,"CB"+y);
//                        em.getTransaction().begin();
//                        em.persist(cebuanoHymn);
//                        em.getTransaction().commit();
//                        System.out.println("Hymn CB" + y + " saved!");
//                    } catch (IOException e) {
//                        System.out.println("Warning! could not retrieve hymn from web. hymn no is: " + y);
//
//                        stillFailingDownloads.add(y);
//                    }
//                }

            }

        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();

            System.out.println("failed downloads: " + stillFailingDownloads);
        }

        // fix cebuanoHymns ******************

        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
            em = factory.createEntityManager();
            for (x = 1; x <= 1348; x++) {

                HymnsEntity hymn = em.find(HymnsEntity.class, "CB" + x);
                if (hymn == null) continue;

                em.getTransaction().begin();
                String firstLineChorus = hymn.getFirstChorusLine();
                if (firstLineChorus != null) {
                    firstLineChorus = firstLineChorus.replace("“", "\"").replace("”", "\"");
                    hymn.setFirstChorusLine(firstLineChorus.toUpperCase());
                }
                hymn.setFirstStanzaLine(hymn.getFirstStanzaLine().replace("“", "\"").replace("”", "\""));

                hymn.setParentHymn("E" + x);

                for (StanzaEntity stanza : hymn.getStanzas()) {
                    stanza.setText(stanza.getText().replace("<br />", "<br/>") + "<br/>");
                }


                em.getTransaction().commit();
                System.out.println(hymn);


            }

        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();

        }


    }
}