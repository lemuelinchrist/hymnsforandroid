package com.lemuelinchrist.android.hymns.search;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.support.v4.app.Fragment;
import android.support.v4.app.FragmentManager;
import android.support.v4.app.FragmentPagerAdapter;
import android.support.v4.app.FragmentTransaction;
import android.support.v4.view.MenuItemCompat;
import android.support.v4.view.ViewPager;
import android.support.v7.app.ActionBar;
import android.support.v7.app.ActionBarActivity;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.Log;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.TextView;


import com.lemuelinchrist.android.hymns.HymnGroups;
import com.lemuelinchrist.android.hymns.R;

public class SearchActivity extends ActionBarActivity implements ActionBar.TabListener {

    public static final String ENTER_HYMN_NO = "Enter Hymn No.            ";
    public static final String ENTER_LYRIC =   "Enter First Line             ";
    private String selectedHymnGroup;
    private ActionBar actionBar;
    private AppSectionsPagerAdapter mAppSectionsPagerAdapter;
    private ViewPager mViewPager;
    private EditText searchBar;


    /**
     * Called when the activity is first created.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.search_activity);

        // get selected hymn group
        Bundle extras = getIntent().getExtras();
        selectedHymnGroup = extras.getString("selectedHymnGroup");
        setTitle(HymnGroups.valueOf(selectedHymnGroup).getSimpleName() + " Index");


        actionBar = getSupportActionBar();
        actionBar.setDisplayShowHomeEnabled(false);
        actionBar.setDisplayShowTitleEnabled(false);
        actionBar.setDisplayHomeAsUpEnabled(true);

        // Specify that we will be displaying tabs in the action bar.
        actionBar.setNavigationMode(android.app.ActionBar.NAVIGATION_MODE_TABS);

        mAppSectionsPagerAdapter = new AppSectionsPagerAdapter(getSupportFragmentManager());

        // Set up the ViewPager, attaching the adapter and setting up a listener for when the
        // user swipes between sections.
        mViewPager = (ViewPager) findViewById(R.id.pager);
        mViewPager.setAdapter(mAppSectionsPagerAdapter);
        mViewPager.setOnPageChangeListener(new ViewPager.SimpleOnPageChangeListener() {
            @Override
            public void onPageSelected(int position) {
                // When swiping between different app sections, select the corresponding tab.
                // We can also use ActionBar.Tab#select() to do this if we have a reference to the
                // Tab.
                actionBar.setSelectedNavigationItem(position);
            }
        });


        // For each of the sections in the app, add a tab to the action bar.
        for (int i = 0; i < mAppSectionsPagerAdapter.getCount(); i++) {
            // Create a tab with text corresponding to the page title defined by the adapter.
            // Also specify this Activity object, which implements the TabListener interface, as the
            // listener for when this tab is selected.
            actionBar.addTab(
                    actionBar.newTab()
                            .setText(mAppSectionsPagerAdapter.getPageTitle(i))
                            .setTabListener(this));
        }

        mAppSectionsPagerAdapter.hymnListFragment.setSelectedHymnGroup(selectedHymnGroup);

    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        switch (item.getItemId()) {
            case android.R.id.home:
                setResult(RESULT_CANCELED, null);
                finish();
            case R.id.searchHymns:
                break;
            case R.id.index_keyboard_toggle:
                toggleInputType(item);
                break;
            default:
                return super.onOptionsItemSelected(item);
        }
        return super.onOptionsItemSelected(item);
    }

    private void toggleInputType(MenuItem item) {
        if(searchBar.getInputType()== InputType.TYPE_CLASS_PHONE){
            searchBar.setInputType(InputType.TYPE_CLASS_TEXT);
            searchBar.setHint(ENTER_LYRIC);
            item.setIcon(R.drawable.ic_dialpad_white);
        } else {
            searchBar.setInputType(InputType.TYPE_CLASS_PHONE);
            searchBar.setHint(ENTER_HYMN_NO);
            item.setIcon(R.drawable.ic_keyboard_white);
        }
        searchBar.getText().clear();
        showKeyboard();
    }


    @Override
    public boolean onCreateOptionsMenu(final Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.index_menu, menu);

        /** Get the action view of the menu item whose id is search */
        MenuItem item = menu.findItem(R.id.searchHymns);
        View v = MenuItemCompat.getActionView(item);

        /** Get the edit text from the action view */
        searchBar = (EditText) v.findViewById(R.id.txt_search);
        searchBar.setHint(ENTER_HYMN_NO);


        /** Setting an action listener */
        searchBar.setOnEditorActionListener(new TextView.OnEditorActionListener() {

            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                Log.d(this.getClass().getSimpleName(), "Submitted text in the index search");

                if (searchBar.getInputType()==InputType.TYPE_CLASS_PHONE) {
                    Intent data = new Intent();
                    data.setData(Uri.parse(selectedHymnGroup+v.getText().toString()));
                    setResult(RESULT_OK, data);
                    finish();
                }

                filterList( v.getText().toString());
                hideKeyboard();
                return true;
            }
        });


        searchBar.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {

            }

            @Override
            public void onTextChanged(CharSequence filter, int start, int before, int count) {
                filterList(filter.toString());
                // switch to First-Line tab
                mViewPager.setCurrentItem(0);
            }

            @Override
            public void afterTextChanged(Editable s) {

            }
        });

        searchBar.requestFocus();
        showKeyboard();


        return true;
    }

    private void showKeyboard() {
        // show keyboard
        ((InputMethodManager)getSystemService(Context.INPUT_METHOD_SERVICE)).
                toggleSoftInput(InputMethodManager.SHOW_FORCED,
                        InputMethodManager.HIDE_IMPLICIT_ONLY);
    }

    private void hideKeyboard() {
        // hide soft keyboard
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        imm.hideSoftInputFromWindow(searchBar.getWindowToken(), 0);
    }

    @Override
    public void onPause() {
        hideKeyboard();
        super.onPause();

    }

    private void filterList(String filter) {
        mAppSectionsPagerAdapter.hymnListFragment.setFilter(filter);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        mAppSectionsPagerAdapter.hymnListFragment.destroyDao();
    }

    @Override
    public void onTabUnselected(ActionBar.Tab tab, FragmentTransaction fragmentTransaction) {

    }

    @Override
    public void onTabReselected(ActionBar.Tab tab, FragmentTransaction fragmentTransaction) {

    }

    @Override
    public void onTabSelected(ActionBar.Tab tab, FragmentTransaction fragmentTransaction) {
        // When the given tab is selected, switch to the corresponding page in the ViewPager.
        mViewPager.setCurrentItem(tab.getPosition());
    }


    /**
     * A {@link android.support.v4.app.FragmentPagerAdapter} that returns a fragment corresponding to one of the primary
     * sections of the app.
     */
    public static class AppSectionsPagerAdapter extends FragmentPagerAdapter {

        HymnListFragment hymnListFragment;

        public AppSectionsPagerAdapter(FragmentManager fm) {
            super(fm);
            hymnListFragment = new HymnListFragment();
        }

        @Override
        public Fragment getItem(int i) {
            switch (i) {
                case 0:
                    // The first section of the app is the most interesting -- it offers
                    // a launchpad into the other demonstrations in this example application.
                    return hymnListFragment;

                default:
                    // The other sections of the app are dummy placeholders.
                    return new HistoryListFragment();
            }
        }

        @Override
        public int getCount() {
            return 2;
        }

        @Override
        public CharSequence getPageTitle(int position) {

            switch (position) {
                case 0:
                    return "First Line Index";

                case 1:
                    return "History";
            }
            return "";
        }



    }


}



