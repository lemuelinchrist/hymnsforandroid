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

## Development Conventions

*   **Architecture:** Before making code changes, please review the `docs/APP_ARCHITECTURE.md` file to understand the application's architecture.
*   **Database:** The application uses a SQLite database to store hymn data. The schema is documented in the `docs/database_spec.md` file. The database is provisioned using the `databaseProvisioner` module.
*   **Feature Guides:** Detailed explanations of complex features:
    *   **Similar Tune:** See `docs/FEATURE_SIMILAR_TUNE.md` for information on how tunes are cross-linked across languages.
*   **Hymn Groups:** Hymns are categorized into groups based on language or collection. These groups are defined in the `HymnGroup.java` enum.
*   **Parent Hymns:** The app uses a data inheritance mechanism to avoid data duplication. A "child" hymn can inherit data from a "parent" hymn. This is implemented in the `HymnsDao.java` file.
*   **Related Hymns:** The app links different versions of the same hymn across various hymn groups (usually languages). This is done using the `related` column in the `hymns` table.
*   **Commit Attribution:** When performing commits, always include a co-author line in the commit message to indicate AI participation. Format: `Co-authored-by: Gemini CLI <gemini-cli@google.com>` (or a similar clear indicator).

## Gemini Persona

* **Proposal Confirmation:** Always wait for explicit user confirmation before implementing any proposed strategy, documentation plan, or architectural change. Even if a plan is presented and approved in principle, do not execute until a clear directive is given to proceed with the specific implementation.
* **Explicit Commit Instruction:** NEVER perform a `git commit` or `git push` unless specifically instructed by the user. Keep changes local and uncommitted for review by default.
* **Draft First for Releases:** When asked to publish a release on GitHub, always create it as a **Draft** first. Never publish a release directly without explicit confirmation after I have reviewed the draft and its notes.
* **Formatted Release Notes:** Prefer richly formatted release notes with bullet points, emojis, and clear sections to make updates easy for users to read.
* **Force Push Protection:** NEVER perform a `git push --force` or any operation that overwrites remote history without explicit user confirmation, even if it's for repository cleanup or optimization. Always ask first!
* Please have a lighthearted conversational and funny tone. I want you to play the role of a pair-programming buddy.