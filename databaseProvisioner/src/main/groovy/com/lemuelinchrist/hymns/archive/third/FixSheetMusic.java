package com.lemuelinchrist.hymns.archive.third;

import com.lemuelinchrist.hymns.beans.HymnsEntity;

import java.util.List;

import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;
import javax.persistence.Query;

/**
 * Created by lemuelcantos on 18/8/14.
 */
public class FixSheetMusic {
    private static final String HYMNS_UNIT = "hymnsUnit";

    public static void main(String args[]) {

//        fixSheetMusic();
    }

    private static void fixSheetMusic() {
        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.sheetMusicLink is not null");

            List<HymnsEntity> hymns = query.getResultList();
            for (HymnsEntity hymn : hymns) {
                System.out.println("hymn no: "+hymn.getId());
                String sheetMusicLink = hymn.getSheetMusicLink();
                System.out.println("old link: " + sheetMusicLink);
                // replace with something like this https://www.hymnal.net/Hymns/Hymnal/svg/e0028_p.svg
                sheetMusicLink=sheetMusicLink.replace("png","svg");
                sheetMusicLink=sheetMusicLink.replace("images","svg");

                System.out.println("new link: " + sheetMusicLink);
                em.getTransaction().begin();
                hymn.setSheetMusicLink(sheetMusicLink);
                em.getTransaction().commit();

            }
        }catch (Exception e) {

        }
    }
}
