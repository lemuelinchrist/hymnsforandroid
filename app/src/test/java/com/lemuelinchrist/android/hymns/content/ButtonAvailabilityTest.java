package com.lemuelinchrist.android.hymns.content;

import android.content.Context;
import android.view.View;
import android.widget.ImageButton;
import androidx.fragment.app.Fragment;
import androidx.test.core.app.ApplicationProvider;
import com.lemuelinchrist.android.hymns.content.sheetmusic.SheetMusicButton;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.File;

import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class ButtonAvailabilityTest {
    private Context context;
    private Fragment fragment;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        fragment = new Fragment() {
            @Override
            public Context getContext() {
                return context;
            }
        };
    }

    private Hymn hymn(String id, String tune, String parent, boolean ownTune) {
        // Robolectric runs without includeAndroidResources, so check shipped sheetMei files on disk
        Hymn h = new Hymn(context) {
            @Override
            public boolean hasSheetMusic(String targetId) {
                return targetId != null && !targetId.isEmpty()
                        && new File("src/main/assets/sheetMei/" + targetId + ".mei").isFile();
            }
        };
        h.setHymnId(id);
        h.setGroup("E");
        h.setTune(tune);
        h.setParentHymn(parent);
        h.setOwnTune(ownTune);
        return h;
    }

    @Test
    public void playButtonHiddenWhenNoMelodyFileExists() {
        for (String missing : new String[]{null, "", "0", "9999999999999999"}) {
            ImageButton button = new ImageButton(context);
            new PlayButton(hymn("E9999", missing, null, false), fragment, button);
            assertEquals("tune=" + missing, View.GONE, button.getVisibility());
        }
    }

    @Test
    public void playButtonVisibleWhenMelodyFileExists() {
        ImageButton button = new ImageButton(context);
        new PlayButton(hymn("BF520", "5513533432653432", null, false), fragment, button);
        assertEquals(View.VISIBLE, button.getVisibility());
    }

    @Test
    public void sheetMusicButtonHiddenWhenNoSheetExists() {
        ImageButton missingOwn = new ImageButton(context);
        new SheetMusicButton(hymn("E9999", null, null, false), fragment, missingOwn);
        assertEquals(View.GONE, missingOwn.getVisibility());

        // New Tune with its own tune ignores its parent's sheet
        ImageButton ownTune = new ImageButton(context);
        new SheetMusicButton(hymn("E9999", "5513533432653432", "E1", true), fragment, ownTune);
        assertEquals(View.GONE, ownTune.getVisibility());
    }

    @Test
    public void sheetMusicButtonVisibleForOwnOrParentSheet() {
        ImageButton own = new ImageButton(context);
        new SheetMusicButton(hymn("BF520", "5513533432653432", null, false), fragment, own);
        assertEquals(View.VISIBLE, own.getVisibility());

        ImageButton inherited = new ImageButton(context);
        new SheetMusicButton(hymn("C1", null, "E1", false), fragment, inherited);
        assertEquals(View.VISIBLE, inherited.getVisibility());
    }
}
