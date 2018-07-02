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
    static void main(String[] args) {
        def tagalog = new ProvisionTagalogV2();
        println tagalog.getfileFromHymn(233).exists();

    }

    private void getDocument(File file) {
        Document doc = Jsoup.parse(file)
    }

    private File getfileFromHymn(int no, String prefix="") {
        int hundreds = no / 100
        def path = ROOT_PATH + prefix + hundreds + "00-" + hundreds + "99" + ".html"
        println "getting file: " + path
        return new File(this.getClass().getClassLoader().getResource(path).getPath())
    }
}
