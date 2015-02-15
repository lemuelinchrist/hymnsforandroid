package com.lemuelinchrist.android.hymns;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.Html;
import android.util.Log;
import android.util.TypedValue;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.entities.Stanza;
import com.lemuelinchrist.android.hymns.history.HistoryLogBook;
import com.lemuelinchrist.android.hymns.utils.HymnStack;
import com.lemuelinchrist.android.hymns.utils.HymnTextFormatter;
import com.lemuelinchrist.android.hymns.utils.SheetMusic;

import java.util.List;

/**
 * Created by lemuelcantos on 27/7/13.
 * <p/>
 * This Custom view takes care of displaying lyrings and playing songs of that lyric.
 */
public class LyricContainer extends LinearLayout {
    private TextView lyricHeader;
    private Context context;
    private Hymn hymn;
    private HymnsDao hymnsDao;
    private TextView lyricsView;
    private float fontSize;
    private SharedPreferences sharedPreferences;
    private HymnStack hymnStack;
    private LyricChangeListener lyricChangeListener;
    private SheetMusic sheetMusic;
    private HistoryLogBook historyLogBook;


    public LyricContainer(Context context) {

        super(context);
        Log.d(this.getClass().getSimpleName(), "LyricContainer(Context context) called!");
        initialize(context);

    }

    public LyricContainer(android.content.Context context, android.util.AttributeSet attrs) {
        super(context, attrs);
        Log.d(this.getClass().getSimpleName(), "LyricContainer(android.content.Context context, android.util.AttributeSet attrs) called!");
        initialize(context);
    }

    private void initialize(Context context) {
        this.context = context;
        hymnsDao = new HymnsDao(context);
        Log.d(this.getClass().getSimpleName(), "entering initialization of LyricContainer!");
        sharedPreferences = context.getSharedPreferences("Hymns", 0);
        fontSize = sharedPreferences.getFloat("fontSize", 18);

        //set up hymn stack (for back button functionality)
        hymnStack = new HymnStack();

        // initialize sheetMusic
        sheetMusic = new SheetMusic(context);

        historyLogBook = new HistoryLogBook(context);


    }

    public Hymn displayLyrics(String hymnId) {
        //split hymn group from hymn number
        String selectedHymnGroup;
        String selectedHymnNumber;
        if (Character.isLetter(hymnId.charAt(1))) {
            selectedHymnGroup = hymnId.substring(0, 2);
            selectedHymnNumber = hymnId.substring(2);
        } else {
            selectedHymnGroup = hymnId.substring(0, 1);
            selectedHymnNumber = hymnId.substring(1);
        }

        return displayLyrics(selectedHymnGroup, selectedHymnNumber);
    }

    public Hymn displayLyrics(String selectedHymnGroup, String selectedHymnNumber) {
        try {
            Log.d(this.getClass().getSimpleName(), "Displaying lyrics");

            // if there was a previous hymn
            if (hymn != null) {
                hymn.stopHymn();
//                hymnStack.push(hymn.getHymnId());

            }

            hymnsDao.open();
            hymn = hymnsDao.get(selectedHymnGroup + selectedHymnNumber);

            //if hymn is still null, it means the user entered a hymn number that doesn't exist
            if (hymn == null) return null;

            StringBuilder text = new StringBuilder();
            text.append("<br/><b>" + selectedHymnGroup + hymn.getNo());
            if (hymn.isNewTune()) text.append(" (New Tune)");
            text.append("<br/>");
            if (hymn.getMainCategory() != null) {
                text.append(hymn.getMainCategory());
            }
            if (hymn.getSubCategory() != null) {
                text.append(" - " + hymn.getSubCategory() + "</b><br/>");
            } else if (hymn.getMainCategory() != null || hymn.getSubCategory() != null) {
                text.append("</b><br/>");
            }
            if (hymn.getMeter() != null && !hymn.getMeter().equals("")) {
                text.append("Meter: ");
                text.append(hymn.getMeter() + "<br/>");
            }
            if (hymn.getTime() != null && !hymn.getTime().equals("")) {
                text.append("Time: ");
                text.append(hymn.getTime());
            }
            if (hymn.getKey() != null) {
                text.append(" - " + hymn.getKey() + "<br/>");
            }
            if (hymn.getVerse() != null) {
                text.append("Verses: ");
                text.append(hymn.getVerse() + "<br/>");
            }

            List<String> related = hymn.getRelated();
            if (related != null && related.size() != 0) {
                text.append("Related: ");
                StringBuilder relatedConcat = new StringBuilder();
                for (String r : related) {
//                    if (r.charAt(0) == 'T') continue;
                    relatedConcat.append(", ");
                    relatedConcat.append(r);
                }

                if (relatedConcat.length() > 2)
                    text.append(relatedConcat.substring(2));

                text.append("<br/>");
            }

            // R.id.lyricHeader
            lyricHeader = (TextView) findViewById(context.getResources().getIdentifier("lyricHeader", "id", context.getPackageName()));
            lyricHeader.setText(Html.fromHtml(text.toString()));


            text = new StringBuilder();
            String chorusText = "";
            for (Stanza stanza : hymn.getStanzas()) {
                Log.d(this.getClass().getSimpleName(), "Looping stanza: " + stanza.getNo());
                if (stanza.getNo().equals("chorus")) {
                    text.append("<b>##" + stanza.getNo() + "##</b><br/>");
                    if (stanza.getNote() != null)
                        text.append("<i>@@(" + stanza.getNote() + ")@@</i><br/>");
                    chorusText = "<i>@@" + stanza.getText() + "@@</i><br/>";
                    text.append(chorusText);
                } else if (stanza.getNo().equals("end-note")) {
                    text.append("<i>" + stanza.getText() + "</i><br/>");

                } else {
                    // append stanza
                    text.append("<b>##" + stanza.getNo() + "##</b><br/>");
                    text.append(stanza.getText() + "<br/>");

                    // append chorus after every stanza
                    if (hymn.getChorusCount() == 1) text.append(chorusText);
                }
            }
            text.append("<br/>Author: " + hymn.getAuthor() + "<br/>");
            text.append("Composer: " + hymn.getComposer());

            Log.i(this.getClass().getSimpleName(), text.toString());


            // add colors to text
            CharSequence formattedLyrics = HymnTextFormatter.format(Html.fromHtml(text.toString()), selectedHymnGroup);

            lyricsView = (TextView) findViewById(context.getResources().getIdentifier("jellybeanLyrics", "id", context.getPackageName()));
            lyricsView.setText(formattedLyrics);

            setLyricFontSize(fontSize);

        } catch (Exception e) {
            e.printStackTrace();
            Log.e(this.getClass().getSimpleName(), "Exception Thrown!!");
            Log.e(this.getClass().getSimpleName(), e.toString());
        } finally {
            hymnsDao.close();
        }

        if (lyricChangeListener != null)
            lyricChangeListener.lyricChanged(hymn);

        // push hymn to stack for back button functionality

        hymnStack.push(hymn.getHymnId());
        historyLogBook.log(hymn);

        return hymn;
    }

    public void stopPlaying() {
        if (hymn != null) {
            hymn.stopHymn();
        }
    }

    public void startPlaying() {
        if (hymn != null) hymn.playHymn();
    }

    public boolean translateTo(String selectedHymnGroup) {

        if (hymn != null) {

            // if selected hymn group did not change, skip translating
            if (selectedHymnGroup.equals(hymn.getGroup()))
                return false;


            int groupCharLength = selectedHymnGroup.length();
            for (String translation : hymn.getRelated()) {
                String iteratedGroupCode;
                // some hymn group codes have two characters, while others have only one. This if statement determines how many
                // characters the current group code has.
                //todo: refactor duplicates of this. perhaps create a method?
                if (Character.isLetter(translation.charAt(1))) {
                    iteratedGroupCode = translation.substring(0, 2);
                } else {
                    iteratedGroupCode = translation.substring(0, 1);
                }


                Log.d(this.getClass().getSimpleName(), "looping translation groups: " + iteratedGroupCode);
                if (iteratedGroupCode.equals(selectedHymnGroup)) {
                    String hymnNo = translation.substring(groupCharLength);
                    Log.i(this.getClass().getSimpleName(), "Translation found! group: " + iteratedGroupCode + " no:" + hymnNo);
                    displayLyrics(iteratedGroupCode, hymnNo);
                    if (this.hymn != null) {
                        historyLogBook.log(hymn);
                        return true;
                    }
                }
            }
            Log.d(this.getClass().getSimpleName(), "Translation NOT found! clearing Lyric Container");


            lyricHeader.setText(R.string.enterHymnNo);
            lyricsView.setText("");
            hymn.stopHymn();
            hymn = null;
            hymnStack.push(null);


        }
        lyricChangeListener.lyricChanged(hymn);
        return false;
    }

    public void setLyricFontSize(String size) {
        if (size.equals("Small")) {
            this.fontSize = 14;

        } else if (size.equals("Medium")) {
            this.fontSize = 18;

        } else if (size.equals("Large")) {
            this.fontSize = 22;

        } else if (size.equals("Extra Large")) {
            this.fontSize = 26;

        } else if (size.equals("XXL")) {
            this.fontSize = 32;
        }


        setLyricFontSize(fontSize);
    }

    private void setLyricFontSize(float size) {
        this.fontSize = size;
        SharedPreferences.Editor editor = sharedPreferences.edit();
        editor.putFloat("fontSize", size);
        editor.commit();
        if (lyricHeader != null && lyricsView != null) {
            lyricHeader.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
            lyricsView.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        }
    }

    public boolean isHymnDisplayed() {
        return (hymn != null);
    }

    public boolean goToPreviousHymn() {

        if (hymnStack.isEmpty()) {
            return false;
        } else {
            String poppedHymn = hymnStack.pop();
            if (poppedHymn == null)
                return false;

            else {
                displayLyrics(poppedHymn);
                return true;
            }
        }

    }

    public LyricChangeListener getLyricChangeListener() {
        return lyricChangeListener;
    }

    public void setLyricChangeListener(LyricChangeListener lyricChangeListener) {
        this.lyricChangeListener = lyricChangeListener;
    }


    public void getSheetMusic() { sheetMusic.getSheetMusic(hymn);}

}
