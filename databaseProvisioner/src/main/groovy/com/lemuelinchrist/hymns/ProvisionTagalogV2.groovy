package com.lemuelinchrist.hymns;

import java.io.File;

/**
 * @author Lemuel Cantos
 * @since 1/7/2018
 */
public class ProvisionTagalogV2 {
    public static String ROOT_PATH="tagalogV2/";
    public static void main(String[] args) {
        def tagalog = new ProvisionTagalogV2();
        println tagalog.getfileFromHymn(233).exists();

    }

    private File getfileFromHymn(int no) {
        int hundreds = no / 100;
        return new File(this.getClass().getResource(ROOT_PATH + hundreds +"00-"+ hundreds + "99"+ ".html").getPath());
    }
}
