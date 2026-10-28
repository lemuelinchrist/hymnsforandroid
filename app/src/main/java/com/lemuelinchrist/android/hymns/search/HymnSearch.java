package com.lemuelinchrist.android.hymns.search;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.lemuelinchrist.android.hymns.HymnGroup;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The Search tab's search over the {@code search} table ({@link com.lemuelinchrist.android.hymns.dao.SearchIndex}):
 * one result per hymn, every word (or "phrase in quotes") found somewhere in the hymn, best first. See
 * HYMNAL_SPEC.md §9.
 *
 * @since 2026-10-28
 */
public final class HymnSearch {

    /** Where a hymn matched, best first; the result list shows a line for why it matched unless it is FIRST. */
    public enum Where {FIRST, CHORUS, SUBJECT, PEOPLE, MUSIC, LYRICS}

    public static final class Result {
        public final String id;
        public final HymnGroup group;
        public final int no;
        public final String line;
        public final Where where;
        final int score;

        Result(String id, HymnGroup group, int no, String line, Where where, int score) {
            this.id = id;
            this.group = group;
            this.no = no;
            this.line = line;
            this.where = where;
            this.score = score;
        }
    }

    /** What was typed: words and quoted phrases, in search form. */
    public static final class Query {
        public final List<String> terms;
        /** the whole query as one phrase, for ranking hymns that have the words together first */
        public final String phrase;

        Query(List<String> terms, String phrase) {
            this.terms = terms;
            this.phrase = phrase;
        }

        public boolean isEmpty() {
            return terms.isEmpty();
        }
    }

    private static final Pattern QUOTED = Pattern.compile("[\"“”„«»]([^\"“”„«»]*)[\"“”„«»]?");
    private static final Pattern HYMN_ID = Pattern.compile("^([A-Za-z]{1,2})\\s*-?\\s*(\\d+)$");
    private static final Pattern NUMBER = Pattern.compile("^#?(\\d+)$");

    private HymnSearch() {
    }

    public static Query parse(String typed) {
        List<String> terms = new ArrayList<>();
        StringBuilder rest = new StringBuilder();
        Matcher m = QUOTED.matcher(typed == null ? "" : typed);
        int last = 0;
        while (m.find()) {
            rest.append(typed, last, m.start()).append(' ');
            String phrase = SearchText.norm(m.group(1));
            if (!phrase.isEmpty() && !terms.contains(phrase)) terms.add(phrase);
            last = m.end();
        }
        if (typed != null) rest.append(typed.substring(last));
        for (String word : SearchText.norm(rest.toString()).split(" ")) {
            if (!word.isEmpty() && !terms.contains(word)) terms.add(word);
        }
        return new Query(terms, SearchText.norm(typed));
    }

    /**
     * The hymn ID that what was typed points to: a hymn ID ("NS 151", "e8") or a number in the current book ("8"),
     * or null.
     */
    public static String hymnIdOf(String typed, HymnGroup current) {
        String q = typed == null ? "" : typed.trim();
        Matcher m = HYMN_ID.matcher(q);
        if (m.matches()) {
            try {
                return HymnGroup.valueOf(m.group(1).toUpperCase()).name() + Integer.parseInt(m.group(2));
            } catch (IllegalArgumentException e) {
                return null;
            }
        }
        m = NUMBER.matcher(q);
        if (m.matches() && current != null) {
            try {
                return current.name() + Integer.parseInt(m.group(1));
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    public static boolean exists(SQLiteDatabase db, String id) {
        Cursor c = db.rawQuery("SELECT 1 FROM search WHERE id = ?", new String[]{id});
        try {
            return c.moveToFirst();
        } finally {
            c.close();
        }
    }

    /** Every hymn outside the hidden books that has all of the query's terms, best first. */
    public static List<Result> search(SQLiteDatabase db, Query query, HymnGroup current, Collection<String> hidden) {
        List<Result> results = new ArrayList<>();
        if (query.isEmpty()) return results;

        StringBuilder where = new StringBuilder();
        List<String> args = new ArrayList<>();
        for (String term : query.terms) {
            if (where.length() > 0) where.append(" AND ");
            where.append("(first LIKE ? OR chorus LIKE ? OR subject LIKE ? OR people LIKE ? OR music LIKE ?"
                    + " OR body LIKE ?)");
            for (int i = 0; i < 6; i++) args.add("%" + term + "%");
        }
        for (String group : hidden) {
            where.append(" AND grp != ?");
            args.add(group);
        }

        Cursor c = db.rawQuery("SELECT id, grp, no, line, first, chorus, subject, people, music, body FROM search"
                + " WHERE " + where, args.toArray(new String[0]));
        try {
            while (c.moveToNext()) {
                if (!shortWordsWhole(query.terms, c)) continue;
                HymnGroup group;
                try {
                    group = HymnGroup.valueOf(c.getString(1));
                } catch (IllegalArgumentException e) {
                    continue;
                }
                int[] score = score(query, c.getString(4), c.getString(5), c.getString(6), c.getString(7),
                        c.getString(8), c.getString(9));
                results.add(new Result(c.getString(0), group, c.getInt(2), c.getString(3),
                        Where.values()[score[1]], score[0]));
            }
        } finally {
            c.close();
        }

        Collections.sort(results, (a, b) -> {
            if (a.score != b.score) return b.score - a.score;
            if ((a.group == current) != (b.group == current)) return a.group == current ? -1 : 1;
            if (a.group != b.group) return a.group.ordinal() - b.group.ordinal();
            return a.no - b.no;
        });
        return results;
    }

    /**
     * {score, Where}: the first line starts with the words together; has them together; the chorus line has them
     * together; all words in the first line, then in the chorus line; in the subject, then author/composer, then
     * key/tune; in the lyrics, the words together, then as whole words, then as parts of words.
     */
    static int[] score(Query q, String first, String chorus, String subject, String people, String music,
                       String body) {
        String phrase = q.phrase;
        if (!phrase.isEmpty() && !isShortWord(phrase)) {
            if (first.startsWith(phrase)) return new int[]{100, Where.FIRST.ordinal()};
            if (first.contains(phrase)) return new int[]{90, Where.FIRST.ordinal()};
            if (chorus.contains(phrase)) return new int[]{80, Where.CHORUS.ordinal()};
        }
        if (hasAll(first, q.terms)) return new int[]{70, Where.FIRST.ordinal()};
        if (hasAll(chorus, q.terms)) return new int[]{60, Where.CHORUS.ordinal()};
        if (hasAll(subject, q.terms)) return new int[]{50, Where.SUBJECT.ordinal()};
        if (hasAll(people, q.terms)) return new int[]{40, Where.PEOPLE.ordinal()};
        if (hasAll(music, q.terms)) return new int[]{30, Where.MUSIC.ordinal()};
        String words = " " + body.replace(" | ", " ") + " ";
        if (!phrase.isEmpty() && words.contains(" " + phrase + " ")) return new int[]{26, Where.LYRICS.ordinal()};
        boolean whole = true;
        for (String t : q.terms) whole &= words.contains(" " + t + " ");
        return new int[]{whole ? 23 : 20, Where.LYRICS.ordinal()};
    }

    private static boolean hasAll(String text, List<String> terms) {
        if (text == null || text.isEmpty()) return false;
        for (String t : terms) if (!found(text, t)) return false;
        return true;
    }

    /**
     * A word of one or two letters in a script that puts spaces between words ("c", "o", "de") only counts as a
     * whole word: as part of a word it is in nearly every hymn ("c major" found 9,055). Longer words, phrases and
     * Chinese, Japanese, Korean or Tamil text count anywhere, as parts of words.
     */
    public static boolean isShortWord(String term) {
        if (term.length() > 2 || term.indexOf(' ') >= 0) return false;
        for (int i = 0; i < term.length(); i++) {
            char ch = term.charAt(i);
            if (Character.isDigit(ch)) continue;
            Character.UnicodeScript script = Character.UnicodeScript.of(ch);
            if (script != Character.UnicodeScript.LATIN && script != Character.UnicodeScript.GREEK
                    && script != Character.UnicodeScript.CYRILLIC) return false;
        }
        return true;
    }

    /** Whether text in search form has the term: anywhere, or as a whole word if it is a short word. */
    public static boolean found(String text, String term) {
        if (text == null) return false;
        if (!isShortWord(term)) return text.contains(term);
        return (" " + text.replace(" | ", " ") + " ").contains(" " + term + " ");
    }

    // the SQL found the short words anywhere; keep the hymn only if each is a whole word in one of the columns
    private static boolean shortWordsWhole(List<String> terms, Cursor c) {
        for (String t : terms) {
            if (!isShortWord(t)) continue;
            boolean whole = false;
            for (int col = 4; col <= 9 && !whole; col++) whole = found(c.getString(col), t);
            if (!whole) return false;
        }
        return true;
    }
}
