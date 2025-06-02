package com.lemuelinchrist.hymns.lib;

import com.lemuelinchrist.hymns.lib.beans.HymnsEntity;
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity;
import com.lemuelinchrist.hymns.lib.beans.TuneEntity;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.Persistence;
import jakarta.persistence.Query;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Created by lemuelcantos on 31/10/15.
 */
public class Dao {

    private final EntityManager em;

    public Dao() {
        EntityManagerFactory factory = Persistence.createEntityManagerFactory(Constants.HYMNS_UNIT);
        em = factory.createEntityManager();

    }

    public HymnsEntity find(String HymnId) {
        return em.find(HymnsEntity.class, HymnId);

    }

    public List findAll() {
        return findAll(null);

    }

    public List findAll(String where) {
        try {
            StringBuilder queryString = new StringBuilder("select h from HymnsEntity h");
            if (where!=null && !where.isEmpty()) {
                queryString.append(" where ").append(where);
            }
            Query query = em.createQuery(queryString.toString());
            List hymns = query.getResultList();

            return hymns;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

    }

    public void save(HymnsEntity hymn) {
        em.getTransaction().begin();
        em.persist(hymn);
        if(hymn.getParentHymn()!=null && !hymn.getParentHymn().isEmpty()) {
            HymnsEntity parentHymn = em.find(HymnsEntity.class, hymn.getParentHymn());
            if(parentHymn==null) {
                throw new RuntimeException("parentHymn is non-existent: " +hymn.getId());
            }

            // Get current related set
            Set<String> relatedSet = parentHymn.getRelated();
            if (relatedSet == null) {
                relatedSet = new HashSet<>();
            }

            // Add the new hymn ID
            relatedSet.add(hymn.getId());

            // IMPORTANT: Use the setter to let JPA know it changed
            parentHymn.setRelated(relatedSet);
        }
        em.getTransaction().commit();
        System.out.println("Hymn " + hymn.getId() + " saved!");
    }


    public void save(TuneEntity tune) {
        em.getTransaction().begin();
        em.persist(tune);
        em.getTransaction().commit();
        System.out.println("Tune " + tune.getId() + " saved!");
    }

    public void addRelatedHymn(String parentHymn, String relatedToAdd) {
        if (parentHymn == null || parentHymn.isEmpty()) {
            System.out.println("Warning! no parent hymn! exiting");
            return;
        }
        em.getTransaction().begin();
        HymnsEntity parentEntity = em.find(HymnsEntity.class, parentHymn);
        Set<String> relatedSet = parentEntity.getRelated();
        if (relatedSet == null) {
            relatedSet = new HashSet<String>();
        }
        relatedSet.add(relatedToAdd);
        parentEntity.setRelated(relatedSet);
        System.out.println("related: " + parentEntity.getRelated());
        em.getTransaction().commit();
        System.out.println("adding of Related Hymn successful, Hymn " + parentEntity.getId() + " saved!");


    }

    public void fixParentHymnOfChildren(String parentHymn) {
        HymnsEntity parentEntity = em.find(HymnsEntity.class, parentHymn);
        Set<String> relatedSet = parentEntity.getRelated();
        System.out.println("*** Parent Hymn: " + parentEntity.getId());
        for(String related: relatedSet) {
            HymnsEntity relatedEntity = em.find(HymnsEntity.class, related);
            if(relatedEntity==null) {
                System.out.println(related + " nonexistent");
                continue;
            }

            if(relatedEntity.getParentHymn()==null) {
                System.out.println("assigning parent hymn of " + relatedEntity.getId() + " to " + parentEntity.getId());
                em.getTransaction().begin();
                relatedEntity.setParentHymn(parentEntity.getId());
                em.getTransaction().commit();
            }

        }

    }

    public void delete(String hymnId) {
        try {


            System.out.println("looking up: " + hymnId);
            HymnsEntity hymn = em.find(HymnsEntity.class, hymnId);
            if(hymn==null) {
                System.out.println("Hymn not found");
                return;
            }
            System.out.println("trying to delete hymn " + hymn.getId());


            em.getTransaction().begin();
            em.remove(hymn);
            if(hymn.getParentHymn()!=null && !hymn.getParentHymn().isEmpty()) {
                HymnsEntity parentHymn = em.find(HymnsEntity.class, hymn.getParentHymn());
                parentHymn.removeRelated(hymn.getId());
            }
            em.getTransaction().commit();

            System.out.println("hymn " + hymn.getId() + " DELETED!");
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {

        }

    }

    public static void main(String[] args) {
        Dao dao = new Dao();
    }

    public void changeHymnNumber(String previousHymnId, String newHymnGroup, String newHymnNo) {
        System.out.println("changing hymn ID from " + previousHymnId + " to " + newHymnGroup + newHymnNo);
        HymnsEntity hymn = find(previousHymnId);
        if(hymn!=null && em.contains(hymn)) {
            em.detach(hymn);
        }
        hymn.setId(newHymnGroup + newHymnNo);
        hymn.setNo(newHymnNo);
        hymn.setHymnGroup(newHymnGroup);

        for (StanzaEntity stanza : hymn.getStanzas()) {
            stanza.setId(0);
        }

        save(hymn);
        Set<String> relatedSet = hymn.getRelated();

        // change parents of related hymns
        for (String related : relatedSet) {
            if (related == null || related.isEmpty()) continue;
            if (related.equals("CS330")) continue;
            System.out.println("finding relatd: " + related);

            HymnsEntity relatedHymn = find(related);
            if (relatedHymn.getParentHymn().equals(previousHymnId)) {
                em.getTransaction().begin();
                relatedHymn.setParentHymn(newHymnGroup + newHymnNo);
                em.getTransaction().commit();
                System.out.println("changed parent hymn of " + related + " to " + newHymnGroup + newHymnNo);
            }
        }

        List allhymns = findAll();
        for(Object o: allhymns) {
            HymnsEntity hymnCursor = (HymnsEntity) o;
            if(hymnCursor.getRelated()!=null && hymnCursor.getRelated()
                    .contains(previousHymnId) && !hymnCursor.getRelated().contains(newHymnGroup + newHymnNo)){
                HashSet<String> newSet = new HashSet<>(hymnCursor.getRelated());
                newSet.remove(previousHymnId);
                newSet.add(newHymnGroup + newHymnNo);

                em.getTransaction().begin();
                hymnCursor.setRelated(newSet);
                em.getTransaction().commit();
                System.out.println("found hymn" + hymnCursor.getId() + " referencing old number");

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
        for (String related : hymn.getRelated()) {
            if (related == null || related.isEmpty()) continue;
            if (related.equals("CS330")) continue;
            System.out.println("finding relatd: " + related);

            HymnsEntity relatedHymn = find(related);
            if (relatedHymn.getParentHymn().equals(hymnId)) {
                System.out.println("Cleanring related of Hymn " + related);
                em.getTransaction().begin();
                relatedHymn.setRelated(null);
                em.getTransaction().commit();

            }

        }

    }

    public void saveTuneAndSheetMusicLink(HymnsEntity hymn, String tune, String sheetMusicLink) {
        System.out.println("saving tune of hymn: " + hymn.getId());
        System.out.println("tune is: " + tune);
        em.getTransaction().begin();
        hymn.setTune(tune);
        hymn.setSheetMusicLink(sheetMusicLink);
        em.getTransaction().commit();
        System.out.println("save successful!");
    }

    public void removeAllTS() {
        List<HymnsEntity> hymns = findAll();
        for(HymnsEntity hymn: hymns) {
            System.out.println("******* Examining hymn: " + hymn.getId());
            String relatedToRemove=null;
            if (hymn.getRelated()==null) continue;
            for(String related: hymn.getRelated()) {
                if(related.contains("TS")) {
                    System.out.println("Removing " + related);
                    relatedToRemove=related;
                    break;
                }
            }
            if (relatedToRemove!=null) {
                em.getTransaction().begin();
                Set<String> related = hymn.getRelated();
                related.remove(relatedToRemove);
                hymn.setRelated(related);
                em.getTransaction().commit();
            }
        }
    }

    public void changeStanza(String hymnId, int stanzaId, String replacement ) {
        HymnsEntity hymn = find(hymnId);
        for(StanzaEntity stanza: hymn.getStanzas()) {
            if(stanza.getId()==stanzaId) {
                em.getTransaction().begin();
                stanza.setText(replacement);
                em.getTransaction().commit();
            }
        }

    }

    public void fixFirstStanzaLine() {
        List<HymnsEntity> hymns = findAll("h.firstStanzaLine IS NULL");
        for(HymnsEntity hymn: hymns) {
            System.out.println("fixing hymn: " + hymn.getId());
            System.out.println("first stanza: " + hymn.getFirstStanzaLine());
            System.out.println("first chorus: " + hymn.getFirstChorusLine());
            em.getTransaction().begin();
            hymn.setFirstStanzaLine(hymn.getFirstChorusLine());
            hymn.setFirstChorusLine(null);
            em.getTransaction().commit();
        }
    }

    public void changeRelatedHymn(String parentHymn, String related) {
        if (parentHymn == null || parentHymn.isEmpty()) {
            System.out.println("Warning! no parent hymn! exiting");
            return;
        }
        em.getTransaction().begin();
        HymnsEntity parentEntity = em.find(HymnsEntity.class, parentHymn);
        parentEntity.setRelatedString(related);
        System.out.println("related: " + parentEntity.getRelated());
        em.getTransaction().commit();


    }

    public void fixComposer() {
        List<HymnsEntity> hymns = findAll("h.composer LIKE '%MIDI%'");
        for(HymnsEntity hymn: hymns) {
            System.out.println("fixing hymn: " + hymn.getId());
            System.out.println("composer : " + hymn.getComposer());
            em.getTransaction().begin();
            hymn.setComposer(null);
            em.getTransaction().commit();
        }
    }

    public void changeParentHymn(String hymn, String parent) {
        if (hymn == null || hymn.isEmpty()) {
            System.out.println("Warning! no hymn! exiting");
            return;
        }
        em.getTransaction().begin();
        HymnsEntity hymnEntity = em.find(HymnsEntity.class, hymn);
        hymnEntity.setParentHymn(parent);
        System.out.println("parent hymn changed : " + hymnEntity.getId());
        em.getTransaction().commit();
    }
}
