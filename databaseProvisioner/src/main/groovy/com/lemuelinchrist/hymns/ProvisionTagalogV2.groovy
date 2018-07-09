package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element

/**
 * @author Lemuel Cantos
 * @since 1/7/2018
 */
class ProvisionTagalogV2 {
    static Dao dao = new Dao()
    static String[] notInDB= []
    static void main(String[] args) {


        def unnumberedHyms=[]
        for(int x=1; x<1399; x++) {
            try {
                println "finding hymn: " + x
                def element = new HymnElement(x)
                saveHymn element.getHymnsEntity()

                if (element.getLyrics().trim()[0]!="1") unnumberedHyms+=x
            } catch (HymnNotFoundException e) {
                println "not found: " + x
            }
        }

        def secondLyricsCount=[]
        for(int x=1; x<999; x++) {
            try {
                println "finding selected hymn: " + x
                def element = new HymnElement(x, "s")
                saveHymn element.getHymnsEntity()

                if (element.getSecondSetOfLyrics()!=null) secondLyricsCount+=x
            } catch (HymnNotFoundException e) {
                println "not found: s" + x
            }
        }

        println "second lyrics count: " + secondLyricsCount
        println "unnumbered hymns: " + unnumberedHyms
        println "not in db: " + notInDB
    }

    static void saveHymn(HymnsEntity newHymn) {
        println newHymn
        println "saving hymn..."
        HymnsEntity dbHymn = dao.find(newHymn.getId())
        if(dbHymn==null) {
            notInDB+=newHymn.getId()
            dao.save(newHymn)
        } else {

        }




    }

}

class HymnElement {
    public static String ROOT_PATH="tagalogV2/";

    Document doc
    int hymnNo
    String htmlId;
    Element baseElement
    String lyrics
    String type
    int no
    boolean isSingleStanza=false

    public HymnElement(int no, String prefix="") throws HymnNotFoundException {
        this.no = no;
        this.type=prefix.isEmpty()?"t":prefix
        this.doc=getDocumentFromHymn(no,prefix)
        htmlId="#" + type + String.format("%03d", no)
        baseElement=doc.select(htmlId)[0]
        if(baseElement==null) {
            throw new HymnNotFoundException()
        }


    }

    public String getCategories() {
        baseElement.html().split("<br>")[0]
    }

    public String getLyrics() {
        getNextSiblingWithClass(baseElement.parent(),"hymnbody").select(".hymnbody p")[0].html()
    }
     public String getSecondSetOfLyrics() {
         try {
             def sibling = getNextSiblingWithClass(baseElement.parent(), "hymnbody")
             getNextSiblingWithClass(sibling, "hymnbody")
                     .select(".hymnbody p")[0].html()
         } catch (Exception e) {
             return null;
         }

     }

    public HymnsEntity getHymnsEntity() {
        HymnsEntity hymn = new HymnsEntity()
        hymn.setHymnGroup("T")
        def adjustedNumber

        if(type.equals("t")) {
            hymn.setParentHymn("E"+no)
            adjustedNumber=no
        } else {
            adjustedNumber=no+10000
            hymn.setNo()
        }
        hymn.setId("T"+adjustedNumber)
        hymn.setNo(Integer.toString(adjustedNumber))

        def splitCategories = getCategories().split("—")
        hymn.setMainCategory(splitCategories[0].trim())
        if(splitCategories.size()>1) {
            hymn.setSubCategory(splitCategories[1].trim())
        } else {
            println "no subCategory: " +splitCategories[0]
        }

        // *********** Create Stanzas
        hymn.setStanzas(new ArrayList<StanzaEntity>())
        def order=1
        String[] lyrics = getLyrics().split("<br>")
        StanzaEntity stanzaEntity
        for(int i=0; i<lyrics.size(); i++) {
            String line = lyrics[i].trim()
            if (line.isEmpty() || i==0) {
                if(i!=0) {
                    while(line.isEmpty()) {
                        i++
                        line = lyrics[i].trim()
                    }
                }
                stanzaEntity = new StanzaEntity()
                stanzaEntity.parentHymn=hymn
                hymn.getStanzas().add stanzaEntity
                if(!line[0].isNumber()) {
                    if(i==0) {
                        stanzaEntity.no="1"
                        isSingleStanza=true
                    } else {
                        if(isSingleStanza) {
                            stanzaEntity.no=Integer.toString(order)
                        } else {
                            stanzaEntity.no = "chorus"
                        }
                    }
                } else {
                    if(!line.contains(".")) throw new Exception("There's no dot after number!!! " + line)
                    stanzaEntity.no=line.substring(0, line.indexOf(".")).trim()
                    line=line.substring(line.indexOf(".")+1).trim()
                }

                // record first line
                if(stanzaEntity.no=="chorus" && hymn.firstChorusLine==null) {
                    hymn.firstChorusLine=line
                } else if (hymn.firstStanzaLine==null) {
                    hymn.firstStanzaLine=line
                }

                stanzaEntity.order=order++
                stanzaEntity.text=""
            }
            stanzaEntity.text+=line+"<br/>"

        }

        return hymn

    }

    private Element getNextSiblingWithClass(Element element, String className) {
        def siblingElement= element
        while(siblingElement.nextElementSibling().select("."+className)[0]==null) {
            siblingElement= siblingElement.nextElementSibling()
            if(siblingElement.select(".hymntitle")[0]!=null) throw new Exception("Lyrics not found!!!!");
        }
        siblingElement.nextElementSibling()
    }

    private Document getDocumentFromHymn(int no, String prefix="") {
        Jsoup.parse(getfileFromHymn(no, prefix),"UTF-8","")
    }

    private File getfileFromHymn(int no, String prefix="") {
        int hundreds = no / 100
        def path = ROOT_PATH + prefix + hundreds + "00-" + hundreds + "99" + ".html"
        println "getting file: " + path
        return new File(this.getClass().getClassLoader().getResource(path).getPath())
    }



}