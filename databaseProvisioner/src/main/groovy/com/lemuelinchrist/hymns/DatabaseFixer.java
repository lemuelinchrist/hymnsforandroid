package com.lemuelinchrist.hymns;

import com.lemuelinchrist.hymns.beans.HymnsEntity;
//import com.lemuelinchrist.hymns.beans.RelatedEntity;
import com.lemuelinchrist.hymns.beans.StanzaEntity;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;
import javax.persistence.Query;

/**
 * Created by lemuelcantos on 8/8/13.
 */
public class DatabaseFixer {

    public static void main(String args[]) {
//        renameCebuano();
//        migrateOldDatabaseToJpaCreatedOne();
//        addChineseTune();
//        addChineseTuneToHymnsThatFailed();
//        addParentHymnColumn();
//        addOrderingToStanzas();
//        addChineseSupplementInfo();
//        addEnglishSheetMusicLink();


        fixTunes();
    }


    private static void addEnglishSheetMusicLink() {
        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory("newHymns");
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.hymnGroup='E' ");

            List<HymnsEntity> hymns = query.getResultList();
            System.out.println("number of hymns to be processed: " + hymns.size());
            for (HymnsEntity hymnFromDb : hymns) {
                try {

                    // add leading zeros to hymn number
                    String hymnNo = String.format("%04d", Integer.valueOf(hymnFromDb.getNo()));

                    em.getTransaction().begin();
                    String sheetMusicLink = "http://www.hymnal.net/Hymns/Hymnal/images/e" + hymnNo + "_g.png";
                    hymnFromDb.setSheetMusicLink(sheetMusicLink);
                    em.getTransaction().commit();
                    System.out.println("done adding sheet music to: "+hymnFromDb.getId()+ " : " +sheetMusicLink);
                } catch (Exception e) {
                    throw new RuntimeException(e);

                }
            }
            System.out.println("done adding sheet music!!!!!");
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
        }
    }

    private static void addChineseSupplementInfo() {
        EntityManager em = null;
        HashSet<String> failedHymns = new HashSet<String>();
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory("newHymns");
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.hymnGroup='CS' ");

            List<HymnsEntity> related = query.getResultList();
            for (HymnsEntity hymnFromDb : related) {
                try {
                    HymnsEntity hymnFromWeb = HymnalNetExtractor.convertChineseWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_CHINESE_SUPPLEMENT, "CS", hymnFromDb.getNo());
                    em.getTransaction().begin();
                    hymnFromDb.setTune(hymnFromWeb.getTune());
                    hymnFromDb.setAuthor(hymnFromWeb.getAuthor());
                    hymnFromDb.setComposer(hymnFromWeb.getComposer());
                    hymnFromDb.setTime(hymnFromWeb.getTime());
                    hymnFromDb.setMeter(hymnFromWeb.getMeter());

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

    private static void addOrderingToStanzas() {
        EntityManager hymnsUnit = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory("hymnsUnit");
            hymnsUnit = factory.createEntityManager();


            Query query = hymnsUnit.createQuery("select s from StanzaEntity s ");

            List<StanzaEntity> stanzasFromOrigin = query.getResultList();
            for (StanzaEntity stanzaFromOrigin : stanzasFromOrigin) {
                System.out.println("stanza: "+stanzaFromOrigin+" order number: " +stanzaFromOrigin.getOrder());

                hymnsUnit.getTransaction().begin();
                stanzaFromOrigin.setOrder(stanzaFromOrigin.getId());
                hymnsUnit.getTransaction().commit();

            }

        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (hymnsUnit != null)
                hymnsUnit.close();
        }

    }

    private static void addParentHymnColumn() {
        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory("newHymns");
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.hymnGroup='C' or h.hymnGroup='CS' ");

            List<HymnsEntity> hymns = query.getResultList();
            System.out.println("number of hymns to be processed: " + hymns.size());
            for (HymnsEntity hymnFromDb : hymns) {
                try {
                    String english=null;
//                    for(RelatedEntity rel:hymnFromDb.getRelatedHymns()) {
//                        if(rel.getRelatedId().charAt(0)=='E') {
//                            //(?<=s)t matches the first t in streets.
//                            String s = rel.getRelatedId().split("(?<=[\\d])[\\D]")[0];
//                            System.out.println("parent hymn of " +hymnFromDb.getId()+" is "+ s);
//                            english=s;
//                            break;
//                        }
//
//                    }

                    em.getTransaction().begin();
                    hymnFromDb.setParentHymn(english);
                    em.getTransaction().commit();
//                    System.out.println(hymnFromDb);
                } catch (Exception e) {
                    throw new RuntimeException(e);

                }
            }
            System.out.println("done adding parent hymns");
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
        }

    }


    public static void renameCebuano() {
        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory("hymnsUnit");
            em = factory.createEntityManager();
            Query query = em.createQuery("select r from RelatedEntity r where r.relatedId LIKE :keyword ");
            query.setParameter("keyword", "B%");

//            List<RelatedEntity> related = query.getResultList();
//            for (RelatedEntity r : related) {
//                em.getTransaction().begin();
//                r.setRelatedId("C" + r.getRelatedId());
//                em.getTransaction().commit();
//                System.out.println(r);
//            }


        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
        }
    }


    private static void addChineseTune() {
        EntityManager em = null;
        HashSet<String> failedHymns = new HashSet<String>();
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory("newHymns");
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.hymnGroup='C' ");

            List<HymnsEntity> related = query.getResultList();
            for (HymnsEntity hymnFromDb : related) {
                try {
                    HymnsEntity hymnFromWeb = HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_CHINESE, "C", hymnFromDb.getNo(),"C"+hymnFromDb.getNo());
                    em.getTransaction().begin();
                    hymnFromDb.setTune(hymnFromWeb.getTune());
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
        }

        System.out.println("hymns that failed: " + failedHymns);
        //hymns that failed: [C683, C137, C476, C518, C517, C519, C689, C712, C546, C759, C504, C427, C426, C425, C693, C690, C550,
        // C467, C595, C596, C463, C48, C741, C705, C229, C555, C556, C697, C696, C454, C493, C455, C490, C494, C495, C191, C664, C520,
        // C193, C523, C530, C245, C249, C347, C149, C677, C577, C678, C183, C280]



    }
    private static void addChineseTuneToHymnsThatFailed(){
        String[] failedHymns = {"C683","C137","C476", "C518", "C517", "C519", "C689", "C712", "C546", "C759", "C504", "C427", "C426", "C425",
                "C693", "C690", "C550", "C467", "C595", "C596", "C463", "C48", "C741", "C705", "C229", "C555", "C556", "C697", "C696",
                "C454", "C493", "C455", "C490", "C494", "C495", "C191", "C664", "C520",
                "C193", "C523", "C530", "C245", "C249", "C347", "C149", "C677", "C577", "C678", "C183", "C280"};
        List<String> failedHymnsList = new ArrayList<String>();

        EntityManager em = null;

        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory("newHymns");
            em = factory.createEntityManager();

            for (String failedHymn : failedHymns) {
                try {
                    HymnsEntity hymnFromDb = em.find(HymnsEntity.class,failedHymn);

                    HymnsEntity hymnFromWeb = HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_CHINESE, "C", hymnFromDb.getNo(),"C"+hymnFromDb.getNo());
                    em.getTransaction().begin();
                    hymnFromDb.setTune(hymnFromWeb.getTune());
                    em.getTransaction().commit();

                    System.out.println(hymnFromDb);

                } catch (Exception e) {
                    e.printStackTrace();
                    System.out.println("warning! hymn failed to save: " + failedHymn);
                    failedHymnsList.add(failedHymn);

                }

            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
            System.out.println("Hymns that still failed: " + failedHymnsList);
        }


    }

    private static void migrateOldDatabaseToJpaCreatedOne() {
        EntityManager hymnsUnit = null;
        EntityManager newHymns;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory("hymnsUnit");
            hymnsUnit = factory.createEntityManager();
            EntityManagerFactory factory2 = Persistence.createEntityManagerFactory("newHymns");
            newHymns = factory2.createEntityManager();


            Query query = hymnsUnit.createQuery("select h from HymnsEntity h ");

            List<HymnsEntity> hymns = query.getResultList();
            for (HymnsEntity hymn : hymns) {
                hymnsUnit.detach(hymn);
                newHymns.getTransaction().begin();
                newHymns.persist(hymn);
                newHymns.getTransaction().commit();


            }

            System.out.println(hymns);
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (hymnsUnit != null)
                hymnsUnit.close();
        }
    }

    private static void fixTunes() {
        EntityManager hymnsUnitManager = null;
        EntityManager newHymnsManager;
        try {

            EntityManagerFactory factory2 = Persistence.createEntityManagerFactory("newHymns");
            newHymnsManager = factory2.createEntityManager();


            HashMap<String,String> properTunes = new HashMap<String, String>();
            properTunes.put("E1026",	"55331256455534562321");
            properTunes.put("E1063",	"3322155566244332611221");
            properTunes.put("E1206",	"55111176554221111721");
            properTunes.put("E439",	"3332164321752343121765");
            properTunes.put("E580",	"5556543451166671176655");
            properTunes.put("E644",	"3332164321752343121765");
            properTunes.put("E811",	"53653175211111712232");
            properTunes.put("E884",	"5345117712343223217766");
            properTunes.put("E897",	"53455651111235345565");
            properTunes.put("E959",	"321171216651113211712");
            properTunes.put("E966",	"51765435133213272165");
            properTunes.put("C488",	"33323215332254333321235");
            properTunes.put("C710",	"3333543222243212323453");


            for(String hymn:properTunes.keySet()) {
                System.out.println("fixing tune of hymn: " + hymn + " with value: " + properTunes.get(hymn));
                HymnsEntity hymnsEntity = newHymnsManager.find(HymnsEntity.class,hymn);
                newHymnsManager.getTransaction().begin();
                hymnsEntity.setTune(properTunes.get(hymn));
                newHymnsManager.getTransaction().commit();
                System.out.println("hymn fixed!");
            }

            Query query = newHymnsManager.createQuery("select h from HymnsEntity h where h.hymnGroup='C'");

            List<HymnsEntity> hymns = query.getResultList();

            for (HymnsEntity hymn : hymns) {

                if( hymn.getTune()!=null && hymn.getTune().charAt(1)=='.') {
                    System.out.println("fixing tune of Hymn: " + hymn.getId());
                    System.out.println("parent hymn is: " + hymn.getParentHymn());

                    if (hymn.getParentHymn()==null) {
                        System.out.println("skipping...");
                        continue;
                    }
                    HymnsEntity parentHymn =newHymnsManager.find(HymnsEntity.class,hymn.getParentHymn());
                    System.out.println("Tune of parentHymn: " + parentHymn.getTune());
                    newHymnsManager.getTransaction().begin();
                    hymn.setTune(parentHymn.getTune());
                    newHymnsManager.getTransaction().commit();
                    System.out.println("hymn fixed!");

                }
            }



        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (hymnsUnitManager != null)
                hymnsUnitManager.close();
        }
    }
}
