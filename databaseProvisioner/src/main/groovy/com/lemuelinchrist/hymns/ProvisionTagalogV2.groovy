package com.lemuelinchrist.hymns

import org.jsoup.Jsoup
import org.jsoup.nodes.Document;

import java.io.File;

/**
 * @author Lemuel Cantos
 * @since 1/7/2018
 */
class ProvisionTagalogV2 {
    public static String ROOT_PATH="tagalogV2/";
    Document doc
    int hymnNo

    ProvisionTagalogV2() {
        doc=getDocumentFromHymn(1,"")
        doc.select("#t001")
        for(int x=0;x<100;x++) {

        }

    }

    static void main(String[] args) {
        def tagalog = new ProvisionTagalogV2();
        println tagalog.getfileFromHymn(233).exists();

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
}
