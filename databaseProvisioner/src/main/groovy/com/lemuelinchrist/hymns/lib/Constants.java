package com.lemuelinchrist.hymns.lib;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Created by lemuelcantos on 13/7/16.
 */
public class Constants {
    public static String DATA_DIR;
    public static final String SHEET_GUITAR_DIR = DATA_DIR + "/guitarSvg";
    public static final String SHEET_PIANO_DIR = DATA_DIR + "/pianoSvg";
    public static final String MIDI_PIANO_DIR = DATA_DIR + "/midi";
    public static final String HYMNS_UNIT = "hymnsUnit";
    private static final String HYMNAL_NET = "https://www.hymnal.net/";
    public static final String HYMNAL_NET_CHINESE_SUPPLEMENT = HYMNAL_NET + "zh_TW/hymn.php/ts/";
    public static final String NEW_SONGS_SHEET_LINK =HYMNAL_NET + "en/hymn/ns/";
    public static final String NEW_TUNES_SHEET_LINK =HYMNAL_NET + "en/hymn/nt/";
    public static String HYMNAL_NET_URL = HYMNAL_NET + "en/hymn.php/h/";
    public static String HYMNAL_NET_CEBUANO = HYMNAL_NET + "en/hymn.php/cb/";
    public static String HYMNAL_NET_CHINESE = HYMNAL_NET + "en/hymn/ch/";
    public static String HYMNAL_NET_SELECTED_CHINESE = HYMNAL_NET + "en/hymn/ts/";
    public static String HYMNAL_NET_LONGBEACH = HYMNAL_NET + "en/hymn.php/lb/";
    public static String HYMNAL_NET_NEWSONGS = HYMNAL_NET + "en/hymn.php/ns/";
    public static String HYMNAL_NET_TAGALOG  = HYMNAL_NET + "en/hymn/ht/";
    public static String CEBUANO = "cb";
    public static String LONGBEACH= "NS";
    public static String HYMNAL_NET_NEWTUNES= HYMNAL_NET + "en/hymn.php/nt/";
    public static String SQLITE_FILE_PATH;

    static {

        Properties prop = new Properties();
        try {
            InputStream is = Constants.class.getResourceAsStream("/project.properties");
            prop.load(is);
            System.out.println("constant: " + prop.getProperty("sqlite.file.path"));
            SQLITE_FILE_PATH = prop.getProperty("sqlite.file.path");
            DATA_DIR= prop.getProperty("data.dir");
        } catch (IOException e) {
            e.printStackTrace();
        }


    }

}
