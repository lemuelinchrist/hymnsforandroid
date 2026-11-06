package com.lemuelinchrist.android.hymns;

/**
 * @author Lemuel Cantos
 * @since 10/10/2020
 */
public interface HymnSwitcher {
    void switchToHymn(String id);

    /** Like switchToHymn, but the Back button returns to the hymn we came from. */
    void switchToRelatedHymn(String id);

    /** Like switchToRelatedHymn, but the hymn opens at its top (a New Tune, not another language of the same hymn). */
    void switchToHymnFromTop(String id);
}
