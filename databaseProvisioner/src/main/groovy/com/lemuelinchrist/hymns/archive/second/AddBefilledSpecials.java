package com.lemuelinchrist.hymns.archive.second;

import com.lemuelinchrist.hymns.HymnalNetExtractor;
import com.lemuelinchrist.hymns.beans.HymnsEntity;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;

/**
 * Created by lemuelcantos on 22/8/13.
 */
public class AddBefilledSpecials {
    public static void main(String[] args) throws Exception {
        addSomeBefilledInfo();
    }

    private static void addSomeBefilledInfo() {
        EntityManager em = null;

        int x;//157
        EntityManagerFactory factory;
        factory = Persistence.createEntityManagerFactory(AddNewChineseSupplement.HYMNS_UNIT);
        em = factory.createEntityManager();
        try {
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(HymnalNetExtractor.HYMNAL_NET_URL, "BF", "8773","BF8773");
            hymn.setNo("69");
            hymn.setId("BF69");
            hymn.setStanzas(null);
            em.getTransaction().begin();
            em.persist(hymn);
            em.getTransaction().commit();
        } catch (Exception e) {

        }
    }
}
