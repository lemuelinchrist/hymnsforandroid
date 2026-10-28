package com.lemuelinchrist.android.hymns.dao;

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

    public static enum HymnFields {
        _id, hymn_group, first_stanza_line, first_chorus_line, main_category, sub_category, meter, author,
        composer, time, key, tune, no, parent_hymn, verse, related
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

    // the first stanza and chorus lines of one book, alphabetically (the Search tab's First Lines list)
    public Cursor getFirstLinesOf(HymnGroup hymnGroup) {
        String fromClause = "(select first_stanza_line as stanza_chorus, no, _id, hymn_group from hymns where stanza_chorus NOT NULL and stanza_chorus != '' \n" +
                "union\n" +
                "select first_chorus_line as stanza_chorus, no, _id, hymn_group from hymns where stanza_chorus NOT NULL and stanza_chorus != '' ) ";

        String orderBy = sortKey("stanza_chorus");

        String sql = QueryBuilder.newInstance(context, fromClause)
                .showOnlyOneHymnGroup(hymnGroup.name())
                .orderBy(orderBy)
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

    // sorts a line or a name by its first letter: leading spaces and quote marks don't count
    private static String sortKey(String column) {
        return "lower(trim(" + column + ", ' \"''\u201c\u201d\u2018\u2019\u00ab\u00bb\u201e\u00bf\u00a1'))";
    }

    // the hymns as their pages show them: a column a hymn leaves empty comes from its parent, grandparent... (see get)
    static final String HYMNS_WITH_PARENTS = hymnsWithParents(4);

    private static String hymnsWithParents(int generations) {
        StringBuilder sql = new StringBuilder("(select h._id, h.hymn_group, h.no, h.first_stanza_line,"
                + " h.first_chorus_line");
        for (String column : new String[]{"author", "composer", "key", "tune", "main_category"}) {
            sql.append(", coalesce(nullif(h.").append(column).append(", '')");
            for (int g = 1; g <= generations; g++) {
                sql.append(", nullif(p").append(g).append(".").append(column).append(", '')");
            }
            sql.append(") as ").append(column);
        }
        // the sub-category comes with the subject it belongs to
        sql.append(", case when nullif(h.main_category, '') is not null then h.sub_category");
        for (int g = 1; g <= generations; g++) {
            String p = "p" + g;
            sql.append(" when nullif(").append(p).append(".main_category, '') is not null then ").append(p)
                    .append(".sub_category");
        }
        sql.append(" end as sub_category from hymns h");
        for (int g = 1; g <= generations; g++) {
            String child = g == 1 ? "h" : "p" + (g - 1);
            sql.append(" left join hymns p").append(g).append(" on p").append(g).append("._id = ").append(child)
                    .append(".parent_hymn");
        }
        return sql.append(") ").toString();
    }

    // the hymns of one book that have an author or composer, by name (the Search tab's Authors list)
    public Cursor getAuthorsOf(HymnGroup hymnGroup) {
        String sql = QueryBuilder.newInstance(context, HYMNS_WITH_PARENTS)
                .showOnlyOneHymnGroup(hymnGroup.name())
                .addCondition("(ifnull(author, '') != '' OR ifnull(composer, '') != '')")
                // by the name shown: hymns with no author are listed as "Unknown", by composer
                .orderBy("ifnull(nullif(" + sortKey("author") + ", ''), 'unknown') COLLATE LOCALIZED, "
                        + sortKey("composer"))
                .build();
        return database.rawQuery(sql, null);
    }

    // the hymns of one book that have a key or tune, by tune (the Search tab's Tunes list)
    public Cursor getTunesOf(HymnGroup hymnGroup) {
        String sql = QueryBuilder.newInstance(context, HYMNS_WITH_PARENTS)
                .excludeNullOnColumn("key")
                .excludeNullOnColumn("tune")
                .showOnlyOneHymnGroup(hymnGroup.name())
                .orderBy("tune")
                .build();
        return database.rawQuery(sql, null);
    }

    // the hymns of one book that have a subject (the Search tab's Subjects list)
    public Cursor getSubjectsOf(HymnGroup hymnGroup) {
        String sql = QueryBuilder.newInstance(context, HYMNS_WITH_PARENTS)
                .excludeNullOnColumn("main_category")
                .showOnlyOneHymnGroup(hymnGroup.name())
                .build();
        return database.rawQuery(sql, null);
    }

    private Cursor getByKeyOrTune(String filter) {
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

    public ArrayList<String> getYoutubeLinksFromHymnNo(String tune) {
        ArrayList<String> links = new ArrayList<>();
        try {
            Cursor cursor = database.rawQuery("select * from tune where _id = ?", new String[]{tune});
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
                } else {
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

            cursor = database.rawQuery("select * from hymns where _id = ?", new String[]{hymnId});

            cursor.moveToNext();
            Hymn hymn = getHymn(cursor);

            cursor.close();

            // GET stanzas
            cursor = database.rawQuery("select * from stanza where parent_hymn = ? order by n_order",
                    new String[]{hymnId});
            Log.d(HymnsDao.class.getSimpleName(), "Stanza Retrieved from DB. No of stanzas: " + cursor.getCount());
            ArrayList<Stanza> stanzas = new ArrayList<Stanza>();
            while (cursor.moveToNext()) {

                Stanza stanza = new Stanza();
                stanza.setNo(cursor.getString(cursor.getColumnIndex(StanzaFields.no.toString())));
                stanza.setText(cursor.getString(cursor.getColumnIndex(StanzaFields.text.toString())));
                stanza.setNote(cursor.getString(cursor.getColumnIndex(StanzaFields.note.toString())));
                stanza.setParentHymn(cursor.getString(cursor.getColumnIndex(StanzaFields.parent_hymn.toString())));
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
        hymn.setVerse(cursor.getString(cursor.getColumnIndex(HymnFields.verse.toString())));
        hymn.addRelated(cursor.getString(cursor.getColumnIndex(HymnFields.related.toString())));

        if (hymn.getTune() != null) hymn.setTune(hymn.getTune().trim());
        return hymn;
    }
}