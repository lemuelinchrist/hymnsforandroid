package com.lemuelinchrist.android.hymns.search;

import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.support.v4.view.MenuItemCompat;
import android.support.v7.app.ActionBar;
import android.support.v7.app.ActionBarActivity;
import android.support.v7.widget.SearchView;
import android.util.Log;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.AdapterView;
import android.widget.ListView;


import com.lemuelinchrist.android.hymns.HymnGroups;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;

public class IndexActivity extends ActionBarActivity {
    private HymnsDao dao;
    private ListView listView;
    private String selectedHymnGroup;
    private ActionBar actionBar;

    /**
     * Called when the activity is first created.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.index_activity);
        listView = (ListView) findViewById(R.id.indexView);
        listView = new ListView(this);
        setContentView(listView);

        getListView().setFastScrollEnabled(true);


        // get selected hymn group
        Bundle extras = getIntent().getExtras();
        selectedHymnGroup = extras.getString("selectedHymnGroup");
        setTitle(HymnGroups.valueOf(selectedHymnGroup).getSimpleName() + " Index");


        dao = new HymnsDao(getBaseContext());
        dao.open();


        listView.setAdapter(new HymnCursorAdapter(this,
                dao.getAllHymnsOfSameLanguage(selectedHymnGroup), R.layout.index_list_content));

        listView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> adapterView, View view, int i, long l) {
                onListItemClick((ListView) adapterView, view, i, l);
            }
        });

        actionBar = getSupportActionBar();
        actionBar.setDisplayShowHomeEnabled(false);
        actionBar.setDisplayShowTitleEnabled(true);
        actionBar.setDisplayHomeAsUpEnabled(true);
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        switch (item.getItemId()) {
            case android.R.id.home:
                setResult(RESULT_CANCELED, null);
                finish();
            default:
                return super.onOptionsItemSelected(item);
        }
    }


    @Override
    public boolean onCreateOptionsMenu(final Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.index_menu, menu);

        MenuItem item = menu.findItem(R.id.index_search);
        final SearchView searchView = (SearchView) MenuItemCompat.getActionView(item);
        searchView.setOnQueryTextListener(new SearchView.OnQueryTextListener() {
            @Override
            public boolean onQueryTextSubmit(String filter) {
                Log.d(this.getClass().getSimpleName(), "Submitted text in the index search");
                filterList(filter);
                // hide soft keyboard
                InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                imm.hideSoftInputFromWindow(searchView.getWindowToken(), 0);

                return true;
            }

            @Override
            public boolean onQueryTextChange(String filter) {
                filterList(filter);
                return true;
            }
        });

        return true;
    }

    private void filterList(String filter) {
        listView.setAdapter(new HymnCursorAdapter(this,
                dao.getFilteredHymns(selectedHymnGroup, filter)
                , R.layout.index_list_content));
    }


    public void onListItemClick(ListView parent, View v, int position, long id) {
        Cursor cursor = (Cursor) getListView().getItemAtPosition(position);

        Intent data = new Intent();
        String hymnNo = dao.getHymnNoFromCursor(cursor);
        data.setData(Uri.parse(hymnNo));
        setResult(RESULT_OK, data);
        finish();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        dao.close();
    }


    public ListView getListView() {

        return listView;
    }


}



