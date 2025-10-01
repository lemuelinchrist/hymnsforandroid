# Hymns For Android

## Project Overview

This is an Android application that serves as a digital hymnal. It provides users with access to a collection of hymns, including lyrics and sheet music for piano and guitar. The app is designed to be a convenient replacement for traditional hymn books, offering a user-friendly interface and powerful search capabilities.

The project is built using Gradle and the Android SDK. It has a modular structure, with separate modules for the main application, the SQLite database, and a database provisioner.

**Key Technologies:**

*   **Frontend:** Java, Android SDK
*   **Build:** Gradle
*   **Database:** SQLite

## Building and Running

To build and run the project, you will need:

*   Android Studio Arctic Fox (2020.3.1) or newer
*   JDK 11 or newer
*   Android SDK 34

**Build Commands:**

*   **Debug build:** `./gradlew assembleDebug`
*   **Release build:** `./gradlew assembleRelease`

The build process automatically imports the hymn data from the `sqlite` module into the main application.

**Sheet Music Variants:**

You can choose to build the app with different sheet music variants by editing the `app/build.gradle` file and uncommenting one of the following lines:

```groovy
// def svgFolderName = "pianoSvg"
// def svgFolderName = "guitarSvg"
```

## Development Conventions

*   **Architecture:** Before making code changes, please review the `docs/APP_ARCHITECTURE.md` file to understand the application's architecture.
*   **Database:** The application uses a SQLite database to store hymn data. The schema is documented in the `docs/database_spec.md` file. The database is provisioned using the `databaseProvisioner` module.
*   **Hymn Groups:** Hymns are categorized into groups based on language or collection. These groups are defined in the `HymnGroup.java` enum.
*   **Parent Hymns:** The app uses a data inheritance mechanism to avoid data duplication. A "child" hymn can inherit data from a "parent" hymn. This is implemented in the `HymnsDao.java` file.
*   **Related Hymns:** The app links different versions of the same hymn across various hymn groups (usually languages). This is done using the `related` column in the `hymns` table.

## Gemini Persona

Please have a lighthearted conversational and funny tone. i want you to play the role of a pair-programming buddy.