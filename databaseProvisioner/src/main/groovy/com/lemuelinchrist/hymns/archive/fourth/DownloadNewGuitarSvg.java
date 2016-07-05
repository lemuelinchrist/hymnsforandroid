package com.lemuelinchrist.hymns.archive.fourth;

import com.lemuelinchrist.hymns.FileUtils;
import com.lemuelinchrist.hymns.NewHymnalNetExtractor;

import java.io.IOException;

/**
 * Created by lemuelcantos on 19/12/15.
 */
public class DownloadNewGuitarSvg {
    public static void main (String[] args) throws Exception {

        NewHymnalNetExtractor.enableSSLSocket();
//        https://www.hymnal.net/Hymns/LongBeach/svg/lb43_g.svg

//        downloadEnglishHymns();
//        downloadNewSongs();
        for(int x =1; x<=86; x++){
            String formattedX = String.format("%02d", x);
            FileUtils.saveUrl(FileUtils.DATA_DIR + "/simplifiedGuitarSvg/NS" + (1000+x) + ".svg", "https://www.hymnal.net/Hymns/LongBeach/svg/lb" + formattedX + "_g.svg");

        }


    }

    private static void downloadNewSongs() throws IOException {
        for(int x =1; x<=522; x++){
            String formattedX = String.format("%04d", x);
            FileUtils.saveUrl(FileUtils.DATA_DIR + "/simplifiedGuitarSvg/NS" + x + ".svg", "https://www.hymnal.net/Hymns/NewSongs/svg/ns" + formattedX + "_g.svg");

        }
    }

    private static void downloadEnglishHymns() throws IOException {
        for(int x =1; x<=1348; x++){
            String formattedX = String.format("%04d", x);
            FileUtils.saveUrl(FileUtils.DATA_DIR + "/simplifiedGuitarSvg/E" + x + ".svg", "https://www.hymnal.net/Hymns/Hymnal/svg/e" + formattedX + "_g.svg");

        }
    }
}
