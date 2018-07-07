package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import org.jsoup.select.Elements;

import java.io.File;

/**
 * @author Lemuel Cantos
 * @since 1/7/2018
 */
class ProvisionTagalogV2 {


    ProvisionTagalogV2() {


        for(int x=0;x<100;x++) {

        }

    }


    static void main(String[] args) {
        println new HymnElement(1)

    }


}

class HymnElement {
    public static String ROOT_PATH="tagalogV2/";

    Document doc
    int hymnNo
    String htmlId;
    def baseElement

    public HymnElement(int no, String prefix="") {
        this.doc=getDocumentFromHymn(no,prefix)
        htmlId="#t" + String.format("%03d", no)
        baseElement=doc.select(htmlId)[0]

    }

    public String getLyrics() {
        baseElement.parent().nextElementSibling().select(".hymnbody p")[0].html()
    }

    private Document getDocumentFromHymn(int no, String prefix="") {
        Jsoup.parse(getfileFromHymn(no),"UTF-8","")
    }

    private File getfileFromHymn(int no, String prefix="") {
        int hundreds = no / 100
        def path = ROOT_PATH + prefix + hundreds + "00-" + hundreds + "99" + ".html"
        println "getting file: " + path
        return new File(this.getClass().getClassLoader().getResource(path).getPath())
    }

    String toString() {
        getLyrics()
    }

}