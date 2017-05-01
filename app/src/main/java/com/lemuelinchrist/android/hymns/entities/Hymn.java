package com.lemuelinchrist.android.hymns.entities;

import android.content.Context;
import android.content.res.AssetManager;
import android.media.MediaPlayer;
import android.util.Log;
import android.widget.Toast;

import com.lemuelinchrist.android.hymns.R;

import java.io.IOException;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class Hymn {
    private static final String LOGTAG = "HymnEntity";
    private Context context;
    private String group;
    private String hymnId;
    private String firstStanzaLine = null;
    private String firstChorusLine = null;
    private String mainCategory;
    private String subCategory;
    private ArrayList<Stanza> stanzas = new ArrayList<Stanza>();
    private String meter;
    private Set<String> related = new HashSet<String>();
    private String author;
    private String composer;
    private String time;
    private String key;
    private String tune;
    private String no;
    private String parentHymn;
    private String sheetMusicLink;

    private boolean isNewTune = false;
    private boolean hasOwnSheetMusic = true;

    public String getVerse() {
        return verse;
    }

    public void setVerse(String verse) {
        this.verse = verse;
    }

    private String verse;
    private MediaPlayer mp;

    public Hymn(Context context) {
        this.context = context;
    }

    public String getSheetMusicLink() {
        return sheetMusicLink;
    }

    public void setSheetMusicLink(String sheetMusicLink) {
        this.sheetMusicLink = sheetMusicLink;
    }

    public String getParentHymn() {
        return parentHymn;
    }

    public void setParentHymn(String parentHymn) {
        this.parentHymn = parentHymn;
    }



    public String getMainCategory() {
        return mainCategory;
    }

    public void setMainCategory(String mainCategory) {
        this.mainCategory = mainCategory;
    }

    public String getSubCategory() {
        return subCategory;
    }

    public void setSubCategory(String subCategory) {
        this.subCategory = subCategory;
    }

    public ArrayList<Stanza> getStanzas() {
        return stanzas;
    }

    public void setStanzas(ArrayList<Stanza> stanzas) {
        this.stanzas = stanzas;
    }

    public String getMeter() {
        return meter;
    }

    public void setMeter(String meter) {
        this.meter = meter;
    }

    public List<String> getRelated() {
        return new ArrayList<String>(related);
    }


    public void addRelated(String related) {
        if (related == null) {
            related = "";
        }
        this.related.addAll(Arrays.asList(related.split(",")));
        this.related.remove(this.getHymnId());
        this.related.remove("");
        if ( getParentHymn()!=null && !this.related.contains(getParentHymn())) {
            this.related.add(getParentHymn());
        }

    }

    public void addRelated(List related) {
        this.related.addAll(related);
        this.related.remove(this.getHymnId());

    }

    public String getAuthor() {
        return author;
    }

    public void setAuthor(String author) {
        this.author = author;
    }

    public String getComposer() {
        return composer;
    }

    public void setComposer(String composer) {
        this.composer = composer;
    }

    public String getTime() {
        return time;
    }

    public void setTime(String time) {
        this.time = time;
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getTune() {
        return tune;
    }

    public void setTune(String tune) {
        this.tune = tune;
    }

    public void playHymn() {
        Class<R.raw> rClass = R.raw.class;
        try {

            //	we don't want to play another thread while the song is still playing.
            if (mp != null && mp.isPlaying()) {
                return;
            }

            if (tune == null || tune.equals("")) {
                showNotAvailableToast();
                return;
            }

            Field field = rClass.getDeclaredField("m" + tune.toLowerCase());
            mp = MediaPlayer.create(context, field.getInt(new R()));

            mp.setLooping(true);
            mp.start();

        } catch (NoSuchFieldException e) {
            e.printStackTrace();
            showNotAvailableToast();

        } catch (Exception e) {
            Log.e(this.getClass().getName(),e.getMessage());
            e.printStackTrace();
        }

    }

    private void showNotAvailableToast() {
        Toast.makeText(context, "Sorry! hymn not available", Toast.LENGTH_SHORT).show();
    }

    public void stopHymn() {
        if (mp != null) {
            mp.stop();
        }
    }

    public String getFirstStanzaLine() {
        return firstStanzaLine;
    }

    public void setFirstStanzaLine(String firstStanzaLine) {
        this.firstStanzaLine = firstStanzaLine;
    }

    public String getFirstChorusLine() {
        return firstChorusLine;
    }

    public void setFirstChorusLine(String firstChorusLine) {
        this.firstChorusLine = firstChorusLine;
    }

    public String getNo() {
        return this.no;
    }

    public void setNo(String no) {
        this.no = no;
    }

    @Override
    public String toString() {
        return "Hymn{" +
                "group='" + group + '\'' +
                ", hymnId='" + hymnId + '\'' +
                ", firstStanzaLine='" + firstStanzaLine + '\'' +
                ", firstChorusLine='" + firstChorusLine + '\'' +
                ", mainCategory='" + mainCategory + '\'' +
                ", subCategory='" + subCategory + '\'' +
                ", stanzas=" + stanzas +
                ", meter='" + meter + '\'' +
                ", related=" + related +
                ", author='" + author + '\'' +
                ", composer='" + composer + '\'' +
                ", time='" + time + '\'' +
                ", key='" + key + '\'' +
                ", tune='" + tune + '\'' +
                ", no='" + no + '\'' +
                ", parentHymn='" + parentHymn + '\'' +
                ", sheetMusicLink='" + sheetMusicLink + '\'' +
                ", verse='" + verse + '\'' +
                '}';
    }

    public int getChorusCount() {
        int count = 0;
        for (Stanza stanza : this.stanzas) {
            if (stanza.getNo() == null) continue;
            if (stanza.getNo().trim().toLowerCase().equals("chorus"))
                count++;
        }
        return count;
    }


    public String getGroup() {
        return group;
    }

    public void setGroup(String group) {
        this.group = group;
    }

    public String getHymnId() {
        return hymnId;
    }

    public void setHymnId(String hymnId) {
        this.hymnId = hymnId;
    }

    public int getStanzaCount() {
        int stanzaCount = 0;
        for (Stanza stanza : stanzas) {
            if (isNumeric(stanza.getNo()))
                stanzaCount++;
        }
        return stanzaCount;
    }

    public boolean isNewTune() {
        return isNewTune;
    }

    public void setNewTune(boolean newTune) {
        isNewTune = newTune;
    }

    private static boolean isNumeric(String str) {
        try {
            double d = Double.parseDouble(str);
        } catch (NumberFormatException nfe) {
            return false;
        }
        return true;
    }

    public void setHasOwnSheetMusic(boolean hasOwnSheetMusic) {
        this.hasOwnSheetMusic = hasOwnSheetMusic;
    }

    public boolean hasOwnSheetMusic() {
        AssetManager assets = context.getAssets();
        try {
            for (String fileName : assets.list("svg")) {
                if(fileName.equals(hymnId+".svg")) return true;
            }

        } catch (IOException e) {
            Log.e(getClass().getName(),"something went wrong while listing files in svg folder",e);

        }
        return false;

    }
}
