package com.lemuelinchrist.android.hymns;

import android.support.v4.app.Fragment;
import android.support.v4.app.FragmentManager;
import android.support.v4.app.FragmentStatePagerAdapter;
import android.support.v7.app.AppCompatActivity;
import android.util.Log;
import android.view.ViewGroup;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;

import java.util.ArrayList;
import java.util.HashMap;

/**
 * Created by lemuel on 26/4/2017.
 *
 * A Hymnbook is a collection of Lyrics that belong to a Hymn Group. One hymn group has one and only one instance of Hymnbook
 */
public class Hymnbook extends FragmentStatePagerAdapter {
    private HashMap<Integer, LyricContainer> registeredFragments = new HashMap<>();
    private ArrayList<String> hymnNumbers;
    private static HashMap<HymnGroup, Hymnbook> hymnBookCollection = new HashMap<>();
    private static HymnsDao dao;
    private AppCompatActivity context;
    private HymnGroup hymnGroup;

    public static Hymnbook getInstance(HymnGroup hymnGroup, AppCompatActivity context) {
        if(hymnBookCollection.containsKey(hymnGroup)) {
            return hymnBookCollection.get(hymnGroup);
        } else {
            Log.d(Hymnbook.class.getName(), "generating new instance of Hymnbook for selected hymn group: " + hymnGroup);
            Hymnbook hymnbook = new Hymnbook(context.getSupportFragmentManager());
            hymnbook.context = context;
            hymnbook.hymnGroup = hymnGroup;
            if(dao==null) {
                dao=new HymnsDao(context);
            }
            dao.open();
            try {

                hymnbook.hymnNumbers=dao.getHymnNumberArray(hymnGroup);
            } finally {
                dao.close();
            }
            return hymnbook;
        }
    }

    public ArrayList<String> getHymnNumbers() {
        return hymnNumbers;
    }

    public Hymnbook(FragmentManager fm) {
        super(fm);
    }

    public int getPositionOfHymnNo(String hymnNo) {
        return hymnNumbers.indexOf(hymnNo);
    }

    @Override
    public Fragment getItem(int position) {
        Log.d(getClass().getSimpleName(), "getItem position: " + position);

        LyricContainer lyric = LyricContainer.newInstance(context,null);
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

    public LyricContainer getLyricContainer(int position) {
        return registeredFragments.get(position);
    }
    public String getHymnId(int position) {
        return registeredFragments.get(position).getHymn();
    }


}