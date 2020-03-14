package com.lemuelinchrist.android.hymns;

import android.os.Handler;
import android.util.Log;
import android.view.ViewGroup;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.fragment.app.FragmentStatePagerAdapter;
import androidx.viewpager.widget.ViewPager;
import com.lemuelinchrist.android.hymns.content.ContentArea;
import com.lemuelinchrist.android.hymns.content.OnLyricVisibleListener;
import com.lemuelinchrist.android.hymns.content.PlayButton;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.logbook.HymnRecord;
import com.lemuelinchrist.android.hymns.logbook.LogBook;
import com.lemuelinchrist.android.hymns.style.Theme;
import com.lemuelinchrist.android.hymns.utils.HymnStack;

import java.util.ArrayList;
import java.util.HashMap;

import static com.lemuelinchrist.android.hymns.content.ContentArea.HISTORY_LOGBOOK_FILE;

/**
 * Created by lemuel on 26/4/2017.
 */
public class HymnBookCollection implements OnLyricVisibleListener {

    private HashMap<HymnGroup, HymnBookGroup> hymnBooks = new HashMap<>();
    private final ViewPager lyricPager;
    private HymnsDao dao;
    private HashMap<Integer, ContentArea> registeredFragments = new HashMap<>();

    private final HymnsActivity context;
    private HymnBookGroup currentHymnBookGroup;
    private HymnStack hymnStack = new HymnStack("ML1");

    private Theme theme=Theme.LIGHT;

    public HymnBookCollection(final HymnsActivity context, final ViewPager lyricPager, Theme theme) {
        this.context = context;
        dao = new HymnsDao(context);
        this.lyricPager = lyricPager;
        this.theme=theme;

        switchHymnBook(HymnGroup.ML);
    }

    public void setTheme(Theme theme) {
        this.theme = theme;
    }

    public void refresh() {
        String currentHymnId;
        // If current hymn id is not present, get it from history
        if(getCurrentHymnId()==null) {
            LogBook historyLogBook = new LogBook(context,HISTORY_LOGBOOK_FILE);
            HymnRecord[] records = historyLogBook.getOrderedRecordList();
            currentHymnId = records.length>0 ? records[0].getHymnId() : "ML1";
        } else {
            currentHymnId =  getCurrentHymnId();
        }
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

    private ContentArea getCurrentHymnLyric() {
        return currentHymnBookGroup.getLyricContainer(lyricPager.getCurrentItem());
    }

    public void switchToHymnAndRememberChoice(String hymnNo) {
        hymnStack.push(hymnNo);  // log the hymn first before logging the translated one.
        switchToHymn(hymnNo);
    }

    public void switchToHymn(String hymnId) {

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
                Log.i(getClass().getName(), "Hymn group switch should have been completed by now. \n" +
                        "position of hymn no: " + currentHymnBookGroup.getPositionOfHymnNo(selectedHymnNumber) +
                        "\n attempting to switch to hymn number: " + selectedHymnNumber);
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
            switchToHymnAndRememberChoice(related);
        }

    }

    public void launchYouTubeApp() {
        getCurrentHymnLyric().launchYouTubeApp();
    }

    public void logToHistory() {
        getCurrentHymnLyric().log();
    }

    @Override
    public void onLyricVisible(String hymnId) {
        // Sometimes music might be playing in the background. Stop it.
        PlayButton.stopCurrentlyPlayingButton();

        // sometimes current hymn lyric is null becuase of a random garbage cleanup.
        if(getCurrentHymnLyric()==null) {
            Log.e(getClass().getName(), "Error trying to get current hymn lyric. is null.");
        } else {
            logToHistory();
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
        ContentArea currentContentArea;


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

            ContentArea lyric = ContentArea.newInstance(context, theme);
            lyric.setHymnStack(hymnStack);
            lyric.addLyricVisibleListener(context);
            lyric.addLyricVisibleListener(HymnBookCollection.this);
            lyric.setHymn(hymnGroup.toString() + hymnNumbers.get(position));
            currentContentArea = lyric;

            return lyric;
        }

        @Override
        public int getCount() {
            return hymnNumbers.size();
        }

        @Override
        public Object instantiateItem(ViewGroup container, int position) {
            ContentArea fragment = (ContentArea) super.instantiateItem(container, position);
            registeredFragments.put(position, fragment);
            return fragment;
        }

        @Override
        public void destroyItem(ViewGroup container, int position, Object object) {
            registeredFragments.remove(position);
            super.destroyItem(container, position, object);
        }

        ContentArea getLyricContainer(int position) {
            return registeredFragments.get(position);
        }


    }


}