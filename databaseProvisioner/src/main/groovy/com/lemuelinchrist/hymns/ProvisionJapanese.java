package com.lemuelinchrist.hymns;

import com.lemuelinchrist.hymns.lib.Dao;
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity;
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity;
import groovy.util.logging.Slf4j;

import java.io.File;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * @author Lemuel Cantos
 * @since 15/6/2019
 */
@Slf4j
public class ProvisionJapanese {
    File japaneseFile;
    File japaneseSupplementFile;
    private int x = 0;
    private String line;
    private List<String> lines;

    public static void main(String[] args) throws Exception {
        ProvisionJapanese japanese = new ProvisionJapanese();
        japanese.provision();
    }

    public void provision() throws Exception {
        Dao dao = new Dao();
        japaneseFile = new File(this.getClass().getResource("/japanese.txt").getPath());
        StringBuilder logString = new StringBuilder();
        japaneseSupplementFile = new File(this.getClass().getResource("/japaneseSupplement.txt").getPath());

        lines = Files.lines(japaneseFile.toPath()).collect(Collectors.toList());
        Integer hymnNumber = 0;
        Integer stanzaCounter = 0;
        Integer stanzaOrderCounter = 0;
        HymnsEntity hymn = null;
        StanzaEntity stanza = null;
        StringBuilder stanzaBuilder = null;


        for(x=0; hymnNumber!=780; x++) {
            line = lines.get(x).trim();

            if (isStartOfHymn()) {
                while((x +1)!= lines.size() &&
                        lines.get(++x).trim().isEmpty());


                String relatedLine = lines.get(x + 1).trim();
                logString.append(++hymnNumber + " ");
                System.out.println("processing #"+hymnNumber);
                logString.append(relatedLine);
                logString.append("\n");

                Integer englishRelated=null;
                if(relatedLine.contains("英")) {
                    englishRelated = Integer.parseInt(relatedLine
                            .substring(relatedLine.indexOf("英")+1).replaceAll("[^\\d]","" ));
                }


                String categoryLine = lines.get(x).trim();
                assert categoryLine.contains("―");


                hymn = new HymnsEntity();
                hymn.setId("J"+hymnNumber);
                hymn.setHymnGroup("J");
                hymn.setNo(hymnNumber.toString());
                hymn.setMainCategory(categoryLine.split("―")[0].trim());
                hymn.setSubCategory(categoryLine.split("―")[1].trim());
                if(englishRelated!=null) hymn.setParentHymn("E"+englishRelated);


                logString.append(hymn.toString()+"\n");

                x++;
                x++;
                line = lines.get(x).replace("　","").trim();
                if(!line.equals("１") && !line.equals("1") && !line.equals("note")) throw new RuntimeException("line "
                        + "after hymn "
                        + "number "
                        + "should "
                        + "be first "
                        + "stanza but "
                        + "is: "+line);

//                while(!isStartOfHymn()) {
//                    x++;
//
//                }

                continue;
            }
        }

//        stream.forEach(a -> {
//            System.out.println(a);
//            logString.append(a);
//        });


//        while (iterator.hasNext()) {
//
//            String line = iterator.next().trim();
//            out.println line
//        }
        log(logString.toString());
    }

    public boolean isStartOfHymn() {
        return line.isEmpty() &&
                (x +1)!=lines.size() &&
                lines.get(x +1).trim().isEmpty();
    }

    public void log(String text) {
        try {
            Files.write(Paths.get("TEST.txt"), text.getBytes());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
