package com.lemuelinchrist.android.hymns.search;

import com.lemuelinchrist.android.hymns.R;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.Toast;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.SearchView;
import androidx.appcompat.widget.Toolbar;
import androidx.core.graphics.Insets;
import androidx.core.view.MenuItemCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.fragment.app.FragmentPagerAdapter;
import androidx.viewpager.widget.ViewPager;
import com.google.android.material.tabs.TabLayout;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.search.fragments.*;

public class SearchActivity extends AppCompatActivity  {

    public static final String ENTER_HYMN_NO = "Enter Hymn No.            ";
    public static final String ENTER_LYRIC = "Enter Search Text          ";
    private HymnGroup selectedHymnGroup;
    private ActionBar actionBar;
    private SearchTabsPagerAdapter mSearchTabsPagerAdapter;
    private ViewPager mViewPager;
    private SearchView searchBar;
//    private MenuItem keyboardToggleButton;


    /**
     * Called when the activity is first created.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.search_activity);

        Toolbar tabBar = (Toolbar) findViewById(R.id.toolbar);
        setSupportActionBar(tabBar);

        // Apply window insets for edge-to-edge display on Android 15+
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.viewpager), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());

            // Bottom padding for the ViewPager is removed to prevent sliding artifacts.
            // Side padding is kept for safe area.
            v.setPadding(systemBars.left, 0, systemBars.right, 0);

            return insets;
        });

        ViewCompat.setOnApplyWindowInsetsListener(tabBar, (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());

            // Top padding for the Toolbar so it stays below status bar icons
            v.setPadding(0, systemBars.top, 0, 0);

            return insets;
        });

        // get selected hymn group
        Bundle extras = getIntent().getExtras();
        selectedHymnGroup = (HymnGroup) extras.get("selectedHymnGroup");
        setTitle(selectedHymnGroup.getSimpleName() + " Index");


        actionBar = getSupportActionBar();
        actionBar.setDisplayShowHomeEnabled(false);
        actionBar.setDisplayShowTitleEnabled(false);
        actionBar.setDisplayHomeAsUpEnabled(true);

        mSearchTabsPagerAdapter = new SearchTabsPagerAdapter(getSupportFragmentManager());

        mViewPager = findViewById(R.id.viewpager);
        mViewPager.setAdapter(mSearchTabsPagerAdapter);

        TabLayout tabLayout = (TabLayout) findViewById(R.id.tabs);
        tabLayout.setupWithViewPager(mViewPager);
        // Set Icons
        for(int position = 0; position < mSearchTabsPagerAdapter.getCount(); position++) {
            tabLayout.getTabAt(position).setIcon(mSearchTabsPagerAdapter.getTab(position).getIcon());

        }


        mViewPager.addOnPageChangeListener(new ViewPager.SimpleOnPageChangeListener() {
            @Override
            public void onPageSelected(int position) {

                Log.d(this.getClass().getName(), "Page position changed. new position is: " + position);

                // clear focus when history tab is selected because history has no search
                // the options menu (with the search bar) may not have been created yet
                if (searchBar == null) return;

                TabFragment currentTabFragment = mSearchTabsPagerAdapter.getTab(position);
                if ((currentTabFragment instanceof HistoryTabFragment)) {
                    Log.d(this.getClass().getName(), "position is HistoryTabFragment. clear focus of search bar");
                    // it's the only way to defocus the search bar
                    searchBar.setFocusable(false);
                    searchBar.setFocusable(true);
                    searchBar.setFocusableInTouchMode(true);
                    hideKeyboard();
                    return;
                }

                searchBar.setInputType(currentTabFragment.getInputType());

                Log.d(this.getClass().getName(), "trying to clear text. Hope it wont throw error.");
                searchBar.setQuery(currentTabFragment.getSavedQuery(), false);

            }
        });


        TabFragment.setSelectedHymnGroup(selectedHymnGroup);

    }


    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        if (id == android.R.id.home) {
            setResult(RESULT_CANCELED, null);
            finish();
        } else if (id == R.id.searchHymns) {
            // do nothing
        } else {
            return super.onOptionsItemSelected(item);
        }
        return super.onOptionsItemSelected(item);
    }


    @Override
    public boolean onCreateOptionsMenu(final Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.search_menu, menu);

        /** Get the action view of the menu item whose id is search */
        MenuItem item = menu.findItem(R.id.searchHymns);

//        keyboardToggleButton = menu.findItem(R.id.index_keyboard_toggle);

        /** Get the edit text from the action view */
        searchBar = (SearchView) MenuItemCompat.getActionView(item);
        searchBar.setQueryHint(ENTER_LYRIC);
        // the restored tab may not be Hymn Numbers, so ask it for its keyboard
        searchBar.setInputType(getCurrentTab().getInputType());
        searchBar.onActionViewExpanded();

        /** Setting an action listener */
        searchBar.setOnQueryTextListener(new SearchView.OnQueryTextListener() {
            @Override
            public boolean onQueryTextSubmit(String query) {
                Log.d(this.getClass().getSimpleName(), "Submitted text in the index search");

                if (searchBar.getInputType()==InputType.TYPE_CLASS_PHONE) {
                    createIntentAndExit(selectedHymnGroup+query);
                }

                filterListAndSaveQuery( query);
                hideKeyboard();
                return true;
            }

            @Override
            public boolean onQueryTextChange(String newText) {
                // dont do anything if text is empty, otherwise android will throw weird exceptions.
                if (newText.isEmpty()) return false;

                filterListAndSaveQuery(newText);
                return true;
            }
        });


        searchBar.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean hasFocus) {
                if (hasFocus && !getCurrentTab().canBeSearched()) {
                    // switch to FirstLine Tab
                    try {
                        mViewPager.setCurrentItem(mSearchTabsPagerAdapter.getPositionOf(FirstLineTabFragment.class));
                    }catch(Exception e) {
                        Log.d(this.getClass().getName(),"Exception caught!");
                    }

                }
            }
        });



        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE| WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);
        searchBar.clearFocus();
        searchBar.requestFocus();
        showKeyboard();


        return true;
    }

    public void createIntentAndExit(String hymnId) {
        Intent data = new Intent();
        data.setData(Uri.parse(hymnId));

        setResult(RESULT_OK, data);
        finish();
    }

    private void showKeyboard() {
        // show keyboard
        Log.d(this.getClass().getName(), "Showing Keyboard");
        InputMethodManager imm = (InputMethodManager)
                getSystemService(Context.INPUT_METHOD_SERVICE);
        imm.showSoftInput(searchBar, InputMethodManager.SHOW_IMPLICIT);
//        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
    }

    private void hideKeyboard() {
        // hide soft keyboard
        Log.d(this.getClass().getName(), "Hiding Keyboard");
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        imm.hideSoftInputFromWindow(searchBar.getWindowToken(), 0);
    }

    @Override
    public void onPause() {
        hideKeyboard();
        super.onPause();

    }

    private TabFragment getCurrentTab() {
        return mSearchTabsPagerAdapter.getTab(mViewPager.getCurrentItem());
    }

    private void filterListAndSaveQuery(String query) {
        TabFragment currentTabFragment = getCurrentTab();
        currentTabFragment.setSavedQuery(query);
        // the list only exists once the tab's view has been created
        if (currentTabFragment.getView() != null) currentTabFragment.setSearchFilter(query);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        getCurrentTab().cleanUp();
    }



    /**
     * A {@link FragmentPagerAdapter} that returns a fragment corresponding to one of the primary
     * sections of the app.
     */
    public static class SearchTabsPagerAdapter extends FragmentPagerAdapter {
        // indexed by position (getSearchTabIndex)
        private final TabFragment[] tabs = new TabFragment[8];

        public SearchTabsPagerAdapter(FragmentManager fm) {
            super(fm);

            for (TabFragment tab : new TabFragment[]{new HymnNumberTabFragment(), new FirstLineTabFragment(),
                    new FavoritesTabFragment(), new CategoryTabFragment(), new AuthorTabFragment(),
                    new LyricsTabFragment(), new HistoryTabFragment(), new MusicKeyTabFragment()}) {
                tabs[tab.getSearchTabIndex()] = tab;
            }
        }

        // When Android recreates the activity (dark mode switch, font size change, app restored after being
        // killed...), it restores the tabs that were shown before and doesn't call getItem() for them. Keep the
        // tab actually shown, otherwise searching would go to a tab that has no view.
        @Override
        public Object instantiateItem(ViewGroup container, int position) {
            TabFragment tab = (TabFragment) super.instantiateItem(container, position);
            tabs[position] = tab;
            return tab;
        }

        public TabFragment getTab(int position) {
            return tabs[position];
        }

        public int getPositionOf(Class<? extends TabFragment> tabClass) {
            for (int position = 0; position < tabs.length; position++) {
                if (tabClass.isInstance(tabs[position])) return position;
            }
            return 0;
        }

        @Override
        public Fragment getItem(int position) {
            return tabs[position];
        }

        @Override
        public int getCount() {

            return tabs.length;
        }

        @Override
        public CharSequence getPageTitle(int position) {
            return tabs[position].getTabName();
        }



    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        Log.i(this.getClass().getName(), "config changed!!!");

        // Checks whether a hardware keyboard is available
        if (newConfig.keyboardHidden == Configuration.KEYBOARDHIDDEN_NO) {
            Toast.makeText(this, "keyboard visible", Toast.LENGTH_SHORT).show();
        } else if (newConfig.keyboardHidden == Configuration.KEYBOARDHIDDEN_YES) {
            Toast.makeText(this, "keyboard hidden", Toast.LENGTH_SHORT).show();
        }
    }

}



