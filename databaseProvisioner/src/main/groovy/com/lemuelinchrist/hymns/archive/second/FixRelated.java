package com.lemuelinchrist.hymns.archive.second;

import com.lemuelinchrist.hymns.beans.HymnsEntity;
//import com.lemuelinchrist.hymns.beans.RelatedEntity;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;
import javax.persistence.Query;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/**
 * Created by lcantos on 8/23/13.
 */
public class FixRelated {
    private static final String HYMNS_UNIT = "hymnsUnit";

    public static void main(String[] args) {
//        changeChineseRelatedOfNewSong();
//        fixBefilledRelated();
        fixEnglishRelated();

    }

    private static void fixEnglishRelated() {
        EntityManager em = null;
        HashSet<String> unrequitedCS = new HashSet<String>();
        List<String> noCSrelated = new ArrayList<String>();
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.hymnGroup='CS'");

            List<HymnsEntity> hymns = query.getResultList();
//            for (HymnsEntity csHymnFromDb : hymns) {
//
//                 String engRelated = csHymnFromDb.getRelatedHymnByGroupId("E");
//                if (engRelated==null) continue;
//                System.out.println("looking into hymn: " + csHymnFromDb.getId());
//                System.out.println("   english related id: "+ engRelated);
//                HymnsEntity englishHymnFromDb = em.find(HymnsEntity.class,engRelated);
//                String csRelated = englishHymnFromDb.getRelatedHymnByGroupId("CS");
//                if(csRelated==null) {
//                    System.out.println("english hymn no CS related: " + englishHymnFromDb.getId());
//                    noCSrelated.add(englishHymnFromDb.getId());
//                    unrequitedCS.add(csHymnFromDb.getId());
//                    em.getTransaction().begin();
//                    RelatedEntity csRelatedEntity = new RelatedEntity();
//                    csRelatedEntity.setRelatedId(csHymnFromDb.getId());
//                    csRelatedEntity.setHymn(englishHymnFromDb);
//                    if(englishHymnFromDb.getRelatedHymns()!=null) {
//                        englishHymnFromDb.getRelatedHymns().add(csRelatedEntity);
//                    } else {
//                        List<RelatedEntity> relatedHymns = new ArrayList<RelatedEntity>();
//                        relatedHymns.add(csRelatedEntity);
//                        englishHymnFromDb.setRelatedHymns(relatedHymns);
//                    }
//                    em.getTransaction().commit();
//
//
//                } else if(!csRelated.equals(csHymnFromDb.getId())) {
//                    System.out.println("Somethings terribly wrong!!");
//                    System.out.println("cs from db: " +csHymnFromDb.getId());
//                    System.out.println("cs from english: " +csRelated);
//                    throw new RuntimeException();
//                }
//            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
            System.out.println("hymns that failed: " + unrequitedCS);
            System.out.println("hymns with wrong related ids: " + noCSrelated);
        }

    }

    private static void fixBefilledRelated() {
        EntityManager em = null;
        HashSet<String> failedHymns = new HashSet<String>();
        List<String> wrongHymns = new ArrayList<String>();
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.hymnGroup='BF'");

            List<HymnsEntity> hymns = query.getResultList();
            for (HymnsEntity hymnFromDb : hymns) {
                System.out.println("looking into hymn: " + hymnFromDb.getId());
                System.out.println("   parent: "+hymnFromDb.getParentHymn());

                em.getTransaction().begin();
//                ArrayList<RelatedEntity> relatedHymns = new ArrayList<RelatedEntity>();
//                if(hymnFromDb.getParentHymn()!=null){
//                    RelatedEntity r = new RelatedEntity();
//                    r.setRelatedId(hymnFromDb.getParentHymn());
//                    r.setHymn(hymnFromDb);
//                    relatedHymns.add(r);
//                }
//                hymnFromDb.setRelatedHymns(relatedHymns);
//                em.getTransaction().commit();
//
//                for(RelatedEntity r:hymnFromDb.getRelatedHymns()) {
//                    System.out.println("   "+r.getRelatedId());
//                }
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
            System.out.println("hymns that failed: " + failedHymns);
            System.out.println("hymns with wrong related ids: " + wrongHymns);
        }
    }



    private static void changeChineseRelatedOfNewSong() {
        EntityManager em = null;
        HashSet<String> failedHymns = new HashSet<String>();
        List<String> wrongHymns = new ArrayList<String>();
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.hymnGroup='NS'");

            List<HymnsEntity> hymns = query.getResultList();
            for (HymnsEntity hymnFromDb : hymns) {
                if(hymnFromDb.getId().equals("NS12")) continue;
//                System.out.println("looking into hymn: " + hymnFromDb.getId());
//                String relatedId = hymnFromDb.getRelatedHymnByGroupId("C");
//                if (relatedId==null)continue;
//                System.out.println("ns:" + hymnFromDb.getNo() + "  found chinese: " + relatedId);
//                for(RelatedEntity r:hymnFromDb.getRelatedHymns()) {
//                    if(r.getRelatedId().equals(relatedId)){
//
//                        em.getTransaction().begin();
//                        r.setRelatedId("CS"+relatedId.substring(1));
//                        em.getTransaction().commit();
//                        break;
//                    }
//                }
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
            System.out.println("hymns that failed: " + failedHymns);
            System.out.println("hymns with wrong related ids: " + wrongHymns);
        }
    }
}
