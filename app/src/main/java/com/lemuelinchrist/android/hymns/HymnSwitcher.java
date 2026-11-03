package com.lemuelinchrist.android.hymns;

/**
 * @author Lemuel Cantos
 * @since 10/10/2020
 */
public interface HymnSwitcher {
    void switchToHymn(String id);

    /** Like switchToHymn, but the Back button returns to the hymn we came from. */
    void switchToRelatedHymn(String id);
}
