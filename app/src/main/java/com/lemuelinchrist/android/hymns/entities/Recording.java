package com.lemuelinchrist.android.hymns.entities;

/**
 * A recording of a hymn on YouTube or SoundCloud (a row of the {@code link} table): who made it ({@link #label}, the
 * publisher, empty when unknown), the album or playlist it is from, and whether it is instrumental. A link with neither
 * a publisher nor an album is one a book's editor chose (the youth books): the links card always shows those.
 */
public class Recording {
    public final String kind;      // "youtube" or "soundcloud"
    public final String label;     // the publisher, "" when unknown
    public final String album;     // the album or playlist, "" when unknown
    public final boolean instrumental;
    public final String url;

    public Recording(String kind, String label, String album, boolean instrumental, String url) {
        this.kind = kind;
        this.label = label == null ? "" : label.trim();
        this.album = album == null ? "" : album.trim();
        this.instrumental = instrumental;
        this.url = url == null ? "" : url.trim();
    }

    /** A book editor's own link: nothing is known about the recording but the link. */
    public boolean isPinned() {
        return label.isEmpty() && album.isEmpty();
    }

    public String platform() {
        return "soundcloud".equals(kind) ? "SoundCloud" : "YouTube";
    }

    /** The first line of its row: the publisher, else the album, else the platform. */
    public String title() {
        return !label.isEmpty() ? label : !album.isEmpty() ? album : platform();
    }

    /** The second line: the album (after a publisher), else the platform; null when the first line is the platform already. */
    public String subtitle() {
        if (!label.isEmpty()) return !album.isEmpty() ? album : platform();
        return !album.isEmpty() ? platform() : null;
    }
}
