package com.lemuelinchrist.android.hymns.content;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.preference.PreferenceManager;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import androidx.cardview.widget.CardView;
import androidx.core.widget.NestedScrollView;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.content.sheetmusic.SheetMusicButton;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.logbook.LogBook;
import com.lemuelinchrist.android.hymns.style.Theme;
import com.lemuelinchrist.android.hymns.utils.HymnStack;
import com.lemuelinchrist.android.hymns.utils.YouTubeLauncher;

import java.util.HashSet;

/**
 * Created by lemuelcantos on 27/7/13.
 * <p/>
 * This Custom view takes care of displaying lyrics and playing songs of that lyric.
 */
public class ContentArea extends Fragment {
    public static final String HISTORY_LOGBOOK_FILE="logBook";

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

    private CardView buttonContainer;
    private PlayButton playButton;
    private SheetMusicButton sheetMusicButton;
    private FaveButton faveButton;
    private CopyButton copyButton;
    private YoutubePianoButton youtubePianoButton;

    @SuppressLint("ClickableViewAccessibility")
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

        //Sometimes hymnId can be null when app wakes up from a sleep several hours long. need to retrieve it from history
        if(hymnId==null) {
            hymnId = historyLogBook.getOrderedRecordList()[0].getHymnId();
        }

        hymnsDao.open();
        hymn = hymnsDao.get(hymnId);
        hymnsDao.close();

        LyricsArea lyricsArea = new LyricsArea(hymn,this,scrollView);

        if (hymnId != null) {
            lyricsArea.displayLyrics();
        }

        buttonContainer = rootView.findViewById(getRid("buttonContainer"));
        if(buttonContainer !=null ){
            buttonContainer.setCardBackgroundColor(getHymnGroup().getDayColor());
        }

        playButton = new PlayButton(hymn,this,
                (ImageButton)rootView.findViewById(getRid("playButton")));
        sheetMusicButton = new SheetMusicButton(hymn,this,
                (ImageButton)rootView.findViewById(getRid("sheetMusicButton")));
        faveButton = new FaveButton(hymn,this,
                (ImageButton)rootView.findViewById(getRid("faveButton")));
        copyButton = new CopyButton(hymn,this,
                (ImageButton)rootView.findViewById(getRid("copyButton")));
        youtubePianoButton = new YoutubePianoButton(hymn,this,
                (ImageButton)rootView.findViewById(getRid("youtubePianoButton")));

        return rootView;
    }

    private int getRid(String lyricHeader) {
        return context.getResources().getIdentifier(lyricHeader, "id", context
                .getPackageName());
    }

    public static ContentArea newInstance(Context context, Theme theme) {
        ContentArea lyric = new ContentArea();

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
        // No need to log default hymn number since it's the starting point anyway
        // NOTE: possible null pointer here!
        if(hymnStack != null && hymnStack.contains(hymn.getHymnId()) && !getHymnId().equals(HymnGroup.DEFAULT_HYMN_NUMBER))
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