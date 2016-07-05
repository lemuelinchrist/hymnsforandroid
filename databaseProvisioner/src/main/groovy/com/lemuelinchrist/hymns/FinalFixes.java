package com.lemuelinchrist.hymns;

import com.lemuelinchrist.hymns.beans.HymnsEntity;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;
import javax.persistence.Query;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

public class FinalFixes {

    public static void main(String[] args) {



//        fixTunesByMakingThemString();
//        findBeFilledParentHymns();
    }

    private static void findBeFilledParentHymns() {
        EntityManager em = null;
        HashSet<String> failedHymns = new HashSet<String>();
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory("newHymns");
            em = factory.createEntityManager();

            for (int x=1; x<=384; x++) {
                HymnsEntity hymn = em.find(HymnsEntity.class,"BF"+x);
                try {
                    String words = hymn.getFirstStanzaLine();

                    String[] wordArray = words.toLowerCase().replaceAll(" and ", " ").replaceAll(" the "," ").replaceAll("\\.","").replaceAll(",","")
                            .replaceAll("you ", "").replaceAll("—","".replaceAll(";",""))
                            .replaceAll("!","").split("\\s+");

                    System.out.println("BF"+x+": "+ Arrays.asList(wordArray).toString());
                    StringBuilder s = new StringBuilder("select s from HymnsEntity s where ");
                    int z;
                    for(z=1;z<=wordArray.length && z<=5; z++) {
                        s.append("s.firstStanzaLine like :word"+z+" and ");
                    }
                    s.append("s.hymnGroup is not null");
                    Query query = em.createQuery(s.toString());

                    for(int zz=1;zz<z;zz++){
                        query.setParameter("word"+zz,"%"+wordArray[zz-1]+"%");
                    }



                    query.setMaxResults(2);
                    List<HymnsEntity> stanzas = query.getResultList();
                    for(HymnsEntity relatedHymn:stanzas) {
                        if(relatedHymn.getHymnGroup().equals("BF")) continue;
                        System.out.println("match: "+relatedHymn.getId()+" : " +relatedHymn.getFirstStanzaLine());
                        em.getTransaction().begin();
//                        List<RelatedEntity> relatedList = new ArrayList<RelatedEntity>();
//                        RelatedEntity relatedEntity=new RelatedEntity();
//                        relatedList.add(relatedEntity);
//                        relatedEntity.setHymn(hymn);
//                        relatedEntity.setRelatedId(relatedHymn.getId());
//                        hymn.setRelatedHymns(relatedList);
                        hymn.setParentHymn(relatedHymn.getId());
                        em.getTransaction().commit();
                    }




                } catch (Exception e) {
//                    System.out.println("warning! hymn failed to save: " + hymn.getId());
//                    failedHymns.add(hymn.getId());
                    throw e;

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


    private static void fixTunesByMakingThemString() {
        EntityManager em = null;
        HashSet<String> failedHymns = new HashSet<String>();
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory("newHymns");
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.hymnGroup='BF'");

            List<HymnsEntity> related = query.getResultList();
            for (HymnsEntity hymnFromDb : related) {
                if (hymnFromDb.getTune() == null) continue;
                try {
                    em.getTransaction().begin();
                    hymnFromDb.setTune(" " + hymnFromDb.getTune());

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
}