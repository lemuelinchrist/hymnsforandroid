package com.lemuelinchrist.hymns.archive.third;

import com.lemuelinchrist.hymns.beans.HymnsEntity;
//import com.lemuelinchrist.hymns.beans.RelatedEntity;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;
import javax.persistence.Query;

/**
 * Created by lemuelcantos on 9/9/13.
 */
public class FixRelatedHymns {
    private static final String HYMNS_UNIT = "hymnsUnit";

    public static void main(String args[]) {

//        migrateRelatedHymns();
//        removeNotes();

        addMissingHymns();
//        addMissingHymns2();


    }

    private static void addMissingHymns2() {
        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.parentHymn is not null");

            List<HymnsEntity> hymns = query.getResultList();
            for (HymnsEntity hymn : hymns) {
                em.detach(hymn);

            }
            System.out.println("finished detaching hymns");

            for (HymnsEntity hymn : hymns) {
                System.out.println("Working on hymn: " + hymn.getId() + " parent hymn: " + hymn.getParentHymn());

                HymnsEntity parentHymn = em.find(HymnsEntity.class,hymn.getParentHymn());

                if (parentHymn==null) continue;

                Set<String> relatedSet = parentHymn.getRelated();
                System.out.println("old related set: "  + relatedSet);
                HashSet<String> newRelatedSet = new HashSet<String>();
                newRelatedSet.addAll(relatedSet);
                newRelatedSet.add(hymn.getId());
                newRelatedSet.remove("");
                newRelatedSet.remove(" ");
                newRelatedSet.remove(null);
                System.out.println("new related set: " + newRelatedSet);
                em.getTransaction().begin();
                parentHymn.setRelated(newRelatedSet);
                em.getTransaction().commit();

            }



        } catch (Exception e) {
            e.printStackTrace();

        }
    }

    private static void addMissingHymns() {

        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h");

            List<HymnsEntity> hymns = query.getResultList();

            for (HymnsEntity hymn : hymns) {
                System.out.println("Working on hymn: " + hymn.getId());


                Set<String> relatedSet = hymn.getRelated();
                System.out.println("old related set: "  + relatedSet);
                HashSet<String> newRelatedSet = new HashSet<String>();
                for(String relatedHymn:relatedSet) {
                    newRelatedSet.add(relatedHymn);
                    System.out.println("finding relatedHymn: " + relatedHymn);
                    HymnsEntity relatedHymnsEntity = em.find(HymnsEntity.class,relatedHymn);
                    if (relatedHymnsEntity==null) continue;
                    em.detach(relatedHymnsEntity);
                    for(String relatedHymnSecondLevel:relatedHymnsEntity.getRelated()) {
                        if(relatedHymnSecondLevel.equals(hymn.getId())) continue;

                        newRelatedSet.add(relatedHymnSecondLevel);

                    }




                }
                newRelatedSet.remove("");
                newRelatedSet.remove(" ");
                newRelatedSet.remove(null);
                System.out.println("new related set: " + newRelatedSet);
                em.getTransaction().begin();
                hymn.setRelated(newRelatedSet);
                em.getTransaction().commit();

            }



        } catch (Exception e) {
            e.printStackTrace();

        }


    }

    private static void removeNotes() {
        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h");

            List<HymnsEntity> hymns = query.getResultList();

            for (HymnsEntity hymn : hymns) {
                System.out.println("Working on hymn: " + hymn.getId());
                Set<String> relatedSet = hymn.getRelated();
                HashSet<String> newRelatedSet = new HashSet<String>();
                for(String r:relatedSet) {
                    newRelatedSet.add(r.split("(?<=[\\d])[\\D]")[0]);

                }
                em.getTransaction().begin();
                hymn.setRelated(newRelatedSet);
                em.getTransaction().commit();

            }



        } catch (Exception e) {

        }

    }

    private static void migrateRelatedHymns() {
        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h");

            List<HymnsEntity> hymns = query.getResultList();

            for (HymnsEntity hymn : hymns) {
                System.out.println("Working on hymn: " + hymn.getId());
                HashSet<String> relatedSet = new HashSet<String>();
//                for(RelatedEntity r: hymn.getRelatedHymns()) {
//                    relatedSet.add(r.getRelatedId());
//                }
                em.getTransaction().begin();
                hymn.setRelated(relatedSet);
                em.getTransaction().commit();


            }



            } catch (Exception e) {

        }
    }
}
