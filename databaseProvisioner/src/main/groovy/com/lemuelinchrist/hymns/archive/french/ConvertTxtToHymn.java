package com.lemuelinchrist.hymns.archive.french;

import com.lemuelinchrist.hymns.lib.Dao;
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity;
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity;

import java.io.BufferedReader;
import java.io.FileReader;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Created by lemuelcantos on 31/10/15.
 */
public class ConvertTxtToHymn {
    public static void main(String args[]) throws Exception {
        Dao dao = new Dao();
        HymnsEntity hymn;
        BufferedReader br = new BufferedReader(new FileReader("/Users/lemuelcantos/Google Drive/hymnDev/HymnsForAndroidProject/HymnsJpa/data/french.txt"));
        try {
            String line = br.readLine();
            Integer hymnNo =1;

            //finding the first hymn
            while(!line.matches("^" + hymnNo.toString() +"$")){
                line=br.readLine().trim();
            }


            while (line != null) {


                if (line.matches("^" + hymnNo.toString() +"$") ) {
                    System.out.println("\nhymn "+line + " found");
                    hymn=new HymnsEntity();
                    hymn.setId("FR"+hymnNo);
                    hymn.setHymnGroup("FR");
                    hymn.setNo(hymnNo.toString());

                    // get subjects
                    line = br.readLine().trim();
                    if (! line.contains("-")) throw new Exception("error! no minor subject");
                    String[] subjects = line.split("-");
                    System.out.println("major: " + subjects[0].trim());
                    hymn.setMainCategory(subjects[0].trim());
                    if (subjects.length<2){
                        System.out.println("No minor subject!!");
                        hymn.setSubCategory("");
                    } else {
                        System.out.println("minor: " + subjects[1].trim());
                        hymn.setSubCategory(subjects[1].trim());
                    }

                    // get related
                    line = br.readLine().trim();
                    if (! (line.contains("(") && line.contains(")") ) ) throw new Exception(" error! no related hymns");
                    line = line.substring(1,line.length()-1);
                    System.out.println("related hymns: " + line);
                    String[] rel = line.split(",");
                    boolean isParentFound=false;
                    String spanish = null;
                    String chinese = null;
                    for(String r:rel) {
                        r=r.trim();
                        if (r.contains("-")) continue;
                        if (r.contains("A")) {
                            System.out.println("English: " + "E"+r.substring(1));
                            hymn.setParentHymn("E"+r.substring(1));
                            isParentFound=true;
                        }
                        if (r.contains("E")) {
                            System.out.println("Spanish: " + "ES"+r.substring(1));
                            spanish="ES"+r.substring(1);


                        }
                        if (r.contains("Ch")) {
                            chinese="C"+r.substring(2);
                            System.out.println("Chinese: " + chinese);
                        }



                    }
                    if (!isParentFound) {
                        System.out.println("*************************************************************Parent not found!!");
                        if(chinese!=null) {
                            hymn.setParentHymn(chinese);

                            //hymn #214 outlier
                            if(hymnNo==214) {
                                hymn.setParentHymn("NS151");
                            }
                            dao.addRelatedHymn(hymn.getParentHymn(),hymn.getId());
                        }
                        if(spanish!=null) {
                            Set set = new HashSet();
                            set.add(spanish);
                            hymn.setRelated(set);

                        }
                    } else {
                        System.out.println("parent hymn found. updating parent related hymn now...");
                        dao.addRelatedHymn(hymn.getParentHymn(),hymn.getId());
                    }

                    List<StanzaEntity> stanzas = new ArrayList<StanzaEntity>();
                    hymn.setStanzas(stanzas);
                    StanzaEntity stanza=null;
                    int order=1;
                    // get empty line after related
                    line = br.readLine().trim();
                    if (!line.isEmpty() ) {
                        if (line.contains("Répétez") || line.contains("Répontez")) {
                            System.out.println("beginning note: " + line);
                            stanza=new StanzaEntity();
                            stanza.setParentHymn(hymn);
                            stanza.setNo("beginning-note");
                            stanza.setOrder(order++);
                            stanza.setText(line+"<br/>");


                            line = br.readLine().trim();
                            if(!line.isEmpty()) {
                                throw new Exception("line after beginning note is supposed to be empty ");
                            }
                        } else
                            throw new Exception("line after related is supposed to be empty ");
                    }

                    //keep reading until we hit the next hymn nymber
                    Integer nextHymnNo=hymnNo+1;

                    while(!line.matches("^" + nextHymnNo.toString() +"$")) {

                        if(line.isEmpty()) {
                            while(line.isEmpty()) {
                                line = br.readLine();
                                if (line == null) break;
                                line = line.trim();
                            }

                            if (line.matches("^[0-9]+\\..*")) {
                                String stanzaNoText = line.substring(0, line.indexOf("."));
                                System.out.println("Currently on Stanza " + stanzaNoText);
                                if (stanza!=null) stanzas.add(stanza);
                                stanza=new StanzaEntity();
                                stanza.setParentHymn(hymn);
                                stanza.setNo(stanzaNoText);
                                stanza.setOrder(order++);
                                stanza.setText(line.substring(line.indexOf(".")+2)+"<br/>");
                                if(stanzaNoText.equals("1")) hymn.setFirstStanzaLine(line.substring(line.indexOf(".")+2));

                            } else if (line.contains("Refrain")) {
                                System.out.println("Currently on Refrain");
                                if (stanza!=null) stanzas.add(stanza);
                                stanza=new StanzaEntity();
                                stanza.setParentHymn(hymn);
                                stanza.setNo("chorus");
                                stanza.setOrder(order++);
                                stanza.setText("");
                                if(hymn.getFirstChorusLine()==null) {
                                    String text=br.readLine().trim();
                                    hymn.setFirstChorusLine(text);
                                    stanza.setText(text);
                                }
                            } else if(line.matches("^" + nextHymnNo.toString() +"$")) {

                                System.out.println("end of hymn "+hymnNo++);
                                if (stanza!=null) stanzas.add(stanza);
                                System.out.println("HymnEntity looks like this: \n"+hymn.toString());
                                dao.save(hymn);

                                break;
                            } else throw new Exception("not stanza, not refrain, then what is it??\n" + line);
                        }


                        line=br.readLine();
                        if (line==null) break;
                        line=line.trim();
                        if(!line.isEmpty()) {
                            stanza.setText(stanza.getText()+line+"<br/>");
                        }
                    }


                }

            }

        } finally {
            br.close();
        }

    }


}
