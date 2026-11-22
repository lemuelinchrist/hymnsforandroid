package com.lemuelinchrist.android.hymns.dao;

import android.content.Context;
import android.database.Cursor;
import android.database.SQLException;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;
import com.lemuelinchrist.android.hymns.HymnDrawer;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.entities.Recording;
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
        composer, time, key, tune, no, parent_hymn, verse, related, new_tune, title
    }

    public static enum StanzaFields {
        parent_hymn, no, text, note, ID
    }

    private SQLiteDatabase database;
    private HymnsSqliteHelper dbHelper;
    private boolean opened;

    public HymnsDao(Context context) {
        this.context = context;
        dbHelper = HymnsSqliteHelper.getInstance(context);
    }

    public void open() throws SQLException {
        if (!opened) {
            database = dbHelper.openWritable();
            opened = true;
        }
    }

    public void close() {
        if (opened) {
            opened = false;
            dbHelper.close();
        }
    }

    /** What a list shows for a first line: the line, then " (New Tune)" for a New Tune (the data has no such text). */
    public static String tagged(String line, boolean newTune) {
        return newTune && line != null && !line.trim().isEmpty() ? line + " (New Tune)" : line;
    }

    /** The first line (or any line column) of a list row, with " (New Tune)" when the row's new_tune is 1. */
    public static String line(Cursor cursor, String column) {
        int tag = cursor.getColumnIndex(HymnFields.new_tune.toString());
        return tagged(cursor.getString(cursor.getColumnIndex(column)), tag >= 0 && cursor.getInt(tag) == 1);
    }

    // the first stanza and chorus lines of one book, alphabetically (the Search tab's First Lines list)
    public Cursor getFirstLinesOf(HymnGroup hymnGroup) {
        String fromClause = "(select first_stanza_line as stanza_chorus, no, _id, hymn_group, new_tune from hymns where stanza_chorus NOT NULL and stanza_chorus != '' \n" +
                "union\n" +
                "select first_chorus_line as stanza_chorus, no, _id, hymn_group, new_tune from hymns where stanza_chorus NOT NULL and stanza_chorus != '' ) ";

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
                    .orderByNumberThenBooks(HymnDrawer.booksByRecency(context, hymnGroup));
        }
        return database.rawQuery(builder.build(), null);
    }

    public ArrayList<String> getArrayByHymnNo(HymnGroup hymnGroup) {
        ArrayList<String> hymnArray = new ArrayList<>();
        try (Cursor cursor = getByHymnNo(hymnGroup, null)) {
            int col = cursor.getColumnIndex(HymnFields.no.toString());
            while (cursor.moveToNext()) {
                hymnArray.add(cursor.getString(col).trim());
            }
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
                + " h.first_chorus_line, h.new_tune");
        for (String column : new String[]{"author", "main_category"}) {
            sql.append(", coalesce(nullif(h.").append(column).append(", '')");
            for (int g = 1; g <= generations; g++) {
                sql.append(", nullif(p").append(g).append(".").append(column).append(", '')");
            }
            sql.append(") as ").append(column);
        }
        // a New Tune of a hymn with another tune keeps its own music: no composer, key or tune from the parent
        for (String column : new String[]{"composer", "key", "tune"}) {
            sql.append(", coalesce(nullif(h.").append(column).append(", '')");
            StringBuilder crossed = new StringBuilder();
            for (int g = 1; g <= generations; g++) {
                String child = g == 1 ? "h" : "p" + (g - 1);
                String p = "p" + g;
                if (crossed.length() > 0) crossed.append(" or ");
                crossed.append("(").append(p).append("._id is not null and ifnull(").append(child)
                        .append(".new_tune, 0) = 1 and ifnull(").append(p).append(".new_tune, 0) != 1)");
                sql.append(", case when not (").append(crossed).append(") then nullif(")
                        .append(p).append(".").append(column).append(", '') end");
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

    /** The links of one kind ("piano") of a hymn, in order, from the link table: {label, url}. Not its parent's. */
    public ArrayList<String[]> getLinks(String hymnId, String kind) {
        ArrayList<String[]> links = new ArrayList<>();
        try (Cursor cursor = database.rawQuery("select label, url from link where hymn_id = ? and kind = ? order by n_order",
                new String[]{hymnId, kind})) {
            while (cursor.moveToNext()) {
                links.add(new String[]{cursor.getString(0), cursor.getString(1)});
            }
            return links;
        } catch (Exception e) {
            return links;
        }
    }

    /**
     * Sung YouTube and SoundCloud recordings of a hymn itself (not its parent's), YouTube first, in order.
     * The link table has the publisher in {@code label}, the album in {@code album} and {@code instrumental} (NULL/0 for sung).
     */
    public ArrayList<Recording> getRecordings(String hymnId) {
        ArrayList<Recording> recordings = new ArrayList<>();
        try (Cursor cursor = database.rawQuery("select kind, label, album, instrumental, url from link where hymn_id = ?"
                + " and kind in ('youtube', 'soundcloud') and ifnull(instrumental, 0) = 0 order by kind desc, n_order", new String[]{hymnId})) {
            while (cursor.moveToNext()) {
                recordings.add(new Recording(cursor.getString(0), cursor.getString(1), cursor.getString(2),
                        cursor.getInt(3) == 1, cursor.getString(4)));
            }
        } catch (Exception e) {
            // none then
        }
        return recordings;
    }

    /**
     * Universal instrumental recordings for a tune code (YouTube first, then SoundCloud, in {@code n_order}).
     * Instrumental links are keyed by trimmed tune code in {@code link.hymn_id}, shared across all languages.
     */
    public ArrayList<Recording> getInstrumentals(String tune) {
        ArrayList<Recording> instrumentals = new ArrayList<>();
        if (tune == null) return instrumentals;
        String t = tune.trim();
        if (t.isEmpty() || "0".equals(t)) return instrumentals;
        try (Cursor cursor = database.rawQuery("select kind, label, album, instrumental, url from link where hymn_id = ?"
                + " and kind in ('youtube', 'soundcloud') and instrumental = 1 order by kind desc, n_order", new String[]{t})) {
            while (cursor.moveToNext()) {
                instrumentals.add(new Recording(cursor.getString(0), cursor.getString(1), cursor.getString(2),
                        cursor.getInt(3) == 1, cursor.getString(4)));
            }
        } catch (Exception e) {
            // none then
        }
        return instrumentals;
    }

    /** The ids of the New Tunes of a hymn (the hymns that have it as parent and are marked new_tune), in number order. */
    public ArrayList<String> getNewTunes(String hymnId) {
        ArrayList<String> ids = new ArrayList<>();
        try (Cursor cursor = database.rawQuery("select _id from hymns where parent_hymn = ? and new_tune = 1 and hymn_group = 'BF'"
                + " order by cast(no as integer)", new String[]{hymnId})) {
            while (cursor.moveToNext()) ids.add(cursor.getString(0));
        } catch (Exception e) {
            // none then
        }
        return ids;
    }

    /**
     * The links of one kind of a hymn, else those of its parent (a translation shows its parent's piano videos). A New Tune
     * never takes its parent's: they play the parent's tune ({@link #startsOwnTune}).
     */
    public ArrayList<String[]> getLinksOrParent(String hymnId, String parentId, String kind) {
        ArrayList<String[]> links = getLinks(hymnId, kind);
        return links.isEmpty() && !startsOwnTune(hymnId) ? getLinks(parentId, kind) : links;
    }

    /**
     * True for a New Tune whose parent is not one (a BF New Tune of an English hymn), or a child hymn whose own tune
     * differs from its parent's tune: its tune, sheet music, piano videos and recordings never come from the parent,
     * which has another tune. A translation of a New Tune is marked new_tune too, but its parent is the New Tune, so
     * it still borrows from it.
     */
    public boolean startsOwnTune(String hymnId) {
        try (Cursor cursor = database.rawQuery(
                "select (h.new_tune = 1 and p._id is not null and ifnull(p.new_tune, 0) != 1)"
                        + " or (p._id is not null"
                        + " and trim(ifnull(h.tune, '')) not in ('', '0')"
                        + " and trim(ifnull(p.tune, '')) not in ('', '0')"
                        + " and trim(h.tune) != trim(p.tune)"
                        + " and trim(h.tune) not like trim(p.tune) || '%'"
                        + " and trim(p.tune) not like trim(h.tune) || '%')"
                        + " from hymns h left join hymns p on p._id = h.parent_hymn where h._id = ?",
                new String[]{hymnId})) {
            return cursor.moveToFirst() && cursor.getInt(0) == 1;
        } catch (Exception e) {
            return false;
        }
    }

    /** Whether two non-empty tune codes represent different melodies (ignoring prefix-length differences). */
    private static boolean tunesDiffer(String a, String b) {
        String ta = a == null ? "" : a.trim();
        String tb = b == null ? "" : b.trim();
        if (ta.isEmpty() || ta.equals("0") || tb.isEmpty() || tb.equals("0")) return false;
        return !ta.equals(tb) && !ta.startsWith(tb) && !tb.startsWith(ta);
    }

    /**
     * Finds the best existing sheet matching {@code hymn}'s own tune code (used when {@code ownTune} is true and the
     * hymn has no own sheet). Preference: Traditional Chinese twin (C/CS for Z/ZS) -> BF New Tune of the same parent
     * -> Chinese sheet for Chinese hymns, or E/BF/NS/CH/C/CS for others, breaking ties by hymn number.
     */
    private String findSheetByTune(Hymn hymn) {
        String tune = hymn.getTune();
        if (isEmpty(tune) || "0".equals(tune)) return null;
        String grp = hymn.getGroup();
        String twinId = "Z".equals(grp) ? "C" + hymn.getNo() : ("ZS".equals(grp) ? "CS" + hymn.getNo() : null);
        boolean isChinese = "C".equals(grp) || "CS".equals(grp) || "Z".equals(grp) || "ZS".equals(grp);
        String parentId = hymn.getParentHymn();
        String bestId = null;
        int bestRank = Integer.MAX_VALUE;
        int bestNo = Integer.MAX_VALUE;
        try (Cursor cursor = database.rawQuery(
                "select _id, hymn_group, no, parent_hymn from hymns where trim(tune) = ? and _id != ?",
                new String[]{tune, hymn.getHymnId()})) {
            while (cursor.moveToNext()) {
                String cid = cursor.getString(0);
                if (!hymn.hasSheetMusic(cid)) continue;
                String cgrp = cursor.getString(1);
                String cnoStr = cursor.getString(2);
                String cparent = cursor.getString(3);
                int rank;
                if (cid.equals(twinId)) {
                    rank = 0;
                } else if ("BF".equals(cgrp) && !isEmpty(parentId) && parentId.equals(cparent)) {
                    rank = 1;
                } else if (isChinese) {
                    if ("C".equals(cgrp) || "CS".equals(cgrp)) rank = 2;
                    else if ("BF".equals(cgrp)) rank = 3;
                    else if ("E".equals(cgrp)) rank = 4;
                    else if ("NS".equals(cgrp)) rank = 5;
                    else rank = 6;
                } else {
                    if ("E".equals(cgrp)) rank = 2;
                    else if ("BF".equals(cgrp)) rank = 3;
                    else if ("NS".equals(cgrp)) rank = 4;
                    else if ("CH".equals(cgrp)) rank = 5;
                    else if ("C".equals(cgrp) || "CS".equals(cgrp)) rank = 6;
                    else rank = 7;
                }
                int cno = Integer.MAX_VALUE;
                try {
                    cno = Integer.parseInt(cnoStr);
                } catch (Exception ignored) {
                }
                if (rank < bestRank || (rank == bestRank && cno < bestNo)) {
                    bestRank = rank;
                    bestNo = cno;
                    bestId = cid;
                }
            }
        } catch (Exception e) {
            Log.e(HymnsDao.class.getName(), "Error finding sheet by tune for " + hymn.getHymnId(), e);
        }
        return bestId;
    }

    /**
     * The nearest hymn above this one (its parent, the parent's parent, ...) that has sung YouTube or SoundCloud links of its
     * own, or null. A hymn with no such links of its own shows that hymn's. The search stops at a New Tune
     * ({@link #startsOwnTune}): the hymns above it sing another tune.
     */
    public String getLinkedAncestor(String parentId) {
        String id = parentId;
        for (int depth = 0; depth < 5 && id != null && !id.isEmpty(); depth++) {
            try (Cursor cursor = database.rawQuery(
                    "select 1 from link where hymn_id = ? and kind in ('youtube', 'soundcloud') and ifnull(instrumental, 0) = 0 limit 1",
                    new String[]{id})) {
                if (cursor.moveToFirst()) return id;
            }
            if (startsOwnTune(id)) return null;
            try (Cursor cursor = database.rawQuery("select parent_hymn from hymns where _id = ?", new String[]{id})) {
                id = cursor.moveToFirst() ? cursor.getString(0) : null;
            }
        }
        return null;
    }

    public List<Hymn> getHymnsWithSimilarTune(Hymn targetHymn) {
        ArrayList<Hymn> hymns = new ArrayList<>();
        if(targetHymn.getTune()==null || targetHymn.getTune().isEmpty()) {
            return hymns;
        }
        try (Cursor cursor = getByKeyOrTune(targetHymn.getTune())) {
            int idCol = cursor.getColumnIndex("_id");
            while (cursor.moveToNext()) {
                String hymnId = cursor.getString(idCol);
                Hymn hymn = get(hymnId);
                if (hymn == null) continue;
                // only the current Hymn Group and non Big Hymns can be added to list
                if(!hymn.getHymnGroup().isBigHymnLanguage() || hymn.getHymnGroup().equals(targetHymn.getHymnGroup())) {
                    if(!hymns.contains(hymn)) {
                        hymns.add(hymn);
                    }
                } else {
                    String relatedHymnId = hymn.getRelatedHymnOf(targetHymn.getHymnGroup());
                    if(relatedHymnId!=null) {
                        Hymn related = get(relatedHymnId);
                        if (related != null) hymn = related;
                    }
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
        return get(hymnId, 0);
    }

    private Hymn get(String hymnId, int depth) {
        if (hymnId == null || depth > 10) return null;
        Cursor cursor = null;
        try {
            Log.i(HymnsDao.class.getName(), "Querying Hymn:" + hymnId);

            cursor = database.rawQuery("select * from hymns where _id = ?", new String[]{hymnId});

            if (!cursor.moveToFirst()) return null;
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

            // *** Get Parent Hymn then Merge!
            Hymn parentHymn = get(hymn.getParentHymn(), depth + 1);
            if (parentHymn != null) {
                // a New Tune or translation with a different tune keeps its own music: no composer, time, tune or key from the parent
                boolean ownTune = (hymn.isNewTune() && !parentHymn.isNewTune())
                        || tunesDiffer(hymn.getTune(), parentHymn.getTune());
                hymn.setOwnTune(ownTune);
                if (!ownTune) {
                    hymn.setAncestorSheetId(parentHymn.getRootSheetId());
                } else if (!hymn.hasOwnSheetMusic()) {
                    hymn.setTuneSheetId(findSheetByTune(hymn));
                }
                if (isEmpty(hymn.getAuthor()))
                    hymn.setAuthor(parentHymn.getAuthor());
                if (!ownTune && isEmpty(hymn.getComposer()))
                    hymn.setComposer(parentHymn.getComposer());
                if (!ownTune && isEmpty(hymn.getTime()))
                    hymn.setTime(parentHymn.getTime());
                if (!ownTune && isEmpty(hymn.getTune()))
                    hymn.setTune(parentHymn.getTune());
                if (!ownTune && isEmpty(hymn.getKey()))
                    hymn.setKey(parentHymn.getKey());
                if (isEmpty(hymn.getMainCategory())) {
                    hymn.setMainCategory(parentHymn.getMainCategory());
                    hymn.setSubCategory(parentHymn.getSubCategory());
                }
                if (isEmpty(hymn.getTitle()))
                    hymn.setTitle(parentHymn.getTitle());
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
        hymn.setNewTune(cursor.getInt(cursor.getColumnIndex(HymnFields.new_tune.toString())) == 1);
        hymn.setTitle(cursor.getString(cursor.getColumnIndex(HymnFields.title.toString())));

        if (hymn.getTune() != null) hymn.setTune(hymn.getTune().trim());
        return hymn;
    }
}