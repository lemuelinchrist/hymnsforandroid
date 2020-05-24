package com.lemuelinchrist.android.hymns.dao;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import androidx.preference.PreferenceManager;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * @author Lemuel Cantos
 * @since 24/5/2020
 */
public class QueryBuilder {
    private final SharedPreferences sharedPreferences;
    private final String fromClause;
    private List<String> likeClauseList;
    private String groupClause;
    private String notNullClause;
    private String orderBy;

    private QueryBuilder(Context context, String fromClause) {
        this.fromClause = fromClause;
        this.sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context);
    }

    public String build() {
        final String PLACEHOLDER = " !!!! ";
        StringBuilder sql = new StringBuilder();
        sql.append("select * from ");
        sql.append(fromClause);

        if(notNullClause != null) {
            sql.append(PLACEHOLDER);
            sql.append(notNullClause);
            // remove trailing "AND"
            sql.reverse().delete(0,4).reverse();
        }
        if(groupClause !=null) {
            sql.append(PLACEHOLDER);
            sql.append(groupClause);
        }
        if(likeClauseList!=null && likeClauseList.size()>0) {
            sql.append(PLACEHOLDER);
            sql.append("(");
            for(String likeClause: likeClauseList) {
                sql.append(likeClause);
                sql.append(" OR ");
            }
            // remove trailing "OR"
            sql.reverse().delete(0,3).reverse();
            sql.append(")");
        }
        if(orderBy!=null) {
            sql.append(" ORDER BY ");
            sql.append(orderBy);
        }

        String sqlString = sql.toString().replaceFirst(PLACEHOLDER, " WHERE ").replaceAll(PLACEHOLDER, " AND ");
        Log.i(this.getClass().getName(), "sql generated: " + sqlString);
        return sqlString;
    }

    public static QueryBuilder newInstance(Context context, String fromClause) {
        return new QueryBuilder(context, fromClause);
    }

    public QueryBuilder addLikeClause(String columnName, String filter) {
        if(isEmpty(filter)) return this;
        filter = filter.replaceAll("'"," ").replaceAll("[\\^\"&%$@.,!]", "").trim();

        StringBuilder likeBuilder = new StringBuilder();
        likeBuilder.append("(");
        String[] words = filter.trim().split(" ");
        for(int x=0; x<words.length; x++) {
            if(x!=0 && words[x].trim().length()<3) continue;
            likeBuilder.append(" ");
            likeBuilder.append(columnName);
            likeBuilder.append(" LIKE '%");
            likeBuilder.append(words[x]);
            likeBuilder.append("%'");
            likeBuilder.append(" AND ");
        }
        // removeAndSave trailing "AND"
        likeBuilder.reverse().delete(0,4).reverse();
        likeBuilder.append(")");

        if(likeClauseList==null) {
            likeClauseList = new ArrayList<>();
        }
        likeClauseList.add(likeBuilder.toString());

        return this;
    }

    public QueryBuilder addDisabledHymnGroupClause() {
        Set<String> disabled = sharedPreferences.getStringSet("disableLanguages",new HashSet<String>());
        if(disabled.size()==0) {
            return this;
        }
        StringBuilder disabledBuilder = new StringBuilder();
        for(String d:disabled) {
            disabledBuilder.append("'");
            disabledBuilder.append(d);
            disabledBuilder.append("'");
            disabledBuilder.append(" ");
        }

        groupClause =  " hymn_group not in ("+ disabledBuilder.toString().trim().replace(" ",", ") +") ";
        return this;
    }

    // Note that this method will overwrite whatever the addDisabledHymnGroupClause will generate because the field they use is the same
    public QueryBuilder addFilterGroupClause(String hymnGroup) {
        groupClause = " hymn_group='" + hymnGroup + "' ";
        return this;
    }

    public QueryBuilder addNotNullClause(String column) {
        if(notNullClause==null) notNullClause="";
        notNullClause += " " + column + " NOT NULL AND "
                + column + "!= '' "
                + "AND ";
        return this;
    }

    public QueryBuilder addOrderByClause(String orderBy) {
        this.orderBy = orderBy + " COLLATE LOCALIZED ASC ";
        return this;
    }

    public QueryBuilder addOrderByHymnGroup(String hymnGroup) {
        this.orderBy = " CAST(no AS int), " +
                "CASE" +
                "   WHEN hymn_group = '"+hymnGroup + "' THEN 1 ELSE hymn_group " +
                "END";
        return this;
    }

    public static boolean isEmpty(String string) {
        return (string == null || string.isEmpty());
    }
}
