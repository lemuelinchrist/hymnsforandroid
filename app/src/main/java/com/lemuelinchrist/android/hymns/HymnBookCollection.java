package com.lemuelinchrist.android.hymns;

import android.os.Handler;
import android.support.v4.app.Fragment;
import android.support.v4.app.FragmentManager;
import android.support.v4.app.FragmentStatePagerAdapter;
import android.support.v4.view.ViewPager;
import android.util.Log;
import android.view.ViewGroup;

import com.lemuelinchrist.android.hymns.dao.HymnsDao;

import java.util.ArrayList;
import java.util.HashMap;

/**
 * Created by lemuel on 26/4/2017.
 */
public class HymnBookCollection {

    private static HashMap<HymnGroup, HymnBookAdapter> hymnBookAdapters = new HashMap<>();
    private final ViewPager lyricPager;
    private HymnsDao dao;
    private HashMap<Integer, LyricContainer> registeredFragments = new HashMap<>();

    private final HymnsActivity context;
    private HymnBookAdapter currentAdapter;
    private String newlySwitchedGroupHymnNumber = "1";

    public HymnBookCollection(final HymnsActivity context, final ViewPager lyricPager) {
        this.context = context;
        dao = new HymnsDao(context);
        this.lyricPager = lyricPager;
        switchHymnBook(HymnGroup.E);
        //lyricPager.setPageTransformer(true, new DepthPageTransformer());
        lyricPager.addOnPageChangeListener(new ViewPager.OnPageChangeListener() {
            @Override
            public void onPageScrolled(int i, float v, int i1) {
            }

            @Override
            public void onPageSelected(int i) {
                context.lyricChanged(getCurrentHymnId());


            }

            @Override
            public void onPageScrollStateChanged(int i) {

            }
        });

    }


    public void switchHymnBook(HymnGroup hymnGroup) {

        if (!hymnBookAdapters.containsKey(hymnGroup)) {
            Log.d(this.getClass().getName(), "generating new instance of HymnBook for selected hymn group: " + hymnGroup);
            HymnBookAdapter hymnBookAdapter = new HymnBookAdapter(context.getSupportFragmentManager());

            dao.open();
            try {
                hymnBookAdapter.hymnNumbers = dao.getHymnNumberArray(hymnGroup);
                hymnBookAdapter.hymnGroup = hymnGroup;
            } finally {
                dao.close();
            }

            hymnBookAdapters.put(hymnGroup, hymnBookAdapter);
        }
        lyricPager.setAdapter(null);
        lyricPager.setAdapter(hymnBookAdapters.get(hymnGroup));
        this.currentAdapter = hymnBookAdapters.get(hymnGroup);

    }

    public String getCurrentHymnId() {
        return getCurrentHymnLyric().getHymnId();
    }

    private LyricContainer getCurrentHymnLyric() {
        return currentAdapter.getLyricContainer(lyricPager.getCurrentItem());
    }

    public void switchToHymn(String rawData) {

        HymnGroup selectedHymnGroup = HymnGroup.getHymnGroupFromID(rawData);
        final String selectedHymnNumber = HymnGroup.getHymnNoFromID(rawData);


        if (currentAdapter != null && selectedHymnGroup != currentAdapter.hymnGroup) {
            switchHymnBook(selectedHymnGroup);

        }

        new Handler().post(new Runnable() {
            @Override
            public void run() {
                lyricPager.setCurrentItem(currentAdapter.getPositionOfHymnNo(selectedHymnNumber));
                context.lyricChanged(getCurrentHymnId());
            }
        });


    }

    public void getSheetMusic() {
        getCurrentHymnLyric().getSheetMusic();
    }

    public void translateTo(HymnGroup selectedHymnGroup) {
        if(selectedHymnGroup==currentAdapter.hymnGroup) return;
        String related = getCurrentHymnLyric().getRelatedHymnOf(selectedHymnGroup);
        if(related==null) {
            switchToHymn(selectedHymnGroup+"1");
        } else {
            switchToHymn(related);
        }

    }

    public void launchYouTubeApp() {
        getCurrentHymnLyric().launchYouTubeApp();
    }

    public void setLyricFontSize(String fontSize) {
        getCurrentHymnLyric().setLyricFontSize(fontSize);
    }

    public void stopPlaying() {
        getCurrentHymnLyric().startPlaying();
    }

    public void startPlaying() {
        getCurrentHymnLyric().startPlaying();

    }


    private class HymnBookAdapter extends FragmentStatePagerAdapter {

        private ArrayList<String> hymnNumbers;
        private HymnGroup hymnGroup;


        public ArrayList<String> getHymnNumbers() {
            return hymnNumbers;
        }

        public HymnBookAdapter(FragmentManager fm) {
            super(fm);
        }

        public int getPositionOfHymnNo(String hymnNo) {
            return hymnNumbers.indexOf(hymnNo);
        }

        @Override
        public Fragment getItem(int position) {
            Log.d(getClass().getSimpleName(), "getItem position: " + position);

            LyricContainer lyric = LyricContainer.newInstance(context, null);
            lyric.setHymn(hymnGroup.toString() + hymnNumbers.get(position));
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