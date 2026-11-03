package com.lemuelinchrist.android.hymns;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import org.junit.Test;

public class CodeMigrationTest {

    @Test
    public void hiddenBooksKeepTheirMeaningUnderTheNewCodes() {
        Set<String> hidden = new HashSet<>(Arrays.asList("MY", "R", "FY", "I", "KI", "POR"));
        assertEquals(new HashSet<>(Arrays.asList("BUR", "RUS", "FRY", "I", "KI", "POR")), CodeMigration.migrateHidden(hidden));
        assertEquals(new HashSet<>(Arrays.asList("BUR")), CodeMigration.migrateHidden(new HashSet<>(Arrays.asList("BUR"))));
    }
}
