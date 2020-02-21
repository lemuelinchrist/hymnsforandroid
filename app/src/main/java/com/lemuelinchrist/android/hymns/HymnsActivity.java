package com.lemuelinchrist.android.hymns;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.preference.PreferenceManager;
import android.util.Log;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ListView;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.ActionBarDrawerToggle;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.view.GravityCompat;
import androidx.drawerlayout.widget.DrawerLayout;
import androidx.viewpager.widget.ViewPager;
import com.lemuelinchrist.android.hymns.search.SearchActivity;
import com.lemuelinchrist.android.hymns.settings.SettingsActivity;
import com.lemuelinchrist.android.hymns.style.Theme;


/**
 * Created by lemuelcantos on 17/7/13.
 */
public class HymnsActivity extends AppCompatActivity implements OnLyricVisibleListener,
        SharedPreferences.OnSharedPreferenceChangeListener {
    protected final int SEARCH_REQUEST = 1;
    protected HymnGroup selectedHymnGroup = HymnGroup.E;
    private ListView mDrawerList;
    private DrawerLayout mDrawerLayout;
    private ActionBarDrawerToggle mDrawerToggle;

    private ActionBar actionBar;
    private MenuItem faveMenuItem;
    private HymnBookCollection hymnBookCollection;
    private Theme theme = Theme.LIGHT;
    private SharedPreferences sharedPreferences;

    private boolean isMusicPlaying = false;
    private boolean preferenceChanged = true;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d(this.getClass().getName(), "start app");

        Log.d(this.getClass().getName(), "start Hymn App... Welcome to Hymns!");
        setContentView(R.layout.main_hymns_activity);
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

        selectedHymnGroup = HymnGroup.values()[position];

        if (selectedHymnGroup == null) {
            Log.w(HymnsActivity.class.getSimpleName(), "warning: selected Hymn group currently not supported. Switching to default group: E");
            selectedHymnGroup = HymnGroup.E;
        }

        hymnBookCollection.translateTo(selectedHymnGroup);
        mDrawerLayout.closeDrawer(mDrawerList);

    }


    @Override
    public boolean onCreateOptionsMenu(final Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.main, menu);

        faveMenuItem = menu.findItem(R.id.action_fave);
        refreshFaveIcon();

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

            case R.id.action_fave:
                hymnBookCollection.toggleFave();
                refreshFaveIcon();
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

    private void refreshFaveIcon() {
        if(faveMenuItem==null) return;
        if (hymnBookCollection.currentHymnIsFaved()) {
            faveMenuItem.setIcon(R.drawable.ic_favorite_white_48dp);
            faveMenuItem.setTitle(getString(R.string.unfaveHymn));
        } else {
            faveMenuItem.setIcon(R.drawable.ic_favorite_outline_white_48dp);
            faveMenuItem.setTitle(getString(R.string.faveHymn));
        }
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

        if (hymnId==null) hymnId="E1";

        try {
            selectedHymnGroup = HymnGroup.getHymnGroupFromID(hymnId);
            Log.i(getClass().getSimpleName(), "Page changed. setting title to: " + hymnId);

            actionBar.setTitle(hymnId);
            changeThemeColor();
            refreshFaveIcon();

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
            changeThemeColor();
            hymnBookCollection.refresh();
            preferenceChanged=false;
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // refresh screen when screen orientation changes
        hymnBookCollection.refresh();
    }
}

