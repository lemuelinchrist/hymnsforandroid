package com.lemuelinchrist.hymns.lib;

import com.lemuelinchrist.hymns.lib.beans.HymnsEntity;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Created by lemuelcantos on 13/7/16.
 */
public class Constants {
    public static String DATA_DIR;
    public static String MIDI_DIR;
    public static String SHEET_GUITAR_DIR;
    public static String SHEET_PIANO_DIR;
    public static String MIDI_PIANO_DIR;
    public static String HYMNS_UNIT = "hymnsUnit";
    private static String HYMNAL_NET = "https://www.hymnal.net/";
    public static String HYMNAL_NET_CHINESE_SUPPLEMENT = HYMNAL_NET + "en/hymn/ts/";
    public static String NEW_SONGS_SHEET_LINK =HYMNAL_NET + "en/hymn/ns/";
    public static String NEW_TUNES_SHEET_LINK =HYMNAL_NET + "en/hymn/nt/";
    public static String HYMNAL_NET_URL = HYMNAL_NET + "en/hymn.php/h/";
    public static String HYMNAL_NET_CEBUANO = HYMNAL_NET + "en/hymn/cb/";
    public static String HYMNAL_NET_CHINESE = HYMNAL_NET + "en/hymn/ch/";
    public static String HYMNAL_NET_CHILDREN = HYMNAL_NET + "en/hymn/c/";
    public static String HYMNAL_NET_DUTCH = HYMNAL_NET + "en/hymn/hd";
    public static String HYMNAL_NET_GERMAN = HYMNAL_NET + "en/hymn/de";
    public static String HYMNAL_NET_SELECTED_CHINESE = HYMNAL_NET + "en/hymn/ts/";
    public static String HYMNAL_NET_LONGBEACH = HYMNAL_NET + "en/hymn/lb/";
    public static String HYMNAL_NET_NEWSONGS = HYMNAL_NET + "en/hymn/ns/";
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
            SQLITE_FILE_PATH = prop.getProperty("sqlite.file.path");
            DATA_DIR= prop.getProperty("data.dir");
            MIDI_DIR=prop.getProperty("midi.dir");
            SHEET_GUITAR_DIR = DATA_DIR + "/guitarSvg";
            SHEET_PIANO_DIR = DATA_DIR + "/pianoSvg";
            MIDI_PIANO_DIR = DATA_DIR + "/midi";
            System.out.println("sqlite file path: " + SQLITE_FILE_PATH);
            System.out.println("data dir: " + DATA_DIR);
        } catch (IOException e) {
            e.printStackTrace();
        }


    }

    public static String getHymnalNetUrl(HymnsEntity hymn) {
        if(hymn.getHymnGroup().equals("NS")) {
            return HYMNAL_NET_NEWSONGS;
        }
        if(hymn.getHymnGroup().equals("C")){
            return HYMNAL_NET_CHINESE;
        }
        if(hymn.getHymnGroup().equals("CS")){
            return HYMNAL_NET_CHINESE_SUPPLEMENT;
        }
        if(hymn.getHymnGroup().equals("CH")){
            return HYMNAL_NET_CHILDREN;
        }



        return null;
    }

}
