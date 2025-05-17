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

//        if(Constants.PROXY_PORT!=null) {
//            System.setProperty("http.proxyHost", Constants.PROXY_URL);
//            System.setProperty("http.proxyPort", Constants.PROXY_PORT);
//            System.setProperty("https.proxyHost", Constants.PROXY_URL);
//            System.setProperty("https.proxyPort", Constants.PROXY_PORT);
//        }
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
        System.setProperty("file.encoding", "UTF-8");
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
        Elements verseElements = doc.select("div.verse");
        ArrayList<StanzaEntity> stanzaEntities = new ArrayList<>();
        int order = 1;
        boolean firstChorusSet = false;
        boolean autoNumberVerses = false;
        int autoVerseNo = 1;
        String lastChorusText = null;

        if (verseElements.size() > 0) {
            for (Element verse : verseElements) {
                StanzaEntity stanzaEntity = new StanzaEntity();
                stanzaEntity.setParentHymn(hymn);

                // Determine stanza number/type
                String stanzaNo = "unknown";
                if (verse.hasAttr("data-type")) {
                    String type = verse.attr("data-type");
                    if ("verse".equals(type)) {
                        // Try to get the verse number
                        Element verseNum = verse.selectFirst("div.verse-num > span");
                        if (verseNum != null) {
                            stanzaNo = verseNum.text().trim();
                        } else {
                            // If this is the first stanza and has no number, start auto-numbering
                            if (stanzaEntities.isEmpty()) {
                                autoNumberVerses = true;
                                stanzaNo = String.valueOf(autoVerseNo++);
                            } else if (autoNumberVerses) {
                                stanzaNo = String.valueOf(autoVerseNo++);
                            } else {
                                stanzaNo = "verse";
                            }
                        }
                    } else if ("chorus".equals(type)) {
                        stanzaNo = "chorus";
                    } else {
                        stanzaNo = type; // e.g., "bridge"
                    }
                }
                stanzaEntity.setNo(stanzaNo);

                // Get the text from text-container
                Element textContainer = verse.selectFirst("div.text-container");
                String text = "";
                if (textContainer != null) {
                    text = formatBreaks(textContainer.html())
                            .replace("&nbsp;", "")
                            .replace("\n","");
                    stanzaEntity.setText(text);

                    // Set first lines for hymn
                    int brIndex = text.indexOf("<");
                    String firstLine = (brIndex >= 0) ? text.substring(0, brIndex).trim() : text.trim();
                    if ("1".equals(stanzaNo)) {
                        hymn.setFirstStanzaLine(firstLine);
                    }
                    if ("chorus".equals(stanzaNo) && !firstChorusSet) {
                        hymn.setFirstChorusLine(firstLine.toUpperCase());
                        firstChorusSet = true;
                    }
                } else {
                    stanzaEntity.setText("");
                }

                // Skip duplicate consecutive choruses
                if ("chorus".equals(stanzaNo)) {
                    if (lastChorusText != null && lastChorusText.equals(text)) {
                        continue; // skip this duplicate chorus
                    }
                    lastChorusText = text;
                }

                stanzaEntity.setOrder(order++);
                stanzaEntities.add(stanzaEntity);
            }
        } else {
            System.out.println("WARNING!!!!!!! NO STANZAS!!!!");
        }

        // Add line breaks to each stanza
        for (StanzaEntity s : stanzaEntities) {
            s.setText(s.getText() + "<br/>");
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
        try {
            FileUtils.saveUrl(Constants.MIDI_PIANO_DIR + "/m" + hymn.getTune().trim() + ".mid", hymn.getSheetMusicLink().replace("/svg/", "/midi/")
                    .replace("_p.svg", ".mid")
                    .replace("_g.svg", ".mid"));
        } catch (Exception e) {
            // try downloading tune midi instead
            FileUtils.saveUrl(Constants.MIDI_PIANO_DIR + "/m" + hymn.getTune().trim() + ".mid", hymn.getSheetMusicLink().replace("/svg/", "/midi/tunes/")
                    .replace("_p.svg", "_tune.midi")
                    .replace("_g.svg", "_tune.midi"));
        }

        System.out.println("Hymn resuources downloaded successfully...");
    }

    public static void downloadMidi(String hymnalAddress, HymnsEntity hymn, String hymnIdInUrl) throws IOException {
        try {
            // get midi
            FileUtils.saveUrl(Constants.MIDI_PIANO_DIR + "/m" + hymn.getTune().trim() + ".mid", hymn.getSheetMusicLink().replace("/svg/","/midi/")
                    .replace("_p.svg",".mid")
                    .replace("_g.svg",".mid"));
            System.out.println("Hymn resuources downloaded successfully...");
        } catch (Exception e) {

        }
    }

    public static void downloadTune(String hymnalAddress, HymnsEntity hymn, String hymnIdInUrl) throws IOException {
        try {
            // get midi
            FileUtils.saveUrl(Constants.MIDI_PIANO_DIR + "/m" + hymn.getTune().trim() + ".mid", hymnalAddress + hymnIdInUrl + "/f=tune");
            System.out.println("Hymn resuources downloaded successfully...");
        } catch (Exception e) {

        }
    }


    public static String formatBreaks(String htmlString) {
        final String br = "<br/>";
        return htmlString.replace("<br />", br).replace("<BR />", br).replace("<BR/>", br)
                .replace("<br>", br).replace("<BR>", br);
    }


}
