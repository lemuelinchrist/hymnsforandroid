package com.lemuelinchrist.android.hymns;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

/**
 * The files of assets/sheetLyrics (the words of a translation under a borrowed sheet) are looked up by the hymn's ID,
 * so each is named with its book's <b>current</b> code. When FY became FRY (v5.8) the 104 French Youth files kept the
 * old code and those songs lost their French words under the sheet: this test fails if that happens again.
 */
public class SheetLyricsFilesTest {

    @Test
    public void everyFileIsNamedWithACurrentBookCode() {
        File dir = new File("src/main/assets/sheetLyrics");
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
        assertTrue("sheetLyrics folder not found at " + dir.getAbsolutePath(), files != null && files.length > 0);
        List<String> wrong = new ArrayList<>();
        for (File file : files) {
            String id = file.getName().replace(".json", "");
            if (!id.equals(HymnGroup.currentId(id))) wrong.add(id + " (now " + HymnGroup.currentId(id) + ")");
            else if (HymnGroup.currentCode(id.replaceAll("[0-9]+$", "")) == null) wrong.add(id + " (no such book)");
        }
        assertEquals("files named with an old or unknown book code: " + wrong, 0, wrong.size());
    }
}
