package com.lemuelinchrist.android.hymns.dao;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.SQLException;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.entities.Stanza;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by lemuelcantos on 24/7/13.
 */
public class HymnsDao {
    private final Context context;

    public String getHymnNoFromCursor(Cursor cursor) {
        return cursor.getString(cursor.getColumnIndex("_id"));
    }

    public static enum HymnFields {
        _id, hymn_group, first_stanza_line, first_chorus_line, main_category, sub_category, meter, author,
        composer, time, key, tune, no, parent_hymn, sheet_music_link, verse, related
    }

    public static enum StanzaFields {
        parent_hymn, no, text, note, ID
    }

    private SQLiteDatabase database;
    private HymnsSqliteHelper dbHelper;

    public HymnsDao(Context context) {
        this.context = context;
        dbHelper = HymnsSqliteHelper.getInstance(context);
    }

    public void open() throws SQLException {
        database = dbHelper.getWritableDatabase();
    }

    public void close() {
        dbHelper.close();
    }

    public void save(Hymn hymn) {
        Log.i(HymnsDao.class.getSimpleName(), "Saving hymn to database: " + hymn.getHymnId());
        ContentValues values = new ContentValues();
        values.put(HymnFields._id.toString(), hymn.getHymnId());
        values.put(HymnFields.hymn_group.toString(), hymn.getGroup());
        values.put(HymnFields.first_stanza_line.toString(), hymn.getFirstStanzaLine());
        values.put(HymnFields.first_chorus_line.toString(), hymn.getFirstChorusLine());
        values.put(HymnFields.main_category.toString(), hymn.getMainCategory());
        values.put(HymnFields.sub_category.toString(), hymn.getSubCategory());
        values.put(HymnFields.meter.toString(), hymn.getMeter());
        values.put(HymnFields.author.toString(), hymn.getAuthor());
        values.put(HymnFields.composer.toString(), hymn.getComposer());
        values.put(HymnFields.time.toString(), hymn.getTime());
        values.put(HymnFields.key.toString(), hymn.getKey());
        values.put(HymnFields.tune.toString(), hymn.getTune());
        values.put(HymnFields.no.toString(), hymn.getNo());
        database.insert("hymns", null, values);

        for (Stanza stanza : hymn.getStanzas()) {
            values = new ContentValues();
            values.put(StanzaFields.parent_hymn.toString(), hymn.getHymnId());
            values.put(StanzaFields.no.toString(), stanza.getNo());
            values.put(StanzaFields.text.toString(), stanza.getText());
            values.put(StanzaFields.note.toString(), stanza.getNote());
            database.insert("stanza", null, values);
        }

        Log.d(HymnsDao.class.getSimpleName(), "Save Complete!");
    }

    public Cursor getAllHymnsOfSameLanguage(HymnGroup hymnGroup) {

        Cursor result = getByFirstLine(hymnGroup, null);

        Log.d(this.getClass().getName(), "Is cursor null? - " + result.toString());
        return result;
    }

    public Cursor getByFirstLine(HymnGroup hymnGroup, String filter) {
        String fromClause = "(select first_stanza_line as stanza_chorus, no, _id, hymn_group from hymns where stanza_chorus NOT NULL and stanza_chorus != '' \n" +
                "union\n" +
                "select first_chorus_line as stanza_chorus, no, _id, hymn_group from hymns where stanza_chorus NOT NULL and stanza_chorus != '' ) ";

        String orderBy = " lower(trim(trim(stanza_chorus,'\"'),\"'\")) ";

        QueryBuilder builder = QueryBuilder.newInstance(context, fromClause)
                .orderBy(orderBy);
        if (filter == null || filter.trim().isEmpty()) {
            builder.showOnlyOneHymnGroup(hymnGroup.name());
        } else {
            builder.excludeDisabledHymnGroups()
                    .addFilter("stanza_chorus", filter);
        }

        return database.rawQuery(builder.build(), null);
    }

    public Cursor getByLyricText(String filter) {
        String sql = QueryBuilder.newInstance(context, "stanza")
                .addFilter("text", filter)
                .build();
        return database.rawQuery(sql, null);
    }

    public Cursor getByHymnNo(HymnGroup hymnGroup, String filter) {
        QueryBuilder builder = QueryBuilder.newInstance(context, "hymns");
        if (filter == null || filter.trim().isEmpty()) {
            builder.showOnlyOneHymnGroup(hymnGroup.name())
                    .orderBy("CAST(no as decimal)");
        } else {
            builder.excludeDisabledHymnGroups()
                    .addFilter("no", filter)
                    .orderByHymnGroup(hymnGroup.toString());
        }
        return database.rawQuery(builder.build(), null);
    }

    public ArrayList<String> getArrayByHymnNo(HymnGroup hymnGroup) {
        Cursor cursor = getByHymnNo(hymnGroup, null);
        ArrayList<String> hymnArray = new ArrayList<>();
        while (cursor.moveToNext()) {
            hymnArray.add(cursor.getString(cursor.getColumnIndex(HymnFields.no.toString())).trim());
        }
        return hymnArray;
    }

    public Cursor getByAuthorsOrComposers(String filter) {
        String sql = QueryBuilder.newInstance(context, "hymns")
                .excludeDisabledHymnGroups()
                .addFilter("author", filter)
                .addFilter("composer", filter)
                .build();
        return database.rawQuery(sql, null);
    }

    public Cursor getByKeyOrTune(String filter) {
        String sql = QueryBuilder.newInstance(context, "hymns")
                .excludeNullOnColumn("key")
                .excludeNullOnColumn("tune")
                .excludeDisabledHymnGroups()
                .addFilter("first_stanza_line", filter)
                .addStricterFilter("key", filter)
                .addStricterFilter("tune", filter)
                .orderBy("tune")
                .build();
        return database.rawQuery(sql, null);
    }

    public Cursor getByCategory(HymnGroup hymnGroup, String filter) {
        String sql = QueryBuilder.newInstance(context, "hymns")
                .excludeNullOnColumn("main_category")
                .excludeDisabledHymnGroups()
                .addFilter("main_category", filter)
                .addFilter("sub_category", filter)
                .build();
        return database.rawQuery(sql, null);
    }

    public ArrayList<String> getYoutubeLinksFromHymnNo(String tune) {
        ArrayList<String> links = new ArrayList<>();
        try {
            Cursor cursor = database.rawQuery("select * from tune where _id='" + tune + "'", null);
            while (cursor.moveToNext()) {
                links.add(cursor.getString(cursor.getColumnIndex("youtube_link")) + "|" + cursor.getString(cursor.getColumnIndex("comment")));
            }
            return links;
        } catch (Exception e) {
            return links;
        }
    }

    public List<Hymn> getHymnsWithSimilarTune(Hymn targetHymn) {
        ArrayList<Hymn> hymns = new ArrayList<>();
        if(targetHymn.getTune()==null || targetHymn.getTune().isEmpty()) {
            return hymns;
        }
        Cursor cursor = getByKeyOrTune(targetHymn.getTune());
        while (cursor.moveToNext()) {
            String hymnId = cursor.getString(cursor.getColumnIndex("_id"));
            Hymn hymn  = get(hymnId);
            // only the current Hymn Group and non Big Hymns can be added to list
            if(!hymn.getHymnGroup().isBigHymnLanguage() || hymn.getHymnGroup().equals(targetHymn.getHymnGroup())) {
                if(!hymns.contains(hymn)) {
                    hymns.add(hymn);
                }
            } else {
                String relatedHymnId = hymn.getRelatedHymnOf(targetHymn.getHymnGroup());
                if(relatedHymnId!=null) {
                    hymn = get(relatedHymnId);
                    if(!hymns.contains(hymn)) {
                        hymns.add(hymn);
                    }
                }
            }
        }
        hymns.remove(targetHymn);
        return hymns;
    }

    public Hymn get(String hymnId) {
        if (hymnId == null) return null;
        Cursor cursor = null;
        try {
            Log.i(HymnsDao.class.getName(), "Querying Hymn:" + hymnId);

            cursor = database.rawQuery("select * from hymns where _id='" + hymnId + "'", null);

            cursor.moveToNext();
            Hymn hymn = getHymn(cursor);

            cursor.close();

            // GET stanzas
            cursor = database.rawQuery("select * from stanza where parent_hymn='" + hymnId + "' order by n_order", null);
            Log.d(HymnsDao.class.getSimpleName(), "Stanza Retrieved from DB. No of stanzas: " + cursor.getCount());
            ArrayList<Stanza> stanzas = new ArrayList<Stanza>();
            while (cursor.moveToNext()) {

                Stanza stanza = new Stanza();
                stanza.setNo(cursor.getString(cursor.getColumnIndex(StanzaFields.no.toString())));
                stanza.setText(cursor.getString(cursor.getColumnIndex(StanzaFields.text.toString())));
                stanza.setNote(cursor.getString(cursor.getColumnIndex(StanzaFields.note.toString())));
                stanza.setParentHymn(cursor.getString(cursor.getColumnIndex(StanzaFields.parent_hymn.toString())));


                Log.i(HymnsDao.class.getSimpleName(), "Done building Stanza: \n" + stanza.toString());
                stanzas.add(stanza);

            }
            hymn.setStanzas(stanzas);
            cursor.close();

            hymn.setNewTune(hymn.getHymnGroup().equals(HymnGroup.BF) && hymn.getTune() != null);
            // *** Get Parent Hymn then Merge!
            Hymn parentHymn = get(hymn.getParentHymn());
            if (parentHymn != null) {
                if (isEmpty(hymn.getAuthor()))
                    hymn.setAuthor(parentHymn.getAuthor());
                if (isEmpty(hymn.getComposer()))
                    hymn.setComposer(parentHymn.getComposer());
                if (isEmpty(hymn.getTime()))
                    hymn.setTime(parentHymn.getTime());
                if (isEmpty(hymn.getTune()))
                    hymn.setTune(parentHymn.getTune());
                if (isEmpty(hymn.getSheetMusicLink())) {
                    hymn.setSheetMusicLink(parentHymn.getSheetMusicLink());
                    hymn.setHasOwnSheetMusic(false);
                }
                if (isEmpty(hymn.getKey()))
                    hymn.setKey(parentHymn.getKey());
                if (isEmpty(hymn.getMainCategory())) {
                    hymn.setMainCategory(parentHymn.getMainCategory());
                    hymn.setSubCategory(parentHymn.getSubCategory());
                }
                if (isEmpty(hymn.getMeter()))
                    hymn.setMeter(parentHymn.getMeter());
                if (isEmpty(hymn.getVerse()))
                    hymn.setVerse(parentHymn.getVerse());
                if (hymn.getStanzas() == null || hymn.getStanzas().isEmpty())
                    hymn.setStanzas(parentHymn.getStanzas());

                // override related no matter if the child is empty or not
                hymn.addRelated(parentHymn.getRelated());

            }

            return hymn;
        } catch (Exception e) {
            Log.e(HymnsDao.class.getName(), "Error in dao.get()" + e.toString());
            e.printStackTrace();
        } finally {
            if (cursor != null)
                cursor.close();
        }
        return null;
    }

    private boolean isEmpty(String field) {
        return (field == null || field.equals(""));
    }

    private Hymn getHymn(Cursor cursor) {
        Hymn hymn = new Hymn(context);
        hymn.setHymnId(cursor.getString(cursor.getColumnIndex(HymnFields._id.toString())));
        hymn.setGroup(cursor.getString(cursor.getColumnIndex(HymnFields.hymn_group.toString())));
        hymn.setFirstStanzaLine(cursor.getString(cursor.getColumnIndex(HymnFields.first_stanza_line.toString())));
        hymn.setFirstChorusLine(cursor.getString(cursor.getColumnIndex(HymnFields.first_chorus_line.toString())));
        hymn.setMainCategory(cursor.getString(cursor.getColumnIndex(HymnFields.main_category.toString())));
        hymn.setSubCategory(cursor.getString(cursor.getColumnIndex(HymnFields.sub_category.toString())));
        hymn.setMeter(cursor.getString(cursor.getColumnIndex(HymnFields.meter.toString())));
        hymn.setAuthor(cursor.getString(cursor.getColumnIndex(HymnFields.author.toString())));
        hymn.setComposer(cursor.getString(cursor.getColumnIndex(HymnFields.composer.toString())));
        hymn.setTime(cursor.getString(cursor.getColumnIndex(HymnFields.time.toString())));
        hymn.setKey(cursor.getString(cursor.getColumnIndex(HymnFields.key.toString())));
        hymn.setTune(cursor.getString(cursor.getColumnIndex(HymnFields.tune.toString())));
        hymn.setNo(cursor.getString(cursor.getColumnIndex(HymnFields.no.toString())));
        hymn.setParentHymn(cursor.getString(cursor.getColumnIndex(HymnFields.parent_hymn.toString())));
        hymn.setSheetMusicLink(cursor.getString(cursor.getColumnIndex(HymnFields.sheet_music_link.toString())));
        hymn.setVerse(cursor.getString(cursor.getColumnIndex(HymnFields.verse.toString())));
        hymn.addRelated(cursor.getString(cursor.getColumnIndex(HymnFields.related.toString())));

        if (hymn.getTune() != null) hymn.setTune(hymn.getTune().trim());
        return hymn;
    }
}