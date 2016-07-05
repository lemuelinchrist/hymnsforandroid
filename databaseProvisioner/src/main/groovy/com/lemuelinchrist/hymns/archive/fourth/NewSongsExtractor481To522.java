package com.lemuelinchrist.hymns.archive.fourth;

import com.lemuelinchrist.hymns.Dao;
import com.lemuelinchrist.hymns.FileUtils;
import com.lemuelinchrist.hymns.NewHymnalNetExtractor;
import com.lemuelinchrist.hymns.beans.HymnsEntity;

/**
 * Created by lemuelcantos on 7/11/15.
 */
public class NewSongsExtractor481To522 {
    public static void main(String[] args) throws Exception{
//        migrateLongBeachHymnsto1000();
//        renameLongBeachSheetMusic();

//        clearRelated();
//        saveNewSongs();


        Dao dao = new Dao();
        HymnsEntity hymn=NewHymnalNetExtractor.convertWebPageToHymn(NewHymnalNetExtractor.HYMNAL_NET_SELECTED_CHINESE, "330", "CS","330");
        dao.save(hymn);


    }

    private static void saveNewSongs() throws Exception {
        Dao dao = new Dao();

        for(Integer x=481;x<=522; x++) {
            HymnsEntity hymn=NewHymnalNetExtractor.convertWebPageToHymn(NewHymnalNetExtractor.HYMNAL_NET_NEWSONGS, x.toString(), "NS",x.toString());
//            dao.save(hymn);
//            HymnsEntity hymn = dao.find("NS"+x);
//            FileUtils.saveUrl(NewHymnalNetExtractor.MIDI_PIANO_DIR + "/m" + hymn.getTune() + ".mid", NewHymnalNetExtractor.NEW_SONGS_SHEET_LINK + hymn.getId() + "/f=mid");


        }
    }

    private static void clearRelated() {
        Dao dao = new Dao();
        for(int x=1001;x<1087;x++ ) {
            dao.clearRelatedOfChildren("NS"+x);
        }
    }

    private static void migrateLongBeachHymnsto1000() {
        Dao dao = new Dao();
        for(int x=583;x<587;x++ ) {
            dao.changeHymnNumber("NS"+x, "NS", ""+(1000+x-500));
        }
    }
    public static void renameLongBeachSheetMusic() {

        for(int x=501;x<587;x++ ) {
            int newHymnNo=(1000+x-500);
            try {
                FileUtils.renameFile("/Users/lemuelcantos/Google Drive/hymnDev/HymnsForAndroidProject/HymnsForAndroid/app/src/guitarSvg/NS"+x+".svg",
                        "/Users/lemuelcantos/Google Drive/hymnDev/HymnsForAndroidProject/HymnsForAndroid/app/src/guitarSvg/NS"+newHymnNo+".svg");
                FileUtils.renameFile("/Users/lemuelcantos/Google Drive/hymnDev/HymnsForAndroidProject/HymnsForAndroid/app/src/pianoSvg/NS"+x+".svg",
                        "/Users/lemuelcantos/Google Drive/hymnDev/HymnsForAndroidProject/HymnsForAndroid/app/src/pianoSvg/NS"+newHymnNo+".svg");
            }catch (Exception e) {

            }
        }
    }
}
