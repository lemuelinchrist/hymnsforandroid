package com.lemuelinchrist.android.hymns;

//import android.app.ActionBar;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.support.v7.app.ActionBarDrawerToggle;
import android.support.v4.view.GravityCompat;
import android.support.v4.widget.DrawerLayout;
import android.support.v7.app.ActionBarActivity;
import android.util.Log;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.AdapterView;
import android.widget.ListView;
import android.support.v7.app.ActionBar;
import android.widget.ScrollView;


//import com.actionbarsherlock.widget.SearchView;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.search.SearchActivity;

import java.lang.reflect.Method;

//import android.widget.SearchView;


/**
 * Created by lemuelcantos on 17/7/13.
 */
public class HymnsActivity extends ActionBarActivity implements LyricChangeListener,MusicPlayerListener {
    protected final int INDEX_REQUEST = 1;
    protected String selectedHymnNumber;
    protected String selectedHymnGroup = "E";
    protected LyricContainer lyricContainer;
    private ListView mDrawerList;
    private DrawerLayout mDrawerLayout;
    private ActionBarDrawerToggle mDrawerToggle;
    private boolean areInstructionsHidden = false;

    private ActionBar actionBar;
    private MenuItem playMenuItem;


    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d(this.getClass().getName(), "start app");
        setContentView(R.layout.main_hymns_activity);

        lyricContainer = (LyricContainer) findViewById(R.id.lyric_container);
        lyricContainer.setLyricChangeListener(this);
        lyricContainer.setMusicPlayerListener(this);

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

        // This onTouchListener will solve the problem of the scrollView undesiringly focusing on the lyric portion
        ScrollView scrollView = (ScrollView)findViewById(R.id.jellybeanContentScrollView);
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

        findViewById(R.id.openHymnNumberInstruction).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                onOptionsItemSelected(menu.findItem(R.id.action_index));
            }
        });
        findViewById(R.id.changeFontSizeInstruction).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                onOptionsItemSelected(menu.findItem(R.id.action_fontsize));

            }
        });
        findViewById(R.id.downloadSheetMusicInstruction).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                downloadSheetMusic();
            }
        });
        findViewById(R.id.playTuneInstruction).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                onOptionsItemSelected(menu.findItem(R.id.action_play));

            }
        });

        playMenuItem=menu.findItem(R.id.action_play);

        return true;
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
            if (!lyricContainer.isHymnDisplayed())
                showAlert(R.string.choose_hymn_first
                        , R.string.no_hymn_selected);
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
                aboutDialog.setContentView(R.layout.about);
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

                //split hymn group from hymn number
                String rawData = data.getDataString().trim();
                if (Character.isLetter(rawData.charAt(1))) {
                    selectedHymnGroup = rawData.substring(0, 2);
                    selectedHymnNumber = rawData.substring(2);
                } else {
                    selectedHymnGroup = rawData.substring(0, 1);
                    selectedHymnNumber = rawData.substring(1);
                }


                Log.i(this.getClass().getName(), "selected hymn number: " + selectedHymnNumber);
                Log.i(this.getClass().getName(), "selected hymn group: " + selectedHymnGroup);
                Hymn hymn = lyricContainer.displayLyrics(selectedHymnGroup, selectedHymnNumber);

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
            //hide instructions
            if (areInstructionsHidden == false) {
                findViewById(R.id.jellybeanContentScrollView).setVisibility(View.VISIBLE);
                findViewById(R.id.instructionLayout).setVisibility(View.GONE);
                areInstructionsHidden = true;
            }

            selectedHymnGroup = hymn.getGroup();
            selectedHymnNumber = hymn.getNo();
//            currentGroupView.setText(hymn.getHymnId());
            actionBar.setTitle(hymn.getHymnId());

        } else {
            // show instructions
            if (areInstructionsHidden == true) {
                findViewById(R.id.jellybeanContentScrollView).setVisibility(View.GONE);
                findViewById(R.id.instructionLayout).setVisibility(View.VISIBLE);
                areInstructionsHidden = false;
            }
//            currentGroupView.setText(HymnGroups.valueOf(selectedHymnGroup).getSimpleName());
            actionBar.setTitle(HymnGroups.valueOf(selectedHymnGroup).getSimpleName());
        }

        // scroll back up to the top.
//        findViewById(R.id.jellybeanContentScrollView).scrollTo(0, 0);

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
    @Override
    public boolean onMenuOpened(int featureId, Menu menu)
    {
        if(featureId == Window.FEATURE_ACTION_BAR && menu != null){
            if(menu.getClass().getSimpleName().equals("MenuBuilder")){
                try{
                    Method m = menu.getClass().getDeclaredMethod(
                            "setOptionalIconsVisible", Boolean.TYPE);
                    m.setAccessible(true);
                    m.invoke(menu, true);
                }
                catch(NoSuchMethodException e){
                    Log.e(this.getClass().getName(), "onMenuOpened", e);
                }
                catch(Exception e){
                    throw new RuntimeException(e);
                }
            }
        }
        return super.onMenuOpened(featureId, menu);
    }


}
