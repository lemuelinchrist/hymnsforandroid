package com.lemuelinchrist.android.hymns.entities;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import com.lemuelinchrist.android.hymns.content.sheetmusic.SheetPlayer;
import android.util.Log;
import android.widget.Toast;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.NoSuchHymnGroupException;
import com.lemuelinchrist.android.hymns.R;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.util.*;

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
    private String tune="";
    private String no;
    private String parentHymn;

    private boolean isNewTune = false;
    // the hymn's own title when it differs from its first line; null means the first line is the title
    private String title;
    private boolean ownTune = false;
    private String ancestorSheetId;
    private String tuneSheetId;

    public String getVerse() {
        return verse;
    }

    public void setVerse(String verse) {
        this.verse = verse;
    }

    private String verse;

    public Hymn(Context context) {
        this.context = context;
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

    /**
     * The sheet the Play button plays (there are no MIDI files since 2026-11-26): the hymn's own sheet, or its
     * parent's/ancestor's when the hymn has no tune of its own (as the sheet button picks it), as long as it has a
     * melody (not a chords-only sheet). Null: nothing to play.
     */
    public String getSheetToPlay() {
        String id = getRootSheetId();
        if (id == null) return null;
        String mei = readSheetHead(id);
        if (mei == null || mei.contains("type=\"kind\">chords<")) return null;
        return id;
    }

    /** The beginning of a sheet's MEI file (its header), or null. */
    protected String readSheetHead(String id) {
        try (InputStream in = context.getAssets().open("sheetMei/" + id + ".mei")) {
            byte[] buf = new byte[2048];
            int off = 0, r;
            while (off < buf.length && (r = in.read(buf, off, buf.length - off)) != -1) {
                off += r;
            }
            return off <= 0 ? null : new String(buf, 0, off, java.nio.charset.StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    /** Whether Play has anything to play: a sheet with a melody. */
    public boolean canPlay() {
        return getSheetToPlay() != null;
    }

    /** Starts the melody; false when there is none (the "not available" toast is shown) or it could not start. */
    public boolean playHymn() {
        try {

            String sheet = getSheetToPlay();
            if (sheet == null) {
                showNotAvailableToast();
                return false;
            }
            // the sheet is played, again and again
            SheetPlayer.get(context).play(sheet);
            return true;

        } catch (Exception e) {
            Log.e(this.getClass().getName(),String.valueOf(e.getMessage()));
            e.printStackTrace();
        }
        return false;

    }

    private void showNotAvailableToast() {
        Toast.makeText(context, R.string.sorry_hymn_not_available, Toast.LENGTH_SHORT).show();
    }

    public void stopHymn() {
        SheetPlayer.stopIfActive();
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

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public boolean isNewTune() {
        return isNewTune;
    }

    public void setNewTune(boolean newTune) {
        isNewTune = newTune;
    }

    /** A New Tune or translation whose tune differs from its parent's: its music (tune, sheet, piano videos, recordings) is never the parent's. */
    public boolean hasOwnTune() {
        return ownTune;
    }

    public void setOwnTune(boolean ownTune) {
        this.ownTune = ownTune;
    }

    public void setAncestorSheetId(String ancestorSheetId) {
        this.ancestorSheetId = ancestorSheetId;
    }

    public void setTuneSheetId(String tuneSheetId) {
        this.tuneSheetId = tuneSheetId;
    }

    /** The sheet ID for this hymn: its own sheet, else its parent's or ancestor's (never past an own-tune boundary), else a sheet with the same tune. */
    public String getRootSheetId() {
        if (hasOwnSheetMusic()) return hymnId;
        if (!hasOwnTune() && hasSheetMusic(parentHymn)) return parentHymn;
        if (!hasOwnTune() && hasSheetMusic(ancestorSheetId)) return ancestorSheetId;
        if (hasSheetMusic(tuneSheetId)) return tuneSheetId;
        return null;
    }

    private static boolean isNumeric(String str) {
        try {
            double d = Double.parseDouble(str);
        } catch (NumberFormatException nfe) {
            return false;
        }
        return true;
    }

    public boolean hasOwnSheetMusic() {
        return hasSheetMusic(hymnId);
    }

    /** Whether sheet music ships for the given hymn ID (`assets/sheetMei/<id>.mei`). */
    public boolean hasSheetMusic(String id) {
        if (id == null || id.isEmpty()) return false;
        // sheet music ships as one MEI file per hymn (assets/sheetMei/<hymnId>.mei)
        try (InputStream ignored = context.getAssets().open("sheetMei/" + id + ".mei")) {
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    public String getRelatedHymnOf(HymnGroup selectedHymnGroup) {
        for (String related : related) {
            HymnGroup group;
            try {
                group = HymnGroup.getHymnGroupFromID(related);
            } catch (NoSuchHymnGroupException e) {
                continue;
            }

            Log.d(this.getClass().getSimpleName(), "looping translation groups: " + group);
            if (group.equals(selectedHymnGroup)) {
                String hymnNo = HymnGroup.getHymnNoFromID(related);
                Log.i(this.getClass().getSimpleName(), "Translation found! group: " + group + " no:" + hymnNo);
                return related;
            }
        }
        Log.i(this.getClass().getSimpleName(), "Translation NOT found! throwing null.");
        return null;
    }

    public HymnGroup getHymnGroup() {
        return HymnGroup.valueOf(getGroup().trim().toUpperCase());
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Hymn hymn = (Hymn) o;
        return Objects.equals(hymnId, hymn.hymnId);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(hymnId);
    }
}
