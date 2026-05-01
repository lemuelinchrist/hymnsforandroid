package com.lemuelinchrist.android.hymns.utils;

import org.junit.Test;
import static org.junit.Assert.*;

public class HymnStackTest {

    @Test
    public void testPushAndPop() {
        // Start with E1
        HymnStack hymnStack = new HymnStack("E1");
        
        // Push E2 and E3
        hymnStack.push("E2");
        hymnStack.push("E3");

        // In this app, pop() removes the current hymn and returns the PREVIOUS one.
        // Stack: [E3, E2, E1]
        // Pop 1: Removes E3, returns E2
        assertEquals("E2", hymnStack.pop());
        
        // Pop 2: Removes E2, returns E1
        assertEquals("E1", hymnStack.pop());
        
        // Pop 3: Stack only has one element left (E1), so it just returns E1
        assertEquals("E1", hymnStack.pop());
    }

    @Test
    public void testNoDuplicatesOnTop() {
        HymnStack hymnStack = new HymnStack("E1");
        hymnStack.push("E2");
        hymnStack.push("E2"); // Should be ignored because E2 is already at index 0

        // Stack should be [E2, E1]
        assertEquals("E1", hymnStack.pop());
    }

    @Test
    public void testContains() {
        HymnStack hymnStack = new HymnStack("E1");
        hymnStack.push("E2");
        
        assertTrue(hymnStack.contains("E1"));
        assertTrue(hymnStack.contains("E2"));
        assertFalse(hymnStack.contains("E3"));
    }
}
