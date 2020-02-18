package com.lemuelinchrist.hymns.lib;

import com.lemuelinchrist.hymns.lib.beans.HymnsEntity;
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import javax.net.ssl.*;
import java.io.IOException;
import java.security.KeyManagementException;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

/**
 * Created by lemuelcantos on 6/8/13.
 */
public class HymnalNetExtractor {


    public static void main(String args[]) throws Exception {
//        for(int x=1403; x<=1404; x++){
//            HymnsEntity hymn = convertWebPageToHymn(HYMNAL_NET_URL, "E", ""+x, ""+x);
//            saveHymn(hymn);
//
//        }
//        HymnsEntity hymn = convertWebPageToHymn(HYMNAL_NET_NEWTUNES, "BF", "1040", "434");
        Dao dao = new Dao();


        convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, "NS", "506", "506");


    }


    public static void enableSSLSocket() throws KeyManagementException, NoSuchAlgorithmException {

        if(Constants.PROXY_PORT!=null) {
            System.setProperty("http.proxyHost", Constants.PROXY_URL);
            System.setProperty("http.proxyPort", Constants.PROXY_PORT);
            System.setProperty("https.proxyHost", Constants.PROXY_URL);
            System.setProperty("https.proxyPort", Constants.PROXY_PORT);
        }
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


    public static String getTune(String hymnalNetUrl) throws Exception {
        enableSSLSocket();
        Document doc = Jsoup.connect(hymnalNetUrl).get();
        Elements details = doc.select(".common-panel");
        System.out.println("Getting tune from: " + hymnalNetUrl);

        String tune = details.select("label:matches(^Hymn Code)").parents().get(0).select("a").text().trim();
        if (tune.isEmpty()) {
            throw new RuntimeException("Tune is blank!!");
        }
        System.out.println("Tune retrieved successfully: " + tune);
        return tune;

    }

    public static String getSheetMusicLink(String hymnalNetUrl) throws Exception {
        enableSSLSocket();
        Document doc = Jsoup.connect(hymnalNetUrl).get();
        // get sheet music link
        Elements sheetMusicElements = doc.select(".leadsheet.piano span");
        try {
            String sheetMusicLink = sheetMusicElements.get(0).text();
            System.out.println("SheetMusicLink retrieved successfully: " + sheetMusicLink);
            return sheetMusicLink;
        }catch (Exception e) {
            System.out.println("warning no sheet Music link");
        }
        return null;

    }

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
                    try {
                        text = formatBreaks(stanza.select(".note").get(0).text());
                        stanzaEntity.setText(text);
                        stanzaEntity.setNo("end-note");
                    } catch (Exception e) {
                        System.out.println("there was supposed to be an end-note but it's not there?");
                        continue;
                    }

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

        // **** Important! hymn will not work if first_stanza_line is null
        if(hymn.getFirstStanzaLine()==null) {
            hymn.setFirstStanzaLine(hymn.getFirstChorusLine());
            hymn.setFirstChorusLine(null);
        }

        // ***********************************************
        // DOWNLOADING RESOURCES
        // ***********************************************
        downloadSheetMusicAndMidi(hymnalAddress, hymn);


        System.out.println("Hymn info and resources extracted successfully...");
        System.out.println(hymn);


        return hymn;
    }

    public static void downloadSheetMusicAndMidi(String hymnalAddress, HymnsEntity hymn) throws IOException {
        if (hymn.getSheetMusicLink()==null || hymn.getSheetMusicLink().isEmpty()) {
            System.out.println("skipping saving of sheets. link is empty...");
            return;
        }
        // get guitar and piano sheet
        FileUtils.saveUrl(Constants.SHEET_PIANO_DIR + "/" + hymn.getId() + ".svg", hymn.getSheetMusicLink().replace("_g", "_p").replace(".svg", ".svg?"));
        FileUtils.saveUrl(Constants.SHEET_GUITAR_DIR + "/" + hymn.getId() + ".svg", hymn.getSheetMusicLink().replace("_p", "_g").replace(".svg", ".svg?"));

        // get midi
        FileUtils.saveUrl(Constants.MIDI_PIANO_DIR + "/m" + hymn.getTune().trim() + ".mid", hymnalAddress + hymn.getNo() + "/f=mid");

        System.out.println("Hymn resuources downloaded successfully...");
    }


    public static String formatBreaks(String htmlString) {
        final String br = "<br/>";
        return htmlString.replace("<br />", br).replace("<BR />", br).replace("<BR/>", br)
                .replace("<br>", br).replace("<BR>", br);
    }


}
