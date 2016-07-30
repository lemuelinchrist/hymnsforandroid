package com.lemuelinchrist.android.hymns.search;

import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
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
import android.support.v7.app.AppCompatActivity;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.Log;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.TextView;


import android.widget.Toast;
import com.lemuelinchrist.android.hymns.HymnGroups;
import com.lemuelinchrist.android.hymns.R;

public class SearchActivity extends AppCompatActivity implements ActionBar.TabListener {

    public static final String ENTER_HYMN_NO = "Enter Hymn No.            ";
    public static final String ENTER_LYRIC = "Enter Search Text          ";
    private String selectedHymnGroup;
    private ActionBar actionBar;
    private SearchTabsPagerAdapter mSearchTabsPagerAdapter;
    private ViewPager mViewPager;
    private EditText searchBar;
    private MenuItem keyboardToggleButton;


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

        mSearchTabsPagerAdapter = new SearchTabsPagerAdapter(getSupportFragmentManager());


        mViewPager = (ViewPager) findViewById(R.id.pager);
        mViewPager.setAdapter(mSearchTabsPagerAdapter);
        mViewPager.addOnPageChangeListener(new ViewPager.SimpleOnPageChangeListener() {
            @Override
            public void onPageSelected(int position) {

                actionBar.setSelectedNavigationItem(position);

                Log.d(this.getClass().getName(), "Page position changed. new position is: " + position);

                // clear focus when history tab is selected because history has no search
                if ((TabFragment.COLLECTION.get(position) instanceof HistoryTabFragment)) {
                    Log.d(this.getClass().getName(), "position is not HistoryTabFragment. clear focus of search bar");
                    // it's the only way to defocus the search bar
                    searchBar.setFocusable(false);
                    searchBar.setFocusable(true);
                    searchBar.setFocusableInTouchMode(true);
                    hideKeyboard();
                    return;

                }

                // Anything other than FirstLineTabFragment does not need to use numeric keypad
                if (!(TabFragment.COLLECTION.get(position) instanceof FirstLineTabFragment)) {
                    if (searchBar.getInputType() == InputType.TYPE_CLASS_PHONE)
                        toggleInputType();

                }

                Log.d(this.getClass().getName(), "trying to clear text. Hope it wont throw error.");
                searchBar.getText().clear();


            }
        });


        // For each of the sections in the app, add a tab to the action bar.
        for (int i = 0; i < mSearchTabsPagerAdapter.getCount(); i++) {
            actionBar.addTab(
                    actionBar.newTab()
                            .setText(mSearchTabsPagerAdapter.getPageTitle(i))
                            .setTabListener(this));
        }

        TabFragment.setSelectedHymnGroup(selectedHymnGroup);

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
                toggleInputType();
                break;
            default:
                return super.onOptionsItemSelected(item);
        }
        return super.onOptionsItemSelected(item);
    }

    private void toggleInputType() {
        Log.d(this.getClass().getName(),"toggling input type");
        if(searchBar.getInputType()== InputType.TYPE_CLASS_PHONE){
            searchBar.setInputType(InputType.TYPE_CLASS_TEXT);
            searchBar.setHint(ENTER_LYRIC);
            keyboardToggleButton.setIcon(R.drawable.ic_dialpad_white);

        } else {
            searchBar.setInputType(InputType.TYPE_CLASS_PHONE);
            searchBar.setHint(ENTER_HYMN_NO);
            keyboardToggleButton.setIcon(R.drawable.ic_keyboard_white);
            //switch to FirstLine Tab because only this tab uses Phone keyboard type
            mViewPager.setCurrentItem(TabFragment.getInstance(FirstLineTabFragment.class).getSearchTabIndex());

        }

        searchBar.getText().clear();
//        showKeyboard();
    }


    @Override
    public boolean onCreateOptionsMenu(final Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.search_menu, menu);

        /** Get the action view of the menu item whose id is search */
        MenuItem item = menu.findItem(R.id.searchHymns);
        View v = MenuItemCompat.getActionView(item);

        keyboardToggleButton = menu.findItem(R.id.index_keyboard_toggle);

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

        searchBar.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean hasFocus) {
                if (hasFocus && !TabFragment.COLLECTION.get(mViewPager.getCurrentItem()).canBeSearched()) {
                    // switch to FirstLine Tab
                    mViewPager.setCurrentItem(TabFragment.getInstance(FirstLineTabFragment.class).getSearchTabIndex());

                }
            }
        });


        searchBar.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {

            }

            @Override
            public void onTextChanged(CharSequence filter, int start, int before, int count) {
                // dont do anything if text is empty, otherwise android will throw weird exceptions.
                if (filter.toString().isEmpty()) return;

                filterList(filter.toString());


            }

            @Override
            public void afterTextChanged(Editable s) {

            }
        });


        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE| WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);
        searchBar.clearFocus();
        searchBar.requestFocus();
        showKeyboard();


        return true;
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

    private void filterList(String filter) {
        TabFragment.COLLECTION.get(mViewPager.getCurrentItem()).setSearchFilter(filter);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        TabFragment.COLLECTION.get(mViewPager.getCurrentItem()).cleanUp();
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
    public static class SearchTabsPagerAdapter extends FragmentPagerAdapter {


        public SearchTabsPagerAdapter(FragmentManager fm) {
            super(fm);

            // Instantiate all tabs. note that there's no need to keep the references to these instances because
            // TabFragment class will automatically store them in its own map (COLLECTIONS variable)
            new FirstLineTabFragment();
            new CategoryTabFragment();
            new HistoryTabFragment();

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



