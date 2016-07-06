package com.lemuelinchrist.hymns.archive.korean;

import com.lemuelinchrist.hymns.lib.Dao;
import com.lemuelinchrist.hymns.lib.FileUtils;
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity;
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

public class KoreanHymns {

    private static StringBuilder stanzaLyric = null;
    private static int stanzaOrder;
    private static StanzaEntity stanza;
    private static HymnsEntity hymn;
    private static Set<HymnsEntity> hymnsWithoutStanzas = new HashSet<HymnsEntity>();
    private static Dao dao = new Dao();


    public static void main(String[] args) throws Exception {
        File folder = new File(FileUtils.DATA_DIR+"/koreanTxt");
        File[] listOfFiles = folder.listFiles();

        for (File textFile: listOfFiles) {
            hymn = new HymnsEntity();
            stanzaOrder = 0;
            log("******************** Getting new hymn file!");
            BufferedReader br = new BufferedReader(new FileReader(textFile));
            String hymnNoAccordingToFile= textFile.getName().split("\\.")[0];
            String hymnNo = getHymnNo(br, hymnNoAccordingToFile);
            log("Hymn No is: " + hymnNo);
            hymn.setId("K" + hymnNo);
            hymn.setHymnGroup("K");
            hymn.setNo(hymnNo);
            String subject = getString(br);
            if (subject.isEmpty() ) {
                throw new Exception("error trying to capture subject! captured text was empty " );
            }
            log(subject);
            hymn.setMainCategory(subject);

            String rawRelated = getString(br);
            if (rawRelated.isEmpty() || !rawRelated.contains("(")) {
                throw new Exception("error trying to capture related. captured text was: " + rawRelated );
            }
            log(rawRelated);

            String[] splitRelated = rawRelated.split(",");
            boolean isParentFound=false;
            String english = null;
            String chinese = null;
            String chineseSupplement;

            hymn.setParentHymn(null);
            for(String r:splitRelated) {
                r=r.trim();
                if (r.contains("E") && r.matches(".*\\d+.*")) {
                    english =r.replaceAll("\\(","").replaceAll("\\)","");
                    log("English: " + english + " hymn: " + hymnNo);
                    hymn.setParentHymn(english);

                    // we only care about the parent hymn because it already has related hymns
                    break;

                }
                else if (r.contains("CS")) {

                    chineseSupplement=r.replaceAll("\\)","");
                    log("Chinese Supplement: " + chineseSupplement);
                    if(hymn.getParentHymn()==null) {
                        hymn.setParentHymn(chineseSupplement);
                    }


                }
                else if (r.contains("C") && r.matches(".*\\d+.*")){
                    chinese=r.replaceAll("\\(","").replaceAll("\\)","");
                    log("chinese: " + chinese + " hymn: " + hymnNo);
                    if(hymn.getParentHymn()==null) {
                        hymn.setParentHymn(chinese);
                    }
                }

            }

            // get next line after related. line should be empty
            String blank = getString(br);
            if(!blank.isEmpty()) {
                throw new Exception("error! next line after related is supposed to be empty. Hymn: "+hymnNo);
            }

            //start getting lyrics
            String line=getString(br);
            stanza = null;
            hymn.setStanzas(new ArrayList<StanzaEntity>());
            stanzaLyric=null;
            while(line!=null) { //loop until the very end of the file
                if (line.isEmpty()) {
                    line=getString(br);
                    continue;
                }
                String stanzaNo=null;
                if (line.matches("^[0-9]+-.*")) {
                    String stanzaNoText = line.substring(0, line.indexOf("-"));
                    String stanzaTextAfterNumber = line.substring(line.indexOf(" ")+1);
                    endCurrentStanzaAndStartNewOne(stanzaNoText);
                    log("Currently on Stanza " + stanza.getNo());
                    if(stanzaNoText.equals("1")&& hymn.getFirstStanzaLine()==null) {
                        hymn.setFirstStanzaLine(stanzaTextAfterNumber);
                    }
                    stanzaLyric.append(stanzaTextAfterNumber+"<br/>");

                }else if(line.contains("(후렴)")) {
                    log("Currently on Chorus ");
                    endCurrentStanzaAndStartNewOne("chorus");
                    line=getString(br);
                    if(hymn.getFirstChorusLine()==null) {
                        hymn.setFirstChorusLine(line);
                    }
                    stanzaLyric.append(line+"<br/>");

                }
                line=getString(br);
                if(line!=null && !line.isEmpty()) {
                    if (stanzaLyric==null) {
                        log("warning! no stanza number! creating one...");
                        endCurrentStanzaAndStartNewOne("1");
                        hymnsWithoutStanzas.add(hymn);

                    }

                    stanzaLyric.append(line + "<br/>");

                }

            }
            // hymn parsing is done. save the final object
            endCurrentStanzaAndStartNewOne("nothing");
            log(hymn.toString());
            dao.save(hymn);
            dao.addRelatedHymn(hymn.getParentHymn(),hymn.getId());
        }

//        log("hymns without stanzas: ");
//        log("******************************************************************");
//        log("******************************************************************");
//        for(HymnsEntity h:hymnsWithoutStanzas) {
//            log(h.toString());
//        }

    }

    private static void endCurrentStanzaAndStartNewOne(String stanzaNoText) {
        if (stanza!=null) {
            stanza.setText(stanzaLyric.toString());
            hymn.getStanzas().add(stanza);
        }
        stanza=new StanzaEntity();
        stanza.setParentHymn(hymn);
        stanza.setNo(stanzaNoText);
        stanza.setOrder(++stanzaOrder);
        stanzaLyric=new StringBuilder();


    }

    private static void log(String x) {
        System.out.println(x);
    }

    private static String getHymnNo(BufferedReader br, String hymnNoAccordingToFile) throws Exception {
        String line;
        while (true) {
            line = getString(br);
//                System.out.println(line);
            if (line == null) break;
            if (line.isEmpty()) continue;
            //check if hymn no is the same number as the one in the filename
            if (!line.substring(1).equals(hymnNoAccordingToFile)) {
                try {
                    throw new Exception("error!  hymn no and filename do not coincide!! \n" +
                            "file is: " + hymnNoAccordingToFile + "\n" +
                            "hymn no is: " + line);
                }catch (Exception e) {
                    e.printStackTrace();
                    break;
                }
            }else break;

        }
        return line.substring(1);
    }

    private static String getString(BufferedReader br) throws IOException {
        String s = br.readLine();
        if (s==null) return null;
        return s.trim();

//        byte[] bytes = s.getBytes("UTF-8");
//    return new String(bytes, "UTF-8");
    }

}