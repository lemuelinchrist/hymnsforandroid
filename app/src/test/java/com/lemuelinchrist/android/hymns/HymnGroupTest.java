package com.lemuelinchrist.android.hymns;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import org.junit.Test;

/** A book code is one to three letters (E, CS, POR); the number starts with a digit. */
public class HymnGroupTest {

    @Test
    public void groupAndNumberOfOneTwoAndThreeLetterCodes() {
        assertEquals(HymnGroup.E, HymnGroup.getHymnGroupFromID("E1"));
        assertEquals("1", HymnGroup.getHymnNoFromID("E1"));
        assertEquals(HymnGroup.CS, HymnGroup.getHymnGroupFromID("CS428"));
        assertEquals("428", HymnGroup.getHymnNoFromID("CS428"));
        assertEquals(HymnGroup.POR, HymnGroup.getHymnGroupFromID("POR1360"));
        assertEquals("1360", HymnGroup.getHymnNoFromID("POR1360"));
        assertEquals(HymnGroup.POY, HymnGroup.getHymnGroupFromID("poy140"));
        assertEquals(HymnGroup.POL, HymnGroup.getHymnGroupFromID("POL7"));
    }

    @Test
    public void numbersWithALetterAfterTheDigits() {
        assertEquals(HymnGroup.C, HymnGroup.getHymnGroupFromID("C506c"));
        assertEquals("506c", HymnGroup.getHymnNoFromID("C506c"));
        assertEquals(HymnGroup.NS, HymnGroup.getHymnGroupFromID("NS10082"));
        assertEquals("10082", HymnGroup.getHymnNoFromID("NS10082"));
    }

    @Test
    public void unknownCodesAreRefused() {
        for (String id : new String[]{"XX1", "ABCD1", "1", "PO1"}) {
            try {
                HymnGroup.getHymnGroupFromID(id);
                fail(id + " has no book");
            } catch (NoSuchHymnGroupException expected) {
                // as it should
            }
        }
    }

    @Test
    public void everyBookCodeIsOneToThreeLetters() {
        for (HymnGroup group : HymnGroup.values()) {
            assertEquals(group.name(), group.name().matches("[A-Z]{1,3}") ? group.name() : null);
        }
    }
}
