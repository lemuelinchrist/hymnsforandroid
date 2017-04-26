package com.lemuelinchrist.android.hymns;

//import android.app.ActionBar;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.support.v4.app.Fragment;
import android.support.v4.app.FragmentManager;
import android.support.v4.app.FragmentStatePagerAdapter;
import android.support.v4.view.ViewPager;
import android.support.v7.app.ActionBarDrawerToggle;
import android.support.v4.view.GravityCompat;
import android.support.v4.widget.DrawerLayout;
import android.support.v7.app.AppCompatActivity;
import android.util.Log;
import android.util.SparseArray;
import android.view.*;
import android.widget.AdapterView;
import android.widget.ListView;
import android.support.v7.app.ActionBar;


//import com.actionbarsherlock.widget.SearchView;
import android.widget.TextView;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.search.SearchActivity;

import java.lang.reflect.Method;
import java.util.HashMap;

//import android.widget.SearchView;


/**
 * Created by lemuelcantos on 17/7/13.
 */
public class HymnsActivity extends AppCompatActivity implements LyricChangeListener,MusicPlayerListener {
    protected final int INDEX_REQUEST = 1;
    protected String selectedHymnNumber;
    protected String selectedHymnGroup = "E";
    protected LyricContainer lyricContainer;
    private ListView mDrawerList;
    private DrawerLayout mDrawerLayout;
    private ActionBarDrawerToggle mDrawerToggle;

    private ActionBar actionBar;
    private MenuItem playMenuItem;
    private ViewPager mPager;
    private LyricContainerPagerAdapter mPagerAdapter;
    private HymnsActivity hymnActivity;
    private HymnsDao hymnsDao;

    private HashMap<HymnGroups,String[]> hymnNumbers= new HashMap<>();


    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d(this.getClass().getName(), "start app");
        hymnsDao=new HymnsDao(this);

        setContentView(R.layout.main_hymns_activity);

        hymnActivity=this;

        // Instantiate a ViewPager and a PagerAdapter.
        mPager = (ViewPager) findViewById(R.id.hymn_fragment_viewpager);
        mPagerAdapter = new LyricContainerPagerAdapter(getSupportFragmentManager());
        mPager.setAdapter(mPagerAdapter);


        actionBar = getSupportActionBar();
        actionBar.setDisplayShowTitleEnabled(true);
        actionBar.setDisplayHomeAsUpEnabled(true);

        mDrawerLayout = (DrawerLayout) findViewById(R.id.drawer_layout);
        mDrawerList = (ListView) findViewById(R.id.left_drawer);
        mDrawerLayout.setDrawerShadow(R.drawable.drawer_shadow, GravityCompat.START);
        mDrawerList.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> adapterView, View view, int position, long l) {
                selectDrawerItem(position);
            }
        });

        // set up the drawer's list view with items and click listener
        mDrawerList.setAdapter(new HymnDrawerListAdapter(this,
                R.layout.drawer_hymngroup_list));

        mDrawerToggle = new ActionBarDrawerToggle(
                this,                  /* host Activity */
                mDrawerLayout,         /* DrawerLayout object */
                R.string.drawer_open,
                R.string.drawer_close
        ) {
            public void onDrawerClosed(View view) {
                super.onDrawerClosed(view);
            }

            public void onDrawerOpened(View drawerView) {
                super.onDrawerOpened(drawerView);
            }
        };
        mDrawerLayout.setDrawerListener(mDrawerToggle);


    }

    // Warning! this method is very crucial. Without it you will not have a hamburger icon on your
    // action bar.
    @Override
    protected void onPostCreate(Bundle savedInstanceState) {
        super.onPostCreate(savedInstanceState);
        // Sync the toggle state after onRestoreInstanceState has occurred.
        mDrawerToggle.syncState();
    }

    private void downloadSheetMusic() {

        if (!lyricContainer.isHymnDisplayed()) {
            showAlert(R.string.choose_hymn_first, R.string.no_hymn_selected);
            return;
        }
        lyricContainer.getSheetMusic();


    }

    private void showAlert(int message, int title) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setMessage(message).setTitle(title);
        builder.setPositiveButton(R.string.ok, new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int id) {
                dialog.dismiss();
            }
        });
        AlertDialog dialog = builder.create();
        dialog.show();
    }

    private void selectDrawerItem(int position) {
        Log.i(HymnsActivity.class.getSimpleName(), "Drawer Item selected: " + position);

        selectedHymnGroup = HymnGroups.values()[position].name();

        if (selectedHymnGroup == null) {
            Log.w(HymnsActivity.class.getSimpleName(), "warning: selected Hymn group currently not supported. Switching to default group: E");
            selectedHymnGroup = "E";
        }

        lyricContainer.translateTo(selectedHymnGroup);
        mDrawerLayout.closeDrawer(mDrawerList);

    }


    @Override
    public boolean onCreateOptionsMenu(final Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.main, menu);

        playMenuItem=menu.findItem(R.id.action_play);

        return true;
    }

    private void checkHymnIsDisplayed() {
        if (!lyricContainer.isHymnDisplayed())
            showAlert(R.string.choose_hymn_first
                    , R.string.no_hymn_selected);
    }

    public boolean onOptionsItemSelected(MenuItem item) {

        boolean ret = false;
        Log.d(this.getClass().getName(), "Item selected: " + item.getItemId());

        // code for drawer:
        if (item.getItemId() == android.R.id.home) {
            toggleDrawer();
            return true;

        } else if (item.getItemId() == R.id.about) {
            showDialog(0);
            ret = true;

        } else if (item.getItemId() == R.id.action_index) {
            Intent intent = new Intent(getBaseContext(), SearchActivity.class);
            intent.putExtra("selectedHymnGroup", selectedHymnGroup);
            startActivityForResult(intent, INDEX_REQUEST);
            ret = true;

        } else if (item.getItemId() == R.id.action_play) {
            checkHymnIsDisplayed();
            if (item.getTitle().equals(getString(R.string.playHymn))) {
                lyricContainer.startPlaying();
            } else {
                lyricContainer.stopPlaying();
            }
            ret = true;

        } else if (item.getItemId() == R.id.action_fontsize) {
            // 1. Instantiate an AlertDialog.Builder with its constructor
            AlertDialog.Builder builder = new AlertDialog.Builder(this);
            final String[] fontSizes = getResources().getStringArray(R.array.font_sizes);

            // 2. Chain together various setter methods to set the dialog characteristics
            builder.setTitle(R.string.choose_font_size)
                    .setItems(fontSizes, new DialogInterface.OnClickListener() {

                        public void onClick(DialogInterface dialog, int which) {
                            lyricContainer.setLyricFontSize(fontSizes[which]);
                        }
                    });

            // 3. Get the AlertDialog from create()
            AlertDialog dialog = builder.create();
            dialog.show();
            ret = true;
        } else if (item.getItemId() == R.id.action_sheetmusic) {
            downloadSheetMusic();
            ret = true;

        }else if(item.getItemId() == R.id.action_searchYoutube) {
            checkHymnIsDisplayed();
            lyricContainer.launchYouTubeApp();
        }else

        {
            ret = false;
            Log.w(HymnsActivity.class.getSimpleName(), "Warning!! No Item was selected!!");
        }
        return ret;
    }

    private void toggleDrawer() {
        if (mDrawerLayout.isDrawerOpen(mDrawerList)) {
            mDrawerLayout.closeDrawer(mDrawerList);
        } else {
            mDrawerLayout.openDrawer(mDrawerList);
        }
    }

    @Override
    // *********** Display About Dialog
    protected Dialog onCreateDialog(int id) {
        switch (id) {
            case 0:
                Dialog aboutDialog = new Dialog(this);
                aboutDialog.setTitle("About");

                // Dynamically set the version number
                try {
                    String version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                    aboutDialog.setContentView(R.layout.about);
                    TextView hymnVersion = (TextView) aboutDialog.findViewById(R.id.hymnVersiontextView);
                    hymnVersion.setText(version);
                } catch (PackageManager.NameNotFoundException e) {
                    e.printStackTrace();
                }

                return aboutDialog;

        }
        return null;
    }

    @Override
    public void onPause() {
        super.onPause();
        lyricContainer.stopPlaying();
    }

    @Override
    // Get what the user chose from the Index of Hymns and display the Hymn
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == INDEX_REQUEST) {
            if (resultCode == RESULT_OK) {

                String rawData = data.getDataString().trim();
                selectedHymnGroup = LyricContainer.getHymnGroupFromID(rawData);
                selectedHymnNumber = LyricContainer.getHymnNoFromID(rawData);

                Log.i(this.getClass().getName(), "selected hymn number: " + selectedHymnNumber);


                lyricContainer=mPagerAdapter.getRegisteredFragment(mPager.getCurrentItem());
                lyricContainer.displayLyrics(selectedHymnGroup, selectedHymnNumber);

            }
        }
    }

    @Override
    public void onBackPressed() {
        Log.d(HymnsActivity.class.getSimpleName(), "onBackPressed Called");
        boolean isLyricContainerEmpty = !lyricContainer.goToPreviousHymn();

        if (isLyricContainerEmpty) {
            super.onBackPressed();
        }

    }

    @Override
    public void lyricChanged(Hymn hymn) {
        Log.d(HymnsActivity.class.getSimpleName(), "Lyric changed!!");

        if (hymn != null) {
            selectedHymnGroup = hymn.getGroup();
            selectedHymnNumber = hymn.getNo();
            actionBar.setTitle(hymn.getHymnId());

        } else {
            actionBar.setTitle(HymnGroups.valueOf(selectedHymnGroup).getSimpleName());
        }

        actionBar.setIcon(getResources().getIdentifier(selectedHymnGroup.toLowerCase(), "drawable", getPackageName()));
        actionBar.setBackgroundDrawable(new ColorDrawable(HymnGroups.valueOf(selectedHymnGroup).getRgbColor()));

    }

    @Override
    public void onMusicStarted() {
        playMenuItem.setIcon(R.drawable.ic_pause_white);
        playMenuItem.setTitle(getString(R.string.pauseHymn));
    }

    @Override
    public void onMusicStopped() {
        playMenuItem.setIcon(R.drawable.ic_play_arrow_white);
        playMenuItem.setTitle(getString(R.string.playHymn));

    }

    // This method adds icons in the overflow section of the action bar Menu
    // NOTE: This is one BIG heck of a boilerplate code
    @Override
    protected boolean onPrepareOptionsPanel(View view, Menu menu) {
        if (menu != null) {
            if (menu.getClass().getSimpleName().equals("MenuBuilder")) {
                try {
                    Method m = menu.getClass().getDeclaredMethod(
                            "setOptionalIconsVisible", Boolean.TYPE);
                    m.setAccessible(true);
                    m.invoke(menu, true);
                } catch (Exception e) {
                    Log.e(getClass().getSimpleName(), "onMenuOpened...unable to set icons for overflow menu", e);
                }
            }
        }
        return super.onPrepareOptionsPanel(view, menu);
    }

    public String[] getHymnNumbers(String hymnGroup) {
        if(!hymnNumbers.containsKey(HymnGroups.valueOf(hymnGroup))) {
            Log.d(this.getClass().getName(), "generating list of hymns for selected hymn group: " + hymnGroup);
            hymnsDao.open();
            try {

                hymnNumbers.put(HymnGroups.valueOf(hymnGroup),
                        hymnsDao.getHymnNumberArray(hymnGroup));
            } finally {
                hymnsDao.close();
            }
        }
        return hymnNumbers.get(HymnGroups.valueOf(hymnGroup));
    }


    private class LyricContainerPagerAdapter extends FragmentStatePagerAdapter {
        HashMap<Integer,LyricContainer> registeredFragments = new HashMap<>();

        public LyricContainerPagerAdapter(FragmentManager fm) {
            super(fm);

            lyricContainer=LyricContainer.newInstance(HymnsActivity.this, HymnsActivity.this, HymnsActivity.this);

        }

        @Override
        public Fragment getItem(int position) {
            Log.d(getClass().getSimpleName(), "getItem position: " + position);

            LyricContainer lyric = LyricContainer.newInstance(HymnsActivity.this, HymnsActivity.this, HymnsActivity.this);
            lyric.setHymn(selectedHymnGroup+(position+1));
            return lyric;

        }

        @Override
        public int getCount() {
            return getHymnNumbers(selectedHymnGroup).length;
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

        public LyricContainer getRegisteredFragment(int position) {
            return registeredFragments.get(position);
        }

        public HashMap<Integer,LyricContainer> getRegisteredFragments() {
            return registeredFragments;
        }

    }


}

