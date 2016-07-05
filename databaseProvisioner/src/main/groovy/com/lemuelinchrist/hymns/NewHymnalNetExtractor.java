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
public class NewHymnalNetExtractor {
    public static final String HYMNS_UNIT = "hymnsUnit";

    public static final String HYMNAL_NET_CHINESE_SUPPLEMENT = "http://www.hymnal.net/zh_TW/hymn.php/ts/";

    public static String HYMNAL_NET_URL = "http://www.hymnal.net/en/hymn.php/h/";
    public static String HYMNAL_NET_CEBUANO = "http://www.hymnal.net/en/hymn.php/cb/";
    public static String HYMNAL_NET_CHINESE = "https://www.hymnal.net/en/hymn/ch/";
    public static String HYMNAL_NET_SELECTED_CHINESE = "http://www.hymnal.net/en/hymn/ts/";
    public static String HYMNAL_NET_LONGBEACH = "http://www.hymnal.net/en/hymn.php/lb/";
    public static String HYMNAL_NET_NEWSONGS = "http://www.hymnal.net/en/hymn.php/ns/";
    public static String HYMNAL_NET_TAGALOG  = "https://www.hymnal.net/en/hymn/ht/";

    public static final String DATA_DIR = "/Users/lemuelcantos/Google Drive/hymnDev/HymnsForAndroidProject/HymnsJpa/data";
    public static final String MIDI_PIANO_DIR = DATA_DIR + "/midiTemp";
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
        Dao dao = new Dao();


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

//    private static void extractNewTunes() throws Exception {
//        String englishHymnNo = "300";
//        String beFilledNo = "439";
//        HymnsEntity hymn = convertWebPageToHymn(HYMNAL_NET_NEWTUNES, "BF", englishHymnNo, beFilledNo);
//
//
//        hymn.setFirstStanzaLine(hymn.getFirstStanzaLine()+ " (New Tune)");
//        if (hymn.getFirstChorusLine()!=null&&!hymn.getFirstChorusLine().isEmpty())
//            hymn.setFirstChorusLine(hymn.getFirstChorusLine()+ " (New Tune)");
//        hymn.setParentHymn("E"+englishHymnNo);
//        saveHymn(hymn);
//
//        // get guitar and piano sheet
//        FileUtils.saveUrl(SHEET_PIANO_DIR + "/" + hymn.getId() + ".svg", hymn.getSheetMusicLink().replace("_g", "_p").replace(".svg", ".svg?"));
//        FileUtils.saveUrl(SHEET_GUITAR_DIR + "/" + hymn.getId() + ".svg", hymn.getSheetMusicLink().replace("_p", "_g").replace(".svg", ".svg?"));
//
//        // get midi
//        FileUtils.saveUrl(MIDI_PIANO_DIR + "/" + hymn.getTune() + ".mid", NEW_TUNES_SHEET_LINK + hymn.getParentHymn() + "/f=mid");
//
//
//    }


    public static HymnsEntity convertWebPageToHymn(String hymnalAddress, String urlNo, String group, String idNo) throws Exception {
        System.out.println("processing Hymn #" + group + urlNo);
        String url = hymnalAddress + urlNo;
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

        // get guitar and piano sheet
        FileUtils.saveUrl(SHEET_PIANO_DIR + "/" + hymn.getId() + ".svg", hymn.getSheetMusicLink().replace("_g", "_p").replace(".svg", ".svg?"));
        FileUtils.saveUrl(SHEET_GUITAR_DIR + "/" + hymn.getId() + ".svg", hymn.getSheetMusicLink().replace("_p", "_g").replace(".svg", ".svg?"));

        // get midi
        FileUtils.saveUrl(MIDI_PIANO_DIR + "/m" + hymn.getTune() + ".mid", hymnalAddress + hymn.getNo() + "/f=mid");



        System.out.println(hymn);


        return hymn;
    }


    public static String formatBreaks(String htmlString) {
        final String br = "<br/>";
        return htmlString.replace("<br />", br).replace("<BR />", br).replace("<BR/>", br)
                .replace("<br>", br).replace("<BR>", br);
    }


}
