# Feature Guide: Similar Tune

This document explains the implementation and architecture of the "Similar Tune" feature in Hymns for Android.

## Overview

The "Similar Tune" feature allows users to find other hymns that share the exact same melody as the one they are currently viewing. This is particularly useful for users who recognize a tune and want to explore other lyrics set to that same music.

## Architecture

The feature is implemented using a hybrid approach involving both data denormalization and runtime fallback logic.

### 1. Data Denormalization (The Database)

To ensure high performance and enable direct searching (e.g., in the "Music" search tab), tune codes are denormalized across the database.

- **English Hymns**: Serve as the primary source for tune metadata.
- **Other Languages (Spanish, German, etc.)**: These hymns typically "inherit" their tune from an English parent. 
- **The Fix**: During the database provisioning process, the `tune` code from the English parent is explicitly copied into the `tune` column of the child hymn's row.
- **Implementation**: This is handled automatically by the `Dao.save()` method in the `databaseProvisioner` module.

### 2. Runtime Fallback Logic (The Android App)

To ensure the feature works even when translations are missing, the app employs a "Sibling Fallback" strategy in `HymnsDao.getHymnsWithSimilarTune()`.

1.  **Find by Tune**: The app queries the database for all hymns matching the current hymn's tune code.
2.  **Language Matching**: 
    - For every match found (usually an English hymn), the app checks if a translation exists in the user's currently selected language.
    - If a translation exists, the translated hymn is added to the list.
3.  **Fallback**:
    - If **no translation exists** for a matching tune, the app now provides the original language hymn (usually English) as a fallback rather than hiding the result.

## Key Files

- **`app/src/main/java/com/lemuelinchrist/android/hymns/dao/HymnsDao.java`**: Contains the `getHymnsWithSimilarTune()` method where the fallback logic lives.
- **`databaseProvisioner/src/main/groovy/com/lemuelinchrist/hymns/lib/Dao.java`**: Contains the `save()` logic that ensures tune codes are denormalized during imports.
- **`docs/database_spec.md`**: Provides the broader context of the database lifecycle.
