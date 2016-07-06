package com.lemuelinchrist.hymns.lib;

import com.lemuelinchrist.hymns.lib.beans.HymnsEntity;
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity;

import java.util.HashSet;
import java.util.Set;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;

/**
 * Created by lemuelcantos on 31/10/15.
 */
public class Dao {

    private final EntityManager em;

    public Dao() {
        EntityManagerFactory factory = Persistence.createEntityManagerFactory(HymnalNetExtractor.HYMNS_UNIT);
        em = factory.createEntityManager();

    }
    public HymnsEntity find(String HymnId) {
        return em.find(HymnsEntity.class, HymnId);


    }

    public void save(HymnsEntity hymn) {
        em.getTransaction().begin();
        em.persist(hymn);
        em.getTransaction().commit();
        System.out.println("Hymn "+hymn.getId()+" saved!");
    }

    public void addRelatedHymn(String parentHymn, String relatedToAdd) {
        if (parentHymn==null || parentHymn.isEmpty()) {
            System.out.println("Warning! no parent hymn! exiting");
            return;
        }
        em.getTransaction().begin();
        HymnsEntity parentEntity = em.find(HymnsEntity.class, parentHymn);
        Set<String> relatedSet = parentEntity.getRelated();
        if (relatedSet==null) {
            relatedSet= new HashSet<String>();
        }
        relatedSet.add(relatedToAdd);
        parentEntity.setRelated(relatedSet);
        System.out.println("related: " + parentEntity.getRelated());
        em.getTransaction().commit();
        System.out.println("adding of Related Hymn successful, Hymn "+parentEntity.getId()+" saved!");



    }

    private void delete(String hymnId) {
        try {


            System.out.println("looking up: " + hymnId);
            HymnsEntity hymn = em.find(HymnsEntity.class, hymnId);
            System.out.println("trying to delete hymn "+hymn.getId());
            em.getTransaction().begin();
            em.remove(hymn);
            em.getTransaction().commit();

            System.out.println("hymn "+hymn.getId()+" DELETED!");
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {

        }

    }

    public static void main(String[] args) {
        Dao dao = new Dao();
    }

    public void changeHymnNumber(String previousHymnId, String newHymnGroup, String newHymnNo ) {
        System.out.println("changing hymn ID from " + previousHymnId + " to " + newHymnGroup + newHymnNo);
        HymnsEntity hymn = find(previousHymnId);
        em.detach(hymn);
        hymn.setId(newHymnGroup + newHymnNo);
        hymn.setNo(newHymnNo);
        hymn.setHymnGroup(newHymnGroup);

        for(StanzaEntity stanza: hymn.getStanzas()) {
            stanza.setId(0);
        }

        save(hymn);
        Set<String> relatedSet = hymn.getRelated();

        // change parents of related hymns
        for(String related:relatedSet) {
            if (related==null || related.isEmpty()) continue;
            if (related.equals("CS330")) continue;
            System.out.println("finding relatd: "+related);

            HymnsEntity relatedHymn = find(related);
            if (relatedHymn.getParentHymn().equals(previousHymnId)) {
                em.getTransaction().begin();
                relatedHymn.setParentHymn(newHymnGroup + newHymnNo);
                em.getTransaction().commit();
                System.out.println("changed parent hymn of "+related+ " to "+newHymnGroup+newHymnNo);
            }
        }



        em.getEntityManagerFactory().getCache().evictAll();


        delete(previousHymnId);
        System.out.println("hymn ID changed from " + previousHymnId + " to " + newHymnGroup + newHymnNo);
        System.out.println("Warning! please manually change sheet music numbers!");

    }

    // note this method doesnt clear related of Hymn but the related of child hymns
    public void clearRelatedOfChildren(String hymnId) {
        HymnsEntity hymn = find(hymnId);
        for (String related: hymn.getRelated()) {
            if (related==null || related.isEmpty()) continue;
            if (related.equals("CS330")) continue;
            System.out.println("finding relatd: "+related);

            HymnsEntity relatedHymn = find(related);
            if (relatedHymn.getParentHymn().equals(hymnId)){
                System.out.println("Cleanring related of Hymn "+related);
                em.getTransaction().begin();
                relatedHymn.setRelated(null);
                em.getTransaction().commit();

            }

        }

    }
}
