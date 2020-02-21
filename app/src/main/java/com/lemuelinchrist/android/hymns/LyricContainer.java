package com.lemuelinchrist.android.hymns;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.preference.PreferenceManager;
import android.text.Html;
import android.util.Log;
import android.util.TypedValue;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.cardview.widget.CardView;
import androidx.core.widget.NestedScrollView;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.entities.Stanza;
import com.lemuelinchrist.android.hymns.logbook.LogBook;
import com.lemuelinchrist.android.hymns.sheetmusic.SheetMusicButton;
import com.lemuelinchrist.android.hymns.style.HymnTextFormatter;
import com.lemuelinchrist.android.hymns.style.Theme;
import com.lemuelinchrist.android.hymns.utils.HymnStack;
import com.lemuelinchrist.android.hymns.utils.YouTubeLauncher;

import java.util.HashSet;
import java.util.List;

/**
 * Created by lemuelcantos on 27/7/13.
 * <p/>
 * This Custom view takes care of displaying lyrics and playing songs of that lyric.
 */
public class LyricContainer extends Fragment {
    public static final String HISTORY_LOGBOOK_FILE="logBook";
    private TextView lyricHeader;
    private TextView composerView;
    private ViewGroup stanzaView;

    private Context context;
    private Hymn hymn;
    private static HymnsDao hymnsDao = null;
    private static float fontSize;
    private SharedPreferences sharedPreferences;
    private LogBook historyLogBook;

    private String hymnId;
    private HashSet<OnLyricVisibleListener> onLyricVisibleLIsteners = new HashSet<>();
    private Theme theme;
    private HymnStack hymnStack;
    private int columnNo=0;
    private LinearLayout currentTextLinearLayout;
    private CardView cardView;
    private PlayButton playButton;
    private SheetMusicButton sheetMusicButton;
    private FaveButton faveButton;

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {

        this.context = getContext();
        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context);

        if (theme == null) {

            theme = Theme.isNightModePreferred(sharedPreferences.getBoolean("nightMode", false));
        }

        ViewGroup rootView = (ViewGroup) inflater.inflate(
                theme.getStyle(), container, false);

        if (hymnsDao == null) {
            hymnsDao = new HymnsDao(context);
        }
        Log.d(this.getClass().getSimpleName(), "entering initialization of new LyricContainer!");
        fontSize = Float.parseFloat(sharedPreferences.getString("FontSize", "18f"));
        lyricHeader = rootView.findViewById(getRid("lyricHeader"));

        // remove placeholder because it only contains dummy lyrics
        stanzaView = rootView.findViewById(getRid("stanzaView"));
        stanzaView.removeView(stanzaView.getChildAt(0));

        composerView = rootView.findViewById(getRid("composer"));
        cardView = rootView.findViewById(getRid("buttonCardContainer"));

        // This onTouchListener will solve the problem of the scrollView undesiringly focusing on the lyric portion
        NestedScrollView scrollView = rootView.findViewById(R.id.jellybeanContentScrollView);
        scrollView.setDescendantFocusability(ViewGroup.FOCUS_BEFORE_DESCENDANTS);
        scrollView.setFocusable(true);
        scrollView.setFocusableInTouchMode(true);
        scrollView.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                v.requestFocusFromTouch();
                return false;
            }
        });

        historyLogBook = new LogBook(context,HISTORY_LOGBOOK_FILE);

        if (hymnId != null) {
            displayLyrics(hymnId);
        }

        playButton = new PlayButton(hymn,this,
                (ImageButton)rootView.findViewById(getRid("playButton")));
        sheetMusicButton = new SheetMusicButton(hymn,this,
                (ImageButton)rootView.findViewById(getRid("sheetMusicButton")));
        faveButton = new FaveButton(hymn,this,
                (ImageButton)rootView.findViewById(getRid("faveButton")));

        return rootView;
    }

    private int getRid(String lyricHeader) {
        return context.getResources().getIdentifier(lyricHeader, "id", context
                .getPackageName());
    }

    public static LyricContainer newInstance(Context context, Theme theme) {
        LyricContainer lyric = new LyricContainer();

        lyric.setContext(context);
        lyric.setTheme(theme);
        return lyric;
    }

    public void addLyricVisibleListener(OnLyricVisibleListener lyricVisibleListener) {
        onLyricVisibleLIsteners.add(lyricVisibleListener);
    }

    @Override
    public void setUserVisibleHint(boolean isVisibleToUser) {
        super.setUserVisibleHint(isVisibleToUser);

        if (isVisibleToUser && hymn != null) {
            onLyricVisible();
        }
    }

    private void onLyricVisible() {
        for (OnLyricVisibleListener listener : onLyricVisibleLIsteners) {
            listener.onLyricVisible(hymn.getHymnId());
        }
        if (hymn != null) log();
    }

    @Override
    public void onResume() {
        Log.d(this.getClass().getSimpleName(), "onResume called on LyricContainer with hymn: " + hymn);
        super.onResume();
        if (getUserVisibleHint()) onLyricVisible();
    }

    public void setContext(Context context) {
        this.context = context;
    }

    public void setHymn(String hymnId) {
        this.hymnId = hymnId;
    }

    public String getHymnId() {
        return this.hymnId;
    }

    public Hymn displayLyrics(String hymnId) {
        try {
            return displayLyrics(HymnGroup.getHymnGroupFromID(hymnId).toString(), HymnGroup.getHymnNoFromID(hymnId));
        } catch (NoSuchHymnGroupException e) {
            e.printStackTrace();
            return null;
        }
    }

    public Hymn displayLyrics(String selectedHymnGroup, String selectedHymnNumber) {
        try {
            Log.d(this.getClass().getSimpleName(), "Displaying lyrics");

            if (hymnsDao == null) {
                hymnsDao = new HymnsDao(context);
            }
            hymnsDao.open();
            hymn = hymnsDao.get(selectedHymnGroup + selectedHymnNumber);

            //if hymn is still null, it means the user entered a hymn number that doesn't exist
            if (hymn == null) return null;

            // ########################### Build Header
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

            // ** build related
            List<String> related = hymn.getRelated();
            if (related != null && related.size() != 0) {
                text.append("Related: ");
                StringBuilder relatedConcat = new StringBuilder();
                for (String r : related) {
                    relatedConcat.append(", ");
                    relatedConcat.append(r);
                }

                if (relatedConcat.length() > 2)
                    text.append(relatedConcat.substring(2));

                text.append("<br/>");
            }
            lyricHeader.setText(Html.fromHtml(text.toString()));

            // ######################## Build Lyric Text

            String chorusText = "";
            for (Stanza stanza : hymn.getStanzas()) {
                text = new StringBuilder();
                Log.d(this.getClass().getSimpleName(), "Looping stanza: " + stanza.getNo());
                if (stanza.getNo().equals("chorus")) {
//                    text.append("<b>##" + stanza.getNo() + "##</b><br/>");
                    if (stanza.getNote() != null)
                        text.append("<i>@@(" + stanza.getNote() + ")@@</i>");
                    chorusText = "<i>@@" + stanza.getText() + "@@</i>";
                    text.append(chorusText);
                    buildLyricViewAndAttach(text, selectedHymnGroup);
                } else if (stanza.getNo().equals("end-note") || stanza.getNo().equals("beginning-note") ||
                        stanza.getNo().equals("note")) {
                    text.append("<i>" + stanza.getText() + "</i>");
                    buildLyricViewAndAttach(text, selectedHymnGroup);
                } else {
                    // append stanza
                    text.append("<b>##" + stanza.getNo() + "##</b><br/>");
                    text.append(stanza.getText());
                    buildLyricViewAndAttach(text, selectedHymnGroup);

                    // append chorus after every stanza
                    if (hymn.getChorusCount() == 1 && !chorusText.isEmpty())
                        buildLyricViewAndAttach(new StringBuilder(chorusText), selectedHymnGroup);
                }
            }

            // remove unused textview if uneven
            // if column is odd
            if (columnNo % 2 != 0) {
                currentTextLinearLayout.removeViewAt(1);
            }

            // #################### Build Footer
            text= new StringBuilder();
            text.append("Author: " + hymn.getAuthor() + "<br/>");
            text.append("Composer: " + hymn.getComposer());
            CharSequence formattedLyrics = HymnTextFormatter.format(Html.fromHtml(text.toString()), theme.getTextColor(HymnGroup.valueOf(selectedHymnGroup)));
            composerView.setText(formattedLyrics);

            setLyricFontSize(fontSize);
            if(cardView!=null){
                cardView.setCardBackgroundColor(getHymnGroup().getDayColor());
            }

        } catch (Exception e) {
            e.printStackTrace();
            Log.e(this.getClass().getSimpleName(), "Exception Thrown!!");
            Log.e(this.getClass().getSimpleName(), e.toString());
        } finally {
            hymnsDao.close();
        }
        return hymn;
    }

    private void buildLyricViewAndAttach(StringBuilder text, String selectedHymnGroup) {
        Log.i(this.getClass().getSimpleName(), text.toString());

        // add colors to text
        CharSequence formattedLyrics = HymnTextFormatter.format(Html.fromHtml(text.toString()), theme.getTextColor(HymnGroup.valueOf(selectedHymnGroup)));

        TextView view;
        // if column is odd
        if (++columnNo % 2 != 0) {
            currentTextLinearLayout = (LinearLayout) LayoutInflater.from(context).inflate(R.layout.stanza_linear_layout, null);
            stanzaView.addView(currentTextLinearLayout);
            // left column on landscape mode
            view = (TextView) currentTextLinearLayout.getChildAt(0);
        } else {
            // right column on landscape mode
            view = (TextView) currentTextLinearLayout.getChildAt(1);
        }
        view.setText(formattedLyrics);

        // stylize...
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);
        view.setTextColor(theme.getTextColor());
        view.setBackgroundColor(theme.getTextBackgroundColor());
    }

    public void setLyricFontSize(String size) {
        setLyricFontSize(Float.parseFloat(size));
    }

    private void setLyricFontSize(float size) {
        fontSize = size;
        SharedPreferences.Editor editor = sharedPreferences.edit();
        editor.putFloat("fontSize", size);
        editor.commit();
        if (lyricHeader != null && composerView!=null) {
            lyricHeader.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
            composerView.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        }
    }

    public boolean isHymnDisplayed() {
        return (hymn != null);
    }

    public void launchYouTubeApp() {
        if (isHymnDisplayed()) {
            YouTubeLauncher launcher = new YouTubeLauncher(context);
            launcher.launch(hymn);
        }

    }

    public HymnGroup getHymnGroup() {
        return HymnGroup.valueOf(hymn.getGroup().trim().toUpperCase());
    }

    public String getRelatedHymnOf(HymnGroup selectedHymnGroup) {
        return hymn.getRelatedHymnOf(selectedHymnGroup);
    }

    public void log() {
        if(hymnStack.contains(hymn.getHymnId()))
            historyLogBook.log(hymn);
    }

    @Override
    public void onPause() {
        super.onPause();
        playButton.stop();
    }

    public void setTheme(Theme theme) {
        this.theme = theme;
    }

    public void setHymnStack(HymnStack hymnStack) {
        this.hymnStack=hymnStack;
    }
}