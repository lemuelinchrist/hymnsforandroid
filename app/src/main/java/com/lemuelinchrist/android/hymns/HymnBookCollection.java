package com.lemuelinchrist.android.hymns;

import java.util.ArrayList;
import java.util.HashMap;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.sheetmusic.SheetMusic;
import com.lemuelinchrist.android.hymns.sheetmusic.SheetMusicActivity;
import com.lemuelinchrist.android.hymns.style.Theme;
import com.lemuelinchrist.android.hymns.utils.HymnStack;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.support.v4.app.Fragment;
import android.support.v4.app.FragmentManager;
import android.support.v4.app.FragmentStatePagerAdapter;
import android.support.v4.view.ViewPager;
import android.support.v4.widget.NestedScrollView;
import android.util.Log;
import android.view.ViewGroup;
import android.widget.Toast;

/**
 * Created by lemuel on 26/4/2017.
 */
public class HymnBookCollection implements OnLyricVisibleListener {

    private HashMap<HymnGroup, HymnBookGroup> hymnBooks = new HashMap<>();
    private final ViewPager lyricPager;
    private HymnsDao dao;
    private HashMap<Integer, LyricContainer> registeredFragments = new HashMap<>();

    private final HymnsActivity context;
    private HymnBookGroup currentHymnBookGroup;
    private HymnStack hymnStack = new HymnStack("E1");
    private NestedScrollView.OnScrollChangeListener onScrollChangeListener;

    private Theme theme=Theme.LIGHT;

    public HymnBookCollection(final HymnsActivity context, final ViewPager lyricPager, Theme theme) {
        this.context = context;
        dao = new HymnsDao(context);
        this.lyricPager = lyricPager;
        this.theme=theme;
        this.onScrollChangeListener = context;
        //lyricPager.setPageTransformer(true, new DepthPageTransformer());

        switchHymnBook(HymnGroup.E);
    }

    public void setTheme(Theme theme) {
        if (this.theme==theme) {
            return;
        } else {
            this.theme=theme;
            refresh();
        }
    }

    private void refresh() {
        if(getCurrentHymnId()==null) return;
        String currentHymnId = (getCurrentHymnId()==null)?"E1":getCurrentHymnId();
        hymnBooks = new HashMap<>();
        try {
            switchHymnBook(HymnGroup.getHymnGroupFromID(currentHymnId));
            switchToHymn(currentHymnId);
        } catch (NoSuchHymnGroupException e) {
          Log.e(this.getClass().getName(),e.getMessage());
        }
    }

    private void switchHymnBook(HymnGroup hymnGroup) {

        if (!hymnBooks.containsKey(hymnGroup)) {
            Log.d(this.getClass().getName(), "generating new instance of HymnBook for selected hymn group: " + hymnGroup);
            HymnBookGroup hymnBookGroup = new HymnBookGroup(context.getSupportFragmentManager());

            dao.open();
            try {
                hymnBookGroup.hymnNumbers = dao.getArrayByHymnNo(hymnGroup);
                hymnBookGroup.hymnGroup = hymnGroup;
            } finally {
                dao.close();
            }

            hymnBooks.put(hymnGroup, hymnBookGroup);
        }
        lyricPager.setAdapter(null);
        lyricPager.setAdapter(hymnBooks.get(hymnGroup));
        this.currentHymnBookGroup = hymnBooks.get(hymnGroup);

    }

    public String getCurrentHymnId() {
        if(getCurrentHymnLyric()==null) {
            return null;
        }
        return getCurrentHymnLyric().getHymnId();
    }

    public void toggleFave() {
        if(currentHymnIsFaved()) {
            getCurrentHymnLyric().unfave();
        } else {
            getCurrentHymnLyric().fave();
        }
    }

    public boolean currentHymnIsFaved() {
        if(getCurrentHymnLyric()!=null) {
            return getCurrentHymnLyric().isFaved();
        } else {
            return false;
        }
    }

    private LyricContainer getCurrentHymnLyric() {
        return currentHymnBookGroup.getLyricContainer(lyricPager.getCurrentItem());
    }

    public void switchToHymn(String hymnId) {
        switchToHymn(hymnId, false);
    }

    public void switchToHymn(String hymnId, final boolean log) {

        if (hymnId.equals(getCurrentHymnId())) return;

        Log.i(getClass().getName(), "switching to hymn " + hymnId);

        HymnGroup selectedHymnGroup = null;
        try {
            selectedHymnGroup = HymnGroup.getHymnGroupFromID(hymnId);
        } catch (NoSuchHymnGroupException e) {
            e.printStackTrace();
            return;
        }
        final String selectedHymnNumber = HymnGroup.getHymnNoFromID(hymnId);

        // in case of a garbage collection cache wipe. note: this is not tested. probably useless.
        if(getCurrentHymnLyric()==null) {
            Log.e(this.getClass().getName(), "current hymn lyric missing! generating new hymn book");
            hymnBooks = new HashMap<>();
            switchHymnBook(selectedHymnGroup);
        }

        if (currentHymnBookGroup != null && selectedHymnGroup != currentHymnBookGroup.hymnGroup) {
            switchHymnBook(selectedHymnGroup);

        }


        new Handler().post(new Runnable() {
            @Override
            public void run() {
                Log.d(getClass().getName(), "position of hymn no: " + currentHymnBookGroup.getPositionOfHymnNo(selectedHymnNumber));
                lyricPager.setCurrentItem(currentHymnBookGroup.getPositionOfHymnNo(selectedHymnNumber));
                try {
                    context.onLyricVisible(getCurrentHymnId());
                } catch (Exception e) {
                    Log.e(getClass().getName(), "Error trying to switch Title hymn");

                }
            }
        });


    }

    public void translateTo(HymnGroup selectedHymnGroup) {
        if (selectedHymnGroup == currentHymnBookGroup.hymnGroup) return;
        String related = getCurrentHymnLyric().getRelatedHymnOf(selectedHymnGroup);
        if (related == null) {
            switchToHymn(selectedHymnGroup + "1");
        } else {
            log();  // log the hymn first before logging the translated one.
            switchToHymn(related, true);
        }

    }

    public void launchYouTubeApp() {
        getCurrentHymnLyric().launchYouTubeApp();
    }

    public void setLyricFontSize(String fontSize) {
        getCurrentHymnLyric().setLyricFontSize(fontSize);
    }

    public void stopPlaying() {
        getCurrentHymnLyric().stopPlaying();
    }

    public void startPlaying() {
        getCurrentHymnLyric().startPlaying();

    }

    public void launchSheetMusic() {

        String sheetMusicId = getCurrentHymnLyric().getRootMusicSheet();

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) {
            SheetMusic sheetMusic = new SheetMusic(context,sheetMusicId);
            sheetMusic.shareToBrowser();
            return;
        }

        if (sheetMusicId != null) {
            Intent intent = new Intent(context.getBaseContext(), SheetMusicActivity.class);
            intent.putExtra("selectedHymnId", sheetMusicId);
            context.startActivity(intent);
        } else {
            Toast.makeText(context, "Sorry! sheet music not available", Toast.LENGTH_SHORT).show();
        }
    }

    public void log() {
        getCurrentHymnLyric().log();
        hymnStack.push(getCurrentHymnId());
    }

    @Override
    public void onLyricVisible(String hymnId) {

        // sometimes current hymn lyric is null becuase of a random garbage cleanup.
        if(getCurrentHymnLyric()==null) {
            Log.e(getClass().getName(), "Error trying to get current hymn lyric. is null.");
        } else {
            log();
        }
    }

    public void goToPreviousHymn() {

        if (!hymnStack.isEmpty()) {
            String poppedHymn = hymnStack.pop();
            if (poppedHymn != null) switchToHymn(poppedHymn);

        }

    }


    private class HymnBookGroup extends FragmentStatePagerAdapter {

        private ArrayList<String> hymnNumbers;
        private HymnGroup hymnGroup;
        private LyricContainer currentLyricContainer;


        public ArrayList<String> getHymnNumbers() {
            return hymnNumbers;
        }

        public HymnBookGroup(FragmentManager fm) {
            super(fm);
        }

        public int getPositionOfHymnNo(String hymnNo) {
            return hymnNumbers.indexOf(hymnNo);
        }

        @Override
        public Fragment getItem(int position) {
            Log.d(getClass().getSimpleName(), "getItem position: " + position);

            LyricContainer lyric = LyricContainer.newInstance(context, context, theme);
            lyric.addLyricVisibleListener(context);
            lyric.addLyricVisibleListener(HymnBookCollection.this);
            lyric.setOnScrollChangeListener(onScrollChangeListener);
            lyric.setHymn(hymnGroup.toString() + hymnNumbers.get(position));
            currentLyricContainer = lyric;
            return lyric;

        }

        @Override
        public int getCount() {
            return hymnNumbers.size();
        }

        @Override
        public Object instantiateItem(ViewGroup container, int position) {
            LyricContainer fragment = (LyricContainer) super.instantiateItem(container, position);
            registeredFragments.put(position, fragment);
            return fragment;
        }

        @Override
        public void destroyItem(ViewGroup container, int position, Object object) {
            registeredFragments.remove(position);
            super.destroyItem(container, position, object);
        }

        LyricContainer getLyricContainer(int position) {
            return registeredFragments.get(position);
        }


    }


}