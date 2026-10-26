# Feature Guide: Similar Tune

This document explains the implementation and architecture of the "Similar Tune" feature in Hymns for Android.

## Overview

The "Similar Tune" button lets users find other hymns sung to the same melody as the one they are viewing. It is
**off by default**: users turn it on in Settings ("Similar Tune Button"). The button is also hidden when the hymn has
no tune code.

## Architecture

The feature combines data denormalization at provisioning time with a fallback at runtime.

### 1. Data Denormalization (The Database)

- **English (and NS/BF/CH) hymns** are the primary source of tune codes (`hymns.tune`, scale-degree digits such as
  `5553216153222`).
- **Translations** usually inherit their tune from a parent hymn. When a child hymn is saved with an empty tune,
  `Dao.save()` in the `databaseProvisioner` module copies the parent's `tune` into the child's row.
- **Limitation:** only the tune is copied, not the key. The search behind this feature (and the "Music" search tab)
  skips hymns whose `key` is empty, and many translated books have tunes but no key in the database (S, SY, G, GY, GK,
  SW, FY, R, MY, TA, UR at the time of writing). Those hymns are never matched directly; they are reached through the related-hymn
  step below.

### 2. Runtime Logic (The Android App)

`HymnsDao.getHymnsWithSimilarTune()`:

1.  **Find by tune**: run the "Music" tab query (`getByKeyOrTune`) with the tune code as the filter. Hymns need a
    non-empty key and tune, and disabled languages are excluded. The tune is matched as a **prefix**
    (`tune LIKE '<tune>%'`), so a longer tune code starting with the same digits also counts.
2.  **Language matching**, for each match:
    - If it is from a song collection (BF, NS, CH: not a "big hymn language") or from the current hymn's book, keep it.
    - Otherwise, if it has a related hymn in the current hymn's book, keep that translation instead.
    - Otherwise keep the match itself (usually the English hymn) as a fallback.
3.  Remove duplicates and the current hymn.

`SimilarTuneButton` shows the list in a dialog ("Go to hymn with similar tune") when it has **more than one** entry;
otherwise it shows "Sorry! No Hymn with similar tune available". (So a single match is not offered; see
`HYMNAL_SPEC.md` §12.)

## Key Files

- **`app/src/main/java/com/lemuelinchrist/android/hymns/dao/HymnsDao.java`**: `getHymnsWithSimilarTune()` and `getByKeyOrTune()`.
- **`app/src/main/java/com/lemuelinchrist/android/hymns/content/SimilarTuneButton.java`**: the button and the dialog.
- **`databaseProvisioner/src/main/groovy/com/lemuelinchrist/hymns/lib/Dao.java`**: the `save()` logic that copies tune codes during imports.
- **`docs/database_spec.md`**: the broader context of the database lifecycle.
