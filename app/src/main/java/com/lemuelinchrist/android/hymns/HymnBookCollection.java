package com.lemuelinchrist.android.hymns;

import android.content.Context;
import android.os.Handler;
import android.support.annotation.NonNull;
import android.support.annotation.Nullable;
import android.support.v4.app.Fragment;
import android.support.v4.app.FragmentManager;
import android.support.v4.app.FragmentStatePagerAdapter;
import android.support.v4.view.PagerAdapter;
import android.support.v4.view.ViewPager;
import android.support.v7.app.AppCompatActivity;
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
        lyricPager.addOnAdapterChangeListener(new ViewPager.OnAdapterChangeListener() {
            @Override
            public void onAdapterChanged(@NonNull ViewPager viewPager, @Nullable PagerAdapter pagerAdapter, @Nullable PagerAdapter pagerAdapter1) {
                if (pagerAdapter == null) return;

                new Handler().post(new Runnable() {
                    @Override
                    public void run() {
                        lyricPager.setCurrentItem(currentAdapter.getPositionOfHymnNo(newlySwitchedGroupHymnNumber));
                        newlySwitchedGroupHymnNumber = "1";
                    }
                });
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
        return currentAdapter.getLyricContainer(lyricPager.getCurrentItem()).getHymn();
    }

    public void switchToHymn(String rawData) {
        HymnGroup selectedHymnGroup = HymnGroup.getHymnGroupFromID(rawData);
        String selectedHymnNumber = HymnGroup.getHymnNoFromID(rawData);


        if (currentAdapter != null && selectedHymnGroup != currentAdapter.hymnGroup) {
            newlySwitchedGroupHymnNumber = selectedHymnNumber;
            switchHymnBook(selectedHymnGroup);

        } else {
            lyricPager.setCurrentItem(currentAdapter.getPositionOfHymnNo(selectedHymnNumber));

        }


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