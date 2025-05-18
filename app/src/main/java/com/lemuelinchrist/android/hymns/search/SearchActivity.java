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
import androidx.core.view.MenuItemCompat;
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
        for(TabFragment tab:TabFragment.COLLECTION.values()) {
            tabLayout.getTabAt(tab.getSearchTabIndex()).setIcon(tab.getIcon());

        }


        mViewPager.addOnPageChangeListener(new ViewPager.SimpleOnPageChangeListener() {
            @Override
            public void onPageSelected(int position) {

                Log.d(this.getClass().getName(), "Page position changed. new position is: " + position);

                // clear focus when history tab is selected because history has no search
                TabFragment currentTabFragment = TabFragment.COLLECTION.get(position);
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
        searchBar.setInputType(InputType.TYPE_CLASS_PHONE);
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
                if (hasFocus && !TabFragment.COLLECTION.get(mViewPager.getCurrentItem()).canBeSearched()) {
                    // switch to FirstLine Tab
                    try {
                        mViewPager.setCurrentItem(TabFragment.getInstance(FirstLineTabFragment.class).getSearchTabIndex());
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

    private void filterListAndSaveQuery(String query) {
        TabFragment currentTabFragment = TabFragment.COLLECTION.get(mViewPager.getCurrentItem());
        currentTabFragment.setSavedQuery(query);
        currentTabFragment.setSearchFilter(query);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        TabFragment.COLLECTION.get(mViewPager.getCurrentItem()).cleanUp();
    }



    /**
     * A {@link FragmentPagerAdapter} that returns a fragment corresponding to one of the primary
     * sections of the app.
     */
    public static class SearchTabsPagerAdapter extends FragmentPagerAdapter {


        public SearchTabsPagerAdapter(FragmentManager fm) {
            super(fm);

            // Instantiate all tabs. note that there's no need to keep the references to these instances because
            // TabFragment class will automatically store them in its own map (COLLECTIONS variable)
            new HymnNumberTabFragment();
            new FirstLineTabFragment();
            new FavoritesTabFragment();
            new CategoryTabFragment();
            new AuthorTabFragment();
            new LyricsTabFragment();
            new HistoryTabFragment();
            new MusicKeyTabFragment();

        }


        @Override
        public Fragment getItem(int position) {
            return TabFragment.COLLECTION.get(position);
        }

        @Override
        public int getCount() {

            return TabFragment.COLLECTION.size();
        }

        @Override
        public CharSequence getPageTitle(int position) {
            return TabFragment.COLLECTION.get(position).getTabName();
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



