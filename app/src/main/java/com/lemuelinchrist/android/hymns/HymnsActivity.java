package com.lemuelinchrist.android.hymns;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.*;
import android.widget.AdapterView;
import android.widget.ListView;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.ActionBarDrawerToggle;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.view.GravityCompat;
import androidx.drawerlayout.widget.DrawerLayout;
import androidx.preference.PreferenceManager;
import androidx.viewpager.widget.ViewPager;
import com.lemuelinchrist.android.hymns.content.OnLyricVisibleListener;
import com.lemuelinchrist.android.hymns.search.SearchActivity;
import com.lemuelinchrist.android.hymns.settings.SettingsActivity;
import com.lemuelinchrist.android.hymns.style.Theme;
import com.lemuelinchrist.android.hymns.utils.Networks.NetworkCache;


/**
 * Created by lemuelcantos on 17/7/13.
 */
public class HymnsActivity extends AppCompatActivity implements OnLyricVisibleListener, HymnSwitcher,
        SharedPreferences.OnSharedPreferenceChangeListener {
    protected final int SEARCH_REQUEST = 1;
    protected HymnGroup selectedHymnGroup = HymnGroup.getDefaultHymnGroup();
    private ListView mDrawerList;
    private DrawerLayout mDrawerLayout;
    private ActionBarDrawerToggle mDrawerToggle;

    private ActionBar actionBar;
    private HymnBookCollection hymnBookCollection;
    private Theme theme = Theme.LIGHT;
    private SharedPreferences sharedPreferences;
    private boolean preferenceChanged = true;
    private HymnDrawer hymnDrawer;
    private static HymnSwitcher hymnSwitcher;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        NetworkCache.LoadHymnTunes(this);
        Log.d(this.getClass().getName(), "start app");

        Log.d(this.getClass().getName(), "start Hymn App... Welcome to Hymns!");
        setContentView(R.layout.main_hymns_activity);

        // set default value of preferences
        PreferenceManager.setDefaultValues(this, R.xml.root_preferences, false);

        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(this);
        sharedPreferences.registerOnSharedPreferenceChangeListener(this);

        // Instantiate a ViewPager and a PagerAdapter.
        hymnBookCollection = new HymnBookCollection(this,(ViewPager) findViewById(R.id.hymn_fragment_viewpager),theme);

        Toolbar toolbar = findViewById(R.id.toolbar);
        toolbar.setTitleTextColor(Color.WHITE);
        setSupportActionBar(toolbar);
        actionBar = getSupportActionBar();
        actionBar.setDisplayShowTitleEnabled(true);
        actionBar.setDisplayHomeAsUpEnabled(true);

        mDrawerLayout = findViewById(R.id.drawer_layout);
        mDrawerList = findViewById(R.id.left_drawer);
        mDrawerLayout.setDrawerShadow(R.drawable.drawer_shadow, GravityCompat.START);
        mDrawerList.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> adapterView, View view, int position, long l) {
                selectDrawerItem(position);
            }
        });

        refreshHymnDrawer();
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
        setDisplayConfig();
        hymnSwitcher=this;
    }

    private void refreshHymnDrawer() {
        hymnDrawer = new HymnDrawer(this,
                R.layout.drawer_hymngroup_list);
        mDrawerList.setAdapter(hymnDrawer);
    }

    // Warning! this method is very crucial. Without it you will not have a hamburger icon on your
    // action bar.
    @Override
    protected void onPostCreate(Bundle savedInstanceState) {
        super.onPostCreate(savedInstanceState);
        // Sync the toggle state after onRestoreInstanceState has occurred.
        mDrawerToggle.syncState();
    }

    private void selectDrawerItem(int position) {
        Log.i(HymnsActivity.class.getSimpleName(), "Drawer Item selected: " + position);

        selectedHymnGroup = hymnDrawer.getSelectedHymnGroup(position);
        hymnBookCollection.translateTo(selectedHymnGroup);
        mDrawerLayout.closeDrawer(mDrawerList);
    }


    @Override
    public boolean onCreateOptionsMenu(final Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.main, menu);

        return true;
    }

    public boolean onOptionsItemSelected(MenuItem item) {

        boolean ret = true;
        Log.d(this.getClass().getName(), "Item selected: " + item.getItemId());

        // code for drawer:
        switch (item.getItemId()) {
            case android.R.id.home:
                toggleDrawer();
                break;
            case R.id.action_index:
                Intent intent = new Intent(getBaseContext(), SearchActivity.class);
                intent.putExtra("selectedHymnGroup", selectedHymnGroup);
                startActivityForResult(intent, SEARCH_REQUEST);
                ret = true;
                break;
            case R.id.action_settings:
                Intent settingsIntent = new Intent(getBaseContext(), SettingsActivity.class);
                startActivity(settingsIntent);
                break;
            default:
                ret = false;
                Log.w(HymnsActivity.class.getSimpleName(), "Warning!! No Item was selected!!");
        }
        return ret;
    }

    private void changeThemeColor() {
        theme = Theme.isNightModePreferred(sharedPreferences.getBoolean("nightMode", false));
        Log.i(getClass().getSimpleName(), "changeTheme: " + theme.name());
        hymnBookCollection.setTheme(theme);
        actionBar.setBackgroundDrawable(theme.getActionBarColor(selectedHymnGroup));
    }

    private void toggleDrawer() {
        if (mDrawerLayout.isDrawerOpen(mDrawerList)) {
            mDrawerLayout.closeDrawer(mDrawerList);
        } else {
            mDrawerLayout.openDrawer(mDrawerList);
        }
    }

    @Override
    // Get what the user chose from the Index of Hymns and display the Hymn
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        switch (requestCode) {
            case SEARCH_REQUEST:
                if (resultCode == RESULT_OK) {
                    try {
                        String rawData = data.getDataString().trim();
                        selectedHymnGroup = HymnGroup.getHymnGroupFromID(rawData);
                        hymnBookCollection.switchToHymnAndRememberChoice(rawData);
                    } catch (NoSuchHymnGroupException e) {
                        e.printStackTrace();
                    }
                }
                break;
        }
    }

    @Override
    public void onBackPressed() {
        Log.d(HymnsActivity.class.getSimpleName(), "onBackPressed Called");
        hymnBookCollection.goToPreviousHymn();

    }

    @Override
    public void onLyricVisible(String hymnId) {

        if (hymnId==null) hymnId=HymnGroup.DEFAULT_HYMN_NUMBER;

        try {
            selectedHymnGroup = HymnGroup.getHymnGroupFromID(hymnId);
            Log.i(getClass().getSimpleName(), "Page changed. setting title to: " + hymnId);

            actionBar.setTitle(hymnId);
            changeThemeColor();

            Log.d(getClass().getSimpleName(), "Done painting title");
        } catch (NoSuchHymnGroupException e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onSharedPreferenceChanged(SharedPreferences sharedPreferences, String key) {
        preferenceChanged=true;
    }

    @Override
    public void onResume() {
        super.onResume();
        if(preferenceChanged) {
            setDisplayConfig();
            changeThemeColor();
            refreshHymnDrawer();
            hymnBookCollection.refresh();
            preferenceChanged=false;
        }
        hymnSwitcher=this;
    }

    private void setDisplayConfig() {
        if(sharedPreferences.getBoolean("keepDisplayOn",false)) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // refresh screen when screen orientation changes
        hymnBookCollection.refresh();
    }

    @Override
    public void switchToHymn(String hymnId) {
        hymnBookCollection.switchToHymn(hymnId);
    }

    public static HymnSwitcher getHymnSwitcher() {
        return hymnSwitcher;
    }
}

