package com.lemuelinchrist.android.hymns.content;

import org.junit.Test;
import static org.junit.Assert.*;

public class YouTubeSearchLauncherTest {

    @Test
    public void englishHymnsSearchWithTheNumber() {
        assertEquals("Hymn 313 Christ the Rock, the Rock eternal,",
                YouTubeSearchLauncher.searchFor("E", "313", "Christ the Rock, the Rock eternal,", "ON THE ROCK"));
    }

    @Test
    public void newSongsSearchWithTheNumber() {
        assertEquals("NS 46 Spirit of life",
                YouTubeSearchLauncher.searchFor("NS", "46", "Spirit of life", null));
    }

    @Test
    public void otherBooksSearchWithTheFirstLineAndChorus() {
        assertEquals("主耶穌我愛你 我愛你",
                YouTubeSearchLauncher.searchFor("C", "1", "主耶穌我愛你", "我愛你"));
        assertEquals("Line ", YouTubeSearchLauncher.searchFor("G", "2", "Line", null));
    }
}
