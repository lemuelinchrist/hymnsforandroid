package com.lemuelinchrist.hymns;

import com.lemuelinchrist.hymns.beans.HymnsEntity;
import com.lemuelinchrist.hymns.beans.StanzaEntity;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.io.IOException;
import java.security.KeyManagementException;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.X509TrustManager;
import javax.persistence.EntityManager;
import javax.persistence.EntityManagerFactory;
import javax.persistence.Persistence;
import javax.persistence.Query;

/**
 * Created by lemuelcantos on 6/8/13.
 */
public class HymnalNetExtractor {
    public static final String HYMNS_UNIT = "hymnsUnit";

    public static final String HYMNAL_NET_CHINESE_SUPPLEMENT = "http://www.hymnal.net/zh_TW/hymn.php/ts/";

    public static String HYMNAL_NET_URL = "http://www.hymnal.net/en/hymn.php/h/";
    public static String HYMNAL_NET_CEBUANO = "http://www.hymnal.net/en/hymn.php/cb/";
    public static String HYMNAL_NET_CHINESE = "https://www.hymnal.net/en/hymn/ch/";
    public static String HYMNAL_NET_LONGBEACH = "http://www.hymnal.net/en/hymn.php/lb/";
    public static String HYMNAL_NET_NEWSONGS = "http://www.hymnal.net/en/hymn.php/ns/";
    public static String HYMNAL_NET_TAGALOG  = "https://www.hymnal.net/en/hymn/ht/";

    public static final String DATA_DIR = "/Users/lemuelcantos/Dropbox/hymnDev/HymnsForAndroidProject/HymnsJpa/data";
    public static final String MIDI_PIANO_DIR = DATA_DIR + "/midi2014";
    public static final String SHEET_PIANO_DIR = DATA_DIR + "/pianoSvg";
    public static final String SHEET_GUITAR_DIR = DATA_DIR + "/guitarSvg";

    public static final String NEW_SONGS_SHEET_LINK ="https://www.hymnal.net/en/hymn/ns/";
    public static final String NEW_TUNES_SHEET_LINK ="https://www.hymnal.net/en/hymn/nt/";


    public static String CEBUANO = "cb";
    public static String LONGBEACH= "NS";
    public static String HYMNAL_NET_NEWTUNES="http://www.hymnal.net/en/hymn.php/nt/";

    public static void main(String args[]) throws Exception {
//        for(int x=1403; x<=1404; x++){
//            HymnsEntity hymn = convertWebPageToHymn(HYMNAL_NET_URL, "E", ""+x, ""+x);
//            saveHymn(hymn);
//
//        }
//        HymnsEntity hymn = convertWebPageToHymn(HYMNAL_NET_NEWTUNES, "BF", "1040", "434");

        convertWebPageToHymn(HYMNAL_NET_NEWSONGS, "NS", "506", "506");


    }
    public static void enableSSLSocket() throws KeyManagementException, NoSuchAlgorithmException {
        HttpsURLConnection.setDefaultHostnameVerifier(new HostnameVerifier() {
            public boolean verify(String hostname, SSLSession session) {
                return true;
            }
        });

        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, new X509TrustManager[]{new X509TrustManager() {
            public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            }

            public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            }

            public X509Certificate[] getAcceptedIssuers() {
                return new X509Certificate[0];
            }
        }}, new SecureRandom());
        HttpsURLConnection.setDefaultSSLSocketFactory(context.getSocketFactory());
    }

    private static void extractNewTunes() throws Exception {
        String englishHymnNo = "300";
        String beFilledNo = "439";
//        HymnsEntity hymn = convertWebPageToHymn(HYMNAL_NET_NEWTUNES, "BF", englishHymnNo, beFilledNo);
        HymnsEntity hymn = convertWebPageToHymn(HYMNAL_NET_URL, "BF", englishHymnNo+"b", beFilledNo);


        hymn.setFirstStanzaLine(hymn.getFirstStanzaLine()+ " (New Tune)");
        if (hymn.getFirstChorusLine()!=null&&!hymn.getFirstChorusLine().isEmpty())
            hymn.setFirstChorusLine(hymn.getFirstChorusLine()+ " (New Tune)");
        hymn.setParentHymn("E"+englishHymnNo);
        saveHymn(hymn);

        // get guitar and piano sheet
        FileUtils.saveUrl(SHEET_PIANO_DIR + "/" + hymn.getId() + ".svg", hymn.getSheetMusicLink().replace("_g", "_p").replace(".svg", ".svg?"));
        FileUtils.saveUrl(SHEET_GUITAR_DIR + "/" + hymn.getId() + ".svg", hymn.getSheetMusicLink().replace("_p", "_g").replace(".svg", ".svg?"));

        // get midi
        FileUtils.saveUrl(MIDI_PIANO_DIR + "/" + hymn.getTune() + ".mid", NEW_TUNES_SHEET_LINK + hymn.getParentHymn() + "/f=mid");


    }


    private static void delete(String hymnId) {
        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            HymnsEntity hymn = em.find(HymnsEntity.class, hymnId);
            em.getTransaction().begin();
            em.remove(hymn);
            em.getTransaction().commit();

            System.out.println("hymn DELETED!");
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
        }

    }

    public static void saveHymn(HymnsEntity hymn) {
        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            em.getTransaction().begin();
            em.persist(hymn);
            HymnsEntity parentHymn;
            if(hymn.getParentHymn()!=null&&!hymn.getParentHymn().isEmpty()) {
                parentHymn = em.find(HymnsEntity.class, hymn.getParentHymn());
                parentHymn.getRelated().add(hymn.getId());
            }

            em.getTransaction().commit();

            System.out.println("hymn saved!");
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
        }

    }

    public static void queryHymn() {
        EntityManager em = null;
        try {
            EntityManagerFactory factory = Persistence.createEntityManagerFactory(HYMNS_UNIT);
            em = factory.createEntityManager();
            Query query = em.createQuery("select h from HymnsEntity h where h.id='E13'");
            HymnsEntity hymns = (HymnsEntity) query.getSingleResult();

            System.out.println(hymns);
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (em != null)
                em.close();
        }
    }

    public static HymnsEntity convertWebPageToHymn(String hymnalAddress, String group, String no, String idNo) throws Exception {
        System.out.println("processing Hymn #" + group + no);
        String url = hymnalAddress + no;
        System.out.println("URL: " + url);
        enableSSLSocket();
        Document doc = Jsoup.connect(url).get();
        Elements details = doc.select(".common-panel");

        HymnsEntity hymn = new HymnsEntity();

        hymn.setId(group+idNo);
        hymn.setHymnGroup(group);
        hymn.setNo(idNo);

        try {
            try {
                hymn.setMainCategory(details.select("label:matches(^Category)").parents().get(0).select("a").text().trim());
            } catch (Exception e) {
                System.out.println("Warning no category");
            }

            try {
                hymn.setSubCategory(details.select("label:matches(^Subcategory)").parents().get(0).select("a").text().trim());
            } catch (Exception e) {
                System.out.println("Warning no subcategory");
            }
            try {
                hymn.setAuthor(details.select("label:matches(^Lyrics)").parents().get(0).select("a").text().trim());
            } catch (IndexOutOfBoundsException e) {
                System.out.println("Warning no author.");
            }
            try {
                hymn.setComposer(details.select("label:matches(^Music)").parents().get(0).select("a").text().trim());
            } catch (IndexOutOfBoundsException e) {
                System.out.println("Warning no composer.");
            }

            // re-read everything from here
            try {
                hymn.setKey(details.select("label:matches(^Key)").parents().get(0).select("a").text().trim());
            } catch (Exception e) {
                System.out.println("Warning no key.");
            }
            try {
                hymn.setTime(details.select("label:matches(^Time)").parents().get(0).select("a").text().trim());
            } catch (Exception e) {
                System.out.println("Warning no time.");
            }
            try {
                hymn.setMeter(details.select("label:matches(^Meter)").parents().get(0).select("a").text().trim());
            } catch (Exception e) {
                System.out.println("Warning no meter.");
            }
            try {
                hymn.setTune(details.select("label:matches(^Hymn Code)").parents().get(0).select("a").text().trim());
            } catch (Exception e) {
                System.out.println("Warning no tune.");
            }

            try{
                StringBuilder verse = new StringBuilder("");
                for(Element s:details.select("label:matches(^Scripture)").parents().get(0).select("a")){
                     verse.append(s.text()+",");

                }
                if(!verse.toString().equals("")) {
                    System.out.println("Adding verses: "+verse.toString());
                    hymn.setVerse(verse.toString());
                }

            }catch (Exception e) {
                System.out.println("warning no verse");
            }



        } catch (Exception e) {
//            System.out.println("Warning! english extraction has skipped. must be a chinese hymn");

            e.printStackTrace();
            throw new RuntimeException();
        }

        try {
            hymn.setTune(details.select("span:matches(^詩碼)").parents().get(0).select("a").text().trim());

        } catch (Exception e) {
//            System.out.println("Warning! chinese exception happened. wasn't able to extract hymn");
        }


        //get related
        Elements relatedsongs = doc.select(".hymn-related-songs");
        Set<String> relatedSet = new HashSet<String>();

        if (relatedsongs.select("a:contains(^English)").size() > 0) {
            String[] href = relatedsongs.select("a:contains(English)").attr("href").split("/");
            relatedSet.add("E" + href[href.length - 1]);
        }
        if (relatedsongs.select("a:contains(Tagalog)").size() > 0) {
            String[] href = relatedsongs.select("a:contains(Tagalog)").attr("href").split("/");
            relatedSet.add("T" + href[href.length - 1]);
        }
        if (relatedsongs.select("a:contains(繁)").size() > 0) {
            String[] href = relatedsongs.select("a:contains(繁)").attr("href").split("/");
            relatedSet.add("C" + href[href.length - 1]);
        }
        if (relatedsongs.select("a:contains(Cebuano)").size() > 0) {
            String[] href = relatedsongs.select("a:contains(Cebuano)").attr("href").split("/");
            relatedSet.add("CB" + href[href.length - 1]);
        }
        hymn.setRelated(relatedSet);

        // ***get stanzas
        Elements stanzas = doc.select(".hymn-content tr");
        ArrayList<StanzaEntity> stanzaEntities = new ArrayList<StanzaEntity>();


        int order = 1;
        boolean firstChorusSet=false;
        if (stanzas.size() > 0) {
            for (Element stanza : stanzas) {
                if (!stanza.text().contains("<")) {

                }
                StanzaEntity stanzaEntity = new StanzaEntity();
                stanzaEntity.setParentHymn(hymn);
                Elements stanzaNum = stanza.select("div.stanza-num");
                if (stanzaNum.size()==1) {
                    stanzaEntity.setNo(stanzaNum.text().trim());
                } else if (stanzaNum.size()==0) {
                    stanzaEntity.setNo("chorus");
                } else {
                    throw new Exception("more than one stanza-num???");
                }
                String text;
                if(stanza.select("td").size()!=2){
                    text=formatBreaks(stanza.select(".note").get(0).text());
                    stanzaEntity.setText(text);
                    stanzaEntity.setNo("end-note");

                } else {
                     text = formatBreaks(stanza.select("td").get(1).html());
                    text = text.replace("&nbsp;","");
                    stanzaEntity.setText(text);
                }



                // get first line and chorus

                if(stanzaEntity.getNo().equals("1")) {
                    hymn.setFirstStanzaLine(text.substring(0,text.indexOf("<")).trim());

                }
                if (stanzaEntity.getNo().equals("chorus")&&!firstChorusSet){
                    try {
                        hymn.setFirstChorusLine(text.substring(0, text.indexOf("<")).trim().toUpperCase());
                        firstChorusSet = true;
                    } catch (StringIndexOutOfBoundsException e) {
                        continue;
                    }
                }

                stanzaEntity.setOrder(order++);
                stanzaEntities.add(stanzaEntity);

            }
        } else {
            System.out.println("WARNING!!!!!!! NO STANZAS!!!!");
        }

        //add line breaks to each stanza
        for(StanzaEntity s:stanzaEntities) {
            s.setText(s.getText()+"<br/>");
        }

        hymn.setStanzas(stanzaEntities);

        // get sheet music link
        Elements sheetMusicElements = doc.select(".leadsheet.piano span");
        try {
            hymn.setSheetMusicLink(sheetMusicElements.get(0).text());
        }catch (Exception e) {
            System.out.println("warning no sheet Music link");
        }



        System.out.println(hymn);


        return hymn;
    }


    public static HymnsEntity convertChineseWebPageToHymn(String hymnalAddress, String group, String no) throws IOException {
        System.out.println("processing Hymn #" + group + no);
        String url = hymnalAddress + no;
        System.out.println("URL: " + url);
        Document doc = Jsoup.connect(url).get();
        Elements details = doc.select("#sidebar #details");

        HymnsEntity hymn = new HymnsEntity();

        hymn.setId(group.toUpperCase() + no);
        hymn.setHymnGroup(group);
        hymn.setNo(no);

        try {
            hymn.setTune(" "+details.select("span:matches(^詩碼)").parents().get(0).select("a").text().trim());

        } catch (Exception e) {
            System.out.println("Warning! 詩碼 not found");
        }

        try {
            hymn.setAuthor(details.select("span:matches(^歌詞)").parents().get(0).select("a").text().trim());

        } catch (Exception e) {
            System.out.println("Warning! 歌詞 not found");
        }

        try {
            hymn.setComposer(details.select("span:matches(^音樂)").parents().get(0).select("a").text().trim());

        } catch (Exception e) {
            System.out.println("Warning! 音樂 not found");
        }

        try {
            hymn.setKey(details.select("span:matches(^調號)").parents().get(0).select("a").text().trim());

        } catch (Exception e) {
            System.out.println("Warning! 調號 not found");
        }
        try {
            hymn.setTime(details.select("span:matches(^節奏)").parents().get(0).select("a").text().trim());

        } catch (Exception e) {
            System.out.println("Warning! 節奏 not found");
        }
        try {
            hymn.setMeter(details.select("span:matches(^韻律)").parents().get(0).select("a").text().trim());

        } catch (Exception e) {
            System.out.println("Warning! 韻律 not found");
        }
        try {
            if(details.select("span:matches(^類別)").size()>0){
                hymn.setMainCategory(details.select("span:matches(^類別)").parents().get(0).select("a").text().trim());
            }

        } catch (Exception e) {
            System.out.println("Warning! 韻律 not found");
        }

//        hymn.setStanzaCount(doc.select("#content .main-content ol li[value]").size());
//        hymn.setChorusCount(doc.select("#content .main-content ol li.chorus").size());
//
//        if (hymn.getStanzaCount() > 0) {
//            hymn.setFirstStanzaLine(formatBreaks(doc.select("#content .main-content ol li[value]").get(0).html()).split("<br/>")[0]);
//        }
//
//        if (hymn.getChorusCount() > 0) {
//            hymn.setFirstChorusLine(formatBreaks(doc.select("#content .main-content ol li.chorus").get(0).html()).split("<br/>")[0]);
//        }
//
//        //get related
//        Elements relatedsongs = doc.select(".relatedsongs");
//        ArrayList<RelatedEntity> relatedEntities = new ArrayList<RelatedEntity>();
//
//
//        if (relatedsongs.select("a:contains(英語)").size() > 0) {
//            String[] href = relatedsongs.select("a:contains(英語)").attr("href").split("/");
//            relatedEntities.add(new RelatedEntity(hymn, "E" + href[href.length - 1]));
//            hymn.setParentHymn("E" + href[href.length - 1]);
//        }
//        if (relatedsongs.select("a:contains(Tagalog)").size() > 0) {
//            String[] href = relatedsongs.select("a:contains(Tagalog)").attr("href").split("/");
//            relatedEntities.add(new RelatedEntity(hymn, "T" + href[href.length - 1]));
//        }
//        if (relatedsongs.select("a:contains(English)").size() > 0) {
//            String[] href = relatedsongs.select("a:contains(English)").attr("href").split("/");
//            String hGroup=null;
//            Integer hNo = null;
//            if(href[href.length-2].equals("lb")) {
//                hGroup="NS";
//                hNo=Integer.valueOf(href[href.length-1])+500;
//            } else {
//                hGroup="NS";
//                hNo=Integer.valueOf(href[href.length-1]);
//            }
//            relatedEntities.add(new RelatedEntity(hymn, hGroup + hNo));
//            hymn.setParentHymn(hGroup+hNo);
//        }
//        if (relatedsongs.select("a:contains(Cebuano)").size() > 0) {
//            String[] href = relatedsongs.select("a:contains(Cebuano)").attr("href").split("/");
//            relatedEntities.add(new RelatedEntity(hymn, "CB" + href[href.length - 1]));
//        }
//        hymn.setRelatedHymns(relatedEntities);

        // ***get stanzas
        // ***get stanzas
        Elements stanzas = doc.select("#content .main-content ol li");
        ArrayList<StanzaEntity> stanzaEntities = new ArrayList<StanzaEntity>();


        int order = 1;
        if (stanzas.size() > 0) {
            for (Element stanza : stanzas) {
                StanzaEntity stanzaEntity = new StanzaEntity();
                stanzaEntity.setParentHymn(hymn);
                if (stanza.hasAttr("value")) {
                    stanzaEntity.setNo(stanza.attr("value"));
                } else if (stanza.hasClass("chorus")) {
                    stanzaEntity.setNo("chorus");
                } else {
                    stanzaEntity.setNo("-");
                }
                stanzaEntity.setText(formatBreaks(stanza.html()));
                stanzaEntity.setOrder(order++);
                stanzaEntities.add(stanzaEntity);


            }
            // this means song has only one stanza and a chorus
        } else if (doc.select("#content .main-content ul li[value]").size() == 1) {
            stanzas = doc.select("#content .main-content ul li[value]");
            StanzaEntity stanzaEntity = new StanzaEntity();
            stanzaEntity.setText(formatBreaks(stanzas.html()));
            stanzaEntity.setOrder(1);
            stanzaEntity.setNo("1");
            stanzaEntity.setParentHymn(hymn);
            stanzaEntities.add(stanzaEntity);
            hymn.setFirstStanzaLine(formatBreaks(doc.select("#content .main-content ul li[value]").get(0).html()).split("<br/>")[0]);

            stanzas = doc.select("#content .main-content ul li.chorus");
            if (stanzas.size() != 0) {
                stanzaEntity = new StanzaEntity();
                stanzaEntity.setText(formatBreaks(stanzas.html()));
                stanzaEntity.setOrder(2);
                stanzaEntity.setNo("chorus");
                stanzaEntity.setParentHymn(hymn);
                stanzaEntities.add(stanzaEntity);
                String firstChorusLine = formatBreaks(stanzas.get(0).html()).split("<br/>")[0].toUpperCase();
                hymn.setFirstChorusLine(firstChorusLine);
            }


        } else if (doc.select("#content .main-content li.nonum").size() > 0) {
            int stanzaOrder = 0;
            for (Element stanza : doc.select("#content .main-content li.nonum")) {
                StanzaEntity stanzaEntity = new StanzaEntity();
                stanzaEntity.setText(formatBreaks(stanza.html()));
                stanzaEntity.setOrder(++stanzaOrder);
                stanzaEntity.setNo(""+stanzaOrder);
                stanzaEntity.setParentHymn(hymn);
                stanzaEntities.add(stanzaEntity);
                hymn.setFirstStanzaLine(formatBreaks(doc.select("#content .main-content li.nonum").get(0).html()).split("<br/>")[0]);
            }

        } else if (doc.select("#content .main-content ul li.chorus").size() > 0) {


            stanzas = doc.select("#content .main-content ul li.chorus");
            int stanzaOrder = 0;
            for (Element stanza : stanzas) {
                StanzaEntity stanzaEntity = new StanzaEntity();
                stanzaEntity.setText(formatBreaks(stanza.html()));
                stanzaEntity.setOrder(++stanzaOrder);
                stanzaEntity.setNo("" + stanzaOrder);
                stanzaEntity.setParentHymn(hymn);
                stanzaEntities.add(stanzaEntity);
                String firstLine = formatBreaks(stanzas.get(0).html()).split("<br/>")[0].toUpperCase();
                hymn.setFirstStanzaLine(firstLine);
            }


        } else {
//            throw new RuntimeException("Cant find stanzas!");
            System.out.println("WARNING!!!!!!! NO STANZAS!!!!");
        }
        hymn.setStanzas(stanzaEntities);




        System.out.println(hymn);


        return hymn;
    }

    public static String formatBreaks(String htmlString) {
        final String br = "<br/>";
        return htmlString.replace("<br />", br).replace("<BR />", br).replace("<BR/>", br)
                .replace("<br>", br).replace("<BR>", br);
    }


}
