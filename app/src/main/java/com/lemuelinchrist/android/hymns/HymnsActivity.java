package com.lemuelinchrist.android.hymns;

import com.lemuelinchrist.android.hymns.R;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.Log;
import android.view.*;
import android.widget.AdapterView;
import android.widget.ListView;
import android.widget.TextView;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.ActionBarDrawerToggle;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.view.GravityCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.activity.OnBackPressedCallback;
import com.google.android.material.appbar.AppBarLayout;
import androidx.drawerlayout.widget.DrawerLayout;
import androidx.preference.PreferenceManager;
import androidx.viewpager.widget.ViewPager;
import com.lemuelinchrist.android.hymns.content.OnLyricVisibleListener;
import com.lemuelinchrist.android.hymns.content.OtherLanguagesSection;
import com.lemuelinchrist.android.hymns.dao.SearchIndex;
import com.lemuelinchrist.android.hymns.search.SearchActivity;
import com.lemuelinchrist.android.hymns.settings.SettingsActivity;
import com.lemuelinchrist.android.hymns.style.BookColors;
import com.lemuelinchrist.android.hymns.style.Theme;


/**
 * Created by lemuelcantos on 17/7/13.
 */
public class HymnsActivity extends AppCompatActivity implements OnLyricVisibleListener, HymnSwitcher,
        SharedPreferences.OnSharedPreferenceChangeListener {
    protected final int SEARCH_REQUEST = 1;
    protected HymnGroup selectedHymnGroup = HymnGroup.getDefaultHymnGroup();
    private View mDrawer;
    private ListView mDrawerList;
    private DrawerLayout mDrawerLayout;
    private ActionBarDrawerToggle mDrawerToggle;

    private ActionBar actionBar;
    private HymnBookCollection hymnBookCollection;
    private TextView backToHymn;
    private String backToHymnId;
    // Black was chosen when this screen was made: Dark and Black share the night mode, so a change between them
    // needs the screen made again by hand
    private boolean black;
    private SharedPreferences sharedPreferences;
    private boolean preferenceChanged = true;
    private HymnDrawer hymnDrawer;
    private static HymnSwitcher hymnSwitcher;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        black = Theme.isBlack(this);
        Theme.applyOverlay(this);
        Log.d(this.getClass().getName(), "start app");

        Log.d(this.getClass().getName(), "start Hymn App... Welcome to Hymns!");
        setContentView(R.layout.main_hymns_activity);
        // the Search tab's table is built in the background once after each update (SearchIndex)
        SearchIndex.prepare(this, null);

        // set up Toolbar and Action Bar first so they are available for other components
        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        actionBar = getSupportActionBar();
        actionBar.setDisplayShowTitleEnabled(true);
        actionBar.setDisplayHomeAsUpEnabled(true);

        // Apply window insets for edge-to-edge display on Android 15+
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root_layout), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());

            // keep the back-to-hymn button above the navigation bar
            View backButton = findViewById(R.id.back_to_hymn);
            if (backButton != null) {
                ViewGroup.MarginLayoutParams margins = (ViewGroup.MarginLayoutParams) backButton.getLayoutParams();
                margins.bottomMargin = Math.round(16 * getResources().getDisplayMetrics().density) + systemBars.bottom;
                backButton.setLayoutParams(margins);
            }

            // Dynamically set the height of the status bar scrim
            View statusScrim = findViewById(R.id.status_bar_scrim);
            if (statusScrim != null) {
                ViewGroup.LayoutParams params = statusScrim.getLayoutParams();
                params.height = systemBars.top;
                statusScrim.setLayoutParams(params);
            }
            
            // Apply padding to the DrawerLayout (the child) to keep content safe from side cutouts
            View drawerLayout = findViewById(R.id.drawer_layout);
            drawerLayout.setPadding(systemBars.left, 0, systemBars.right, 0);

            return insets;
        });

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.toolbar), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());

            // Top padding for the Toolbar so it stays below status bar icons
            // When height is wrap_content, this will increase the total height of the toolbar
            v.setPadding(0, systemBars.top, 0, 0);

            return insets;
        });

        // set default value of preferences
        PreferenceManager.setDefaultValues(this, R.xml.root_preferences, false);

        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(this);
        sharedPreferences.registerOnSharedPreferenceChangeListener(this);

        // Instantiate a ViewPager and a PagerAdapter.
        hymnBookCollection = new HymnBookCollection(this,(ViewPager) findViewById(R.id.hymn_fragment_viewpager));

        mDrawerLayout = findViewById(R.id.drawer_layout);
        backToHymn = findViewById(R.id.back_to_hymn);
        backToHymn.setOnClickListener(v -> {
            if (backToHymnId != null) hymnBookCollection.switchToRelatedHymn(backToHymnId);
        });

        // Back: close the drawer, else return to the previous hymn, else leave the app
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (mDrawerLayout.isDrawerOpen(mDrawer)) {
                    mDrawerLayout.closeDrawer(mDrawer);
                } else if (!hymnBookCollection.goToPreviousHymn()) {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
        mDrawer = findViewById(R.id.left_drawer);
        mDrawerList = findViewById(R.id.drawer_list);

        // Apply window insets to the Navigation Drawer to handle status bar and nav bar overlap
        ViewCompat.setOnApplyWindowInsetsListener(mDrawer, (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(0, systemBars.top, 0, systemBars.bottom);
            return insets;
        });

        mDrawerLayout.setDrawerShadow(R.drawable.drawer_shadow, GravityCompat.START);
        mDrawerList.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> adapterView, View view, int position, long l) {
                selectDrawerItem(position);
            }
        });
        // the Languages (Hymn Books) setting, to hide books someone never uses
        findViewById(R.id.drawer_hymn_books).setOnClickListener(v -> {
            mDrawerLayout.closeDrawer(mDrawer);
            Intent settings = new Intent(getBaseContext(), SettingsActivity.class);
            settings.putExtra(SettingsActivity.OPEN_HYMN_BOOKS, true);
            startActivity(settings);
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

            // Recent and the highlight follow the hymn being read: made again whenever the drawer starts to open
            @Override
            public void onDrawerStateChanged(int newState) {
                super.onDrawerStateChanged(newState);
                if (newState != DrawerLayout.STATE_IDLE && !mDrawerLayout.isDrawerOpen(mDrawer)) refreshHymnDrawer();
            }
        };
        mDrawerLayout.setDrawerListener(mDrawerToggle);
        setDisplayConfig();
        hymnSwitcher=this;
    }

    /**
     * The round button on the lower right, after a switch to a related hymn: labelled with the hymn we left, in its
     * book's colour; it switches back to it.
     */
    public void showBackToHymn(String hymnId) {
        if (backToHymn == null) return;
        try {
            HymnGroup group = HymnGroup.getHymnGroupFromID(hymnId);
            GradientDrawable circle = new GradientDrawable();
            circle.setShape(GradientDrawable.OVAL);
            circle.setColor(BookColors.buttonBar(this, group));
            backToHymn.setBackground(circle);
        } catch (NoSuchHymnGroupException e) {
            return;
        }
        backToHymnId = hymnId;
        backToHymn.setText(hymnId);
        backToHymn.setContentDescription(getString(R.string.back_to_hymn, hymnId));
        backToHymn.animate().cancel();
        if (backToHymn.getVisibility() != View.VISIBLE) {
            backToHymn.setAlpha(0f);
            backToHymn.setScaleX(0.6f);
            backToHymn.setScaleY(0.6f);
            backToHymn.setVisibility(View.VISIBLE);
        }
        backToHymn.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(180).start();
    }

    public void hideBackToHymn() {
        if (backToHymn == null || backToHymn.getVisibility() != View.VISIBLE) return;
        backToHymnId = null;
        backToHymn.animate().cancel();
        backToHymn.animate().alpha(0f).scaleX(0.6f).scaleY(0.6f).setDuration(120)
                .withEndAction(() -> backToHymn.setVisibility(View.GONE)).start();
    }

    private void refreshHymnDrawer() {
        hymnDrawer = new HymnDrawer(this, selectedHymnGroup);
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

        HymnGroup chosen = hymnDrawer.getSelectedHymnGroup(position);
        if (chosen == null) return;   // a heading
        selectedHymnGroup = chosen;
        hymnBookCollection.translateTo(selectedHymnGroup);
        mDrawerLayout.closeDrawer(mDrawer);
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
        final int itemId = item.getItemId();
        if (itemId == android.R.id.home) {
            toggleDrawer();
        } else if (itemId == R.id.action_index) {
            openSearch(null, null);
            ret = true;
        } else if (itemId == R.id.action_settings) {
            Intent settingsIntent = new Intent(getBaseContext(), SettingsActivity.class);
            startActivity(settingsIntent);
        } else {
            ret = false;
            Log.w(HymnsActivity.class.getSimpleName(), "Warning!! No Item was selected!!");
        }
        return ret;
    }

    /**
     * The search screen; with words it opens on the Search tab already searching for them (all books), only in the
     * given column of the search table if there is one (until the words are changed).
     */
    public void openSearch(String words, String column) {
        Intent intent = new Intent(getBaseContext(), SearchActivity.class);
        intent.putExtra("selectedHymnGroup", selectedHymnGroup);
        if (words != null) {
            intent.putExtra(SearchActivity.EXTRA_QUERY, words);
            if (column != null) intent.putExtra(SearchActivity.EXTRA_COLUMN, column);
        }
        startActivityForResult(intent, SEARCH_REQUEST);
    }

    private void changeThemeColor() {
        actionBar.setBackgroundDrawable(new ColorDrawable(BookColors.toolbar(this, selectedHymnGroup)));
    }

    private void toggleDrawer() {
        if (mDrawerLayout.isDrawerOpen(mDrawer)) {
            mDrawerLayout.closeDrawer(mDrawer);
        } else {
            mDrawerLayout.openDrawer(mDrawer);
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
    public void onLyricVisible(String hymnId) {

        if (hymnId==null) hymnId=HymnGroup.firstHymn(this);

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
        // folding the other languages updates the pages itself; reloading the book for it on the next resume could
        // land on hymn 1 when that resume brings a hymn chosen in Search (the reload read the page before the switch)
        if (OtherLanguagesSection.FOLDED.equals(key)) return;
        preferenceChanged=true;
    }

    @Override
    public void onResume() {
        super.onResume();
        if (Theme.isBlack(this) != black) {
            recreate();
            return;
        }
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
    protected void onDestroy() {
        super.onDestroy();
        if (hymnSwitcher == this) {
            hymnSwitcher = null;
        }
    }

    @Override
    public void switchToHymn(String hymnId) {
        hymnBookCollection.switchToHymn(hymnId);
    }

    /** Slides the toolbar back into view (it hides while scrolling down). */
    public void showToolbar() {
        AppBarLayout appBar = findViewById(R.id.appbar);
        if (appBar != null) appBar.setExpanded(true, true);
    }

    /** True while the toolbar is (even partly) scrolled out of view. */
    public boolean isToolbarHidden() {
        AppBarLayout appBar = findViewById(R.id.appbar);
        return appBar != null && appBar.getTop() < 0;
    }

    @Override
    public void switchToHymnFromTop(String hymnId) {
        hymnBookCollection.switchToRelatedHymn(hymnId, false);
    }

    @Override
    public void switchToRelatedHymn(String hymnId) {
        hymnBookCollection.switchToRelatedHymn(hymnId);
    }

    public static HymnSwitcher getHymnSwitcher() {
        return hymnSwitcher;
    }
}

