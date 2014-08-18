package com.lemuelinchrist.android.hymns;

//import android.app.ActionBar;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.support.v4.app.ActionBarDrawerToggle;
import android.support.v4.view.GravityCompat;
import android.support.v4.view.MenuItemCompat;
import android.support.v4.widget.DrawerLayout;
import android.support.v7.app.ActionBarActivity;
import android.support.v7.widget.SearchView;
import android.text.InputType;
import android.util.Log;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.widget.AdapterView;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;
import android.support.v7.app.ActionBar;



//import com.actionbarsherlock.widget.SearchView;
import com.lemuelinchrist.android.hymns.entities.Hymn;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;

//import android.widget.SearchView;


/**
 * Created by lemuelcantos on 17/7/13.
 */
public class HymnsActivity extends ActionBarActivity implements LyricChangeListener {
    public static final String LOGTAG = "HYMNSLOG";
    protected final int INDEX_REQUEST = 1;
    protected final int SDK_VERSION = Build.VERSION.SDK_INT;

    protected String selectedHymnNumber;
    protected String selectedHymnGroup = "E";
    protected LyricContainer lyricContainer;
    private ListView mDrawerList;
    private DrawerLayout mDrawerLayout;
    private ActionBarDrawerToggle mDrawerToggle;
    private TextView currentGroupView;
    private boolean areInstructionsHidden = false;

    private ActionBar actionBar;
    private SearchView searchView;


    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d(LOGTAG, "start app");
        setContentView(R.layout.main_hymns_activity);

        lyricContainer = (LyricContainer) findViewById(R.id.lyric_container);
        lyricContainer.setLyricChangeListener(this);

        actionBar = getSupportActionBar();
        actionBar.setDisplayShowHomeEnabled(true);
        actionBar.setDisplayShowTitleEnabled(true);
        actionBar.setDisplayOptions(ActionBar.DISPLAY_SHOW_HOME | ActionBar.DISPLAY_SHOW_TITLE | ActionBar.DISPLAY_SHOW_CUSTOM);
        actionBar.setCustomView(R.layout.actionbar);
        actionBar.setDisplayHomeAsUpEnabled(true);
        actionBar.setHomeButtonEnabled(true);
        actionBar.setIcon(getResources().getIdentifier("e", "drawable", getPackageName()));


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
        mDrawerList.setAdapter(new HymnListAdapter(this,
                R.layout.drawer_list_item));

        mDrawerToggle = new ActionBarDrawerToggle(
                this,                  /* host Activity */
                mDrawerLayout,         /* DrawerLayout object */
                R.drawable.ic_drawer,  /* nav drawer image to replace 'Up' caret */
                R.string.drawer_open,  /* "open drawer" description for accessibility */
                R.string.drawer_close  /* "close drawer" description for accessibility */
        ) {
            public void onDrawerClosed(View view) {
                invalidateOptionsMenu(); // creates call to onPrepareOptionsMenu()
            }

            public void onDrawerOpened(View drawerView) {
                invalidateOptionsMenu(); // creates call to onPrepareOptionsMenu()
            }
        };
        mDrawerLayout.setDrawerListener(mDrawerToggle);

        currentGroupView = (Button) findViewById(R.id.currentGroup);
        currentGroupView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                toggleDrawer();

            }
        });

        ImageView sheetMusicButton = (ImageView) findViewById(R.id.sheetMusicButton);


        // download sheet music
        sheetMusicButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                downloadSheetMusic();

            }
        });

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

        MenuItem item = menu.findItem(R.id.action_search);
        searchView = (SearchView) MenuItemCompat.getActionView(item);
        searchView.setIconifiedByDefault(true);
        searchView.setInputType(InputType.TYPE_CLASS_PHONE);
        searchView.setOnQueryTextListener(new SearchView.OnQueryTextListener() {
            @Override
            public boolean onQueryTextSubmit(String s) {

                selectedHymnNumber = s;
                Hymn hymn = lyricContainer.displayLyrics(selectedHymnGroup, selectedHymnNumber);

                searchView.setQuery("", false);

                // collapse the search view. Note that this method is used instead of
                // menuSearch.collapseActionView();
                // which for some reason does not work
                searchView.onActionViewCollapsed();

                return true;
            }

            @Override
            public boolean onQueryTextChange(String s) {
                return false;
            }

        });

        // collapse action view when out of focus
        searchView.setOnQueryTextFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View view, boolean b) {
                if (b == false) {
                    searchView.onActionViewCollapsed();
                }
            }
        });

        //************** make instructions interactive *********************

        findViewById(R.id.openHymnNumberInstruction).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                searchView.onActionViewExpanded();
            }
        });
        findViewById(R.id.searchHymnIndexInstruction).setOnClickListener(new View.OnClickListener() {
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


        return true;
    }

    public boolean onOptionsItemSelected(MenuItem item) {

        boolean ret = false;
        Log.d(LOGTAG, "Item selected: " + item.getItemId());

        // code for drawer:
        if (item.getItemId() == android.R.id.home) {
            toggleDrawer();
            return true;

        } else if (item.getItemId() == R.id.about) {
            showDialog(0);
            ret = true;

        } else if (item.getItemId() == R.id.action_index) {
            Intent intent = new Intent(getBaseContext(), IndexActivity.class);
            intent.putExtra("selectedHymnGroup", selectedHymnGroup);
            startActivityForResult(intent, INDEX_REQUEST);
            ret = true;

        } else if (item.getItemId() == R.id.action_play) {
            if (!lyricContainer.isHymnDisplayed())
                showAlert(R.string.choose_hymn_first
                        , R.string.no_hymn_selected);
            lyricContainer.startPlaying();
            ret = true;

        } else if (item.getItemId() == R.id.action_pause) {
            lyricContainer.stopPlaying();
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
        } else

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


                Log.i(LOGTAG, "selected hymn number: " + selectedHymnNumber);
                Log.i(LOGTAG, "selected hymn group: " + selectedHymnGroup);
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


        } else {
            // show instructions
            if (areInstructionsHidden == true) {
                findViewById(R.id.jellybeanContentScrollView).setVisibility(View.GONE);
                findViewById(R.id.instructionLayout).setVisibility(View.VISIBLE);
                areInstructionsHidden = false;
            }
        }

        // scroll back up to the top.
        findViewById(R.id.jellybeanContentScrollView).scrollTo(0, 0);

        actionBar.setIcon(getResources().getIdentifier(selectedHymnGroup.toLowerCase(), "drawable", getPackageName()));
        currentGroupView.setText(HymnGroups.valueOf(selectedHymnGroup).getSimpleName());

    }
}
