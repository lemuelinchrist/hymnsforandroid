# Language Provisioning Guide (Ultimate Edition)

This guide provides a comprehensive, step-by-step workflow for importing a new language into the **Hymns For Android** application. It distills the lessons learned from the 2026 Greek Import into a repeatable standard for future AI agents and developers.

## 0️⃣ Prerequisite Reading

Before working on any provisioning scripts, it is highly recommended to read the following documents to understand the system's foundation:

- **[`docs/database_spec.md`](./database_spec.md)**: Essential for understanding the SQLite schema (`hymns` and `stanza` tables) and the "Parent Hymn" inheritance mechanism.
- **[`docs/APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md)**: Provides a high-level view of how the `HymnsDao` and data entities fit into the overall application.
- **[`databaseProvisioner/src/main/groovy/com/lemuelinchrist/hymns/ProvisionGreek.groovy`](../src/main/groovy/com/lemuelinchrist/hymns/ProvisionGreek.groovy)**: The current gold-standard reference implementation for language imports.

---

## 🏗️ The 3-Stage Pipeline

Importing a new language is not just a single script; it is a pipeline designed for data integrity and repository health.

### 1. Pre-Processing (Logic)
Raw text files are often messy (OCR errors, inconsistent tabs, mixed Greek/English characters). Standardizing the data before provisioning is essential.
- **Workflow**: Develop a script (Python or similar) to transform the raw text into a structured format that the Groovy parser can understand.
- **Key Logic Requirements**:
  - **BOM Management**: Ensure the script handles Byte Order Marks (UTF-8-SIG) often found in text exports.
  - **OCR Correction**: Fix common optical recognition errors (e.g., mapping `ii` ➔ `11`, `4o` ➔ `40`, `lo` ➔ `10`).
  - **Header Standardization**: Ensure each hymn starts with a unique ID (e.g., `GK-1`) and a clean `Subject:` line.
  - **Prefix Mapping**: Convert local language prefixes to standard app codes (e.g., Greek `Α-` ➔ `E`, `Κ-` ➔ `C`).
  - **Bilingual Support**: Regex patterns must account for both Greek and English character variants (e.g., `A` vs `Α` and `K` vs `Κ`).
  - **Verified Mappings**: Hardcode verified parent hymn mappings (e.g., linking specific Greek hymns to confirmed English IDs like `NS10012`).
- **Output**: A clean, formatted `.txt` file saved to `databaseProvisioner/src/main/resources/`.

### 2. Database Sanitization (Crucial!)
Before running any provisioning script, you **must** ensure your local binary database is in sync with the version-controlled SQL. Failure to do this can lead to "dirty data" contamination in the repository.
- **Action**: Run `./gradlew :sqlite:importSql`.
- **Why**: This wipes the local `hymns.sqlite` and rebuilds it fresh from `sqlite/hymns.sql`.

### 3. Database Provisioning (Groovy)
The standardized text is shoved into the SQLite database.
- **Tool**: Create a Groovy class (refer to `databaseProvisioner/src/main/groovy/com/lemuelinchrist/hymns/ProvisionGreek.groovy`).
- **Goals**:
  - Clear existing hymns in the target range to avoid duplicates.
  - Parse the standardized file using a state-machine logic.
  - Set `firstStanzaLine` and `firstChorusLine` for the search index.
  - **Inheritance**: Ensure the `parentHymn` field is set correctly so the app automatically inherits tunes, authors, and composers from English parents.
- **Task**: Add a specific Gradle task in `databaseProvisioner/build.gradle` (e.g., `runGreek`) for easy execution.

### 3. Synchronization & Export
Keep the codebase and database in perfect harmony.
- **Logic Sync**: Add the new language to the `HymnGroup.java` enum with appropriate Material Design colors.
- **Asset Sync**: Place a **364x364 PNG** icon in `app/src/main/res/drawable-xhdpi/` named with the lowercase language code (e.g., `gk.png`).
- **SQL Export**: Always run `./gradlew :sqlite:exportSql` after an import. The `hymns.sql` file is the **only** source of truth tracked by Git.

---

## 💎 Best Practices & Safety Rules

### 🛡️ Git Hygiene (The "Ninja" Strategy)
- **Binary Protection**: NEVER commit `.sqlite` files to the repository. They bloat the `.git` folder and are hard to track.
- **Clean History**: If you accidentally commit a binary, use `git reset --soft` to roll back and recommit without the bloat.
- **Gitignore**: Ensure `app/src/main/assets/hymns.sqlite` and `sqlite/hymns.sqlite` are always ignored.

### 📜 Gemini Persona Rules (From `GEMINI.md`)
- **Force Push Protection**: ALWAYS ask for permission before a `git push --force`.
- **Draft First**: Always create GitHub releases as **Drafts** first.
- **Rich Formatting**: Use emojis, bullet points, and clear headers in release notes.

### 🔍 Metadata Verification
- **Expert Confirmation**: Before finalizing parent mappings, generate a simple text table and ask the user to verify it with native-speaking experts.
- **Long Beach (LB) Hymns**: Note that "LB" hymns are often stored at the end of the `NS` (New Songs) collection (e.g., LB12 is `NS10012`).

---

## 🛠️ Automated Versioning
To ensure users' phones automatically refresh their local database cache when an update is installed:
- Use the **Automatic Minute-Based Versioning** in `app/build.gradle`.
- This ensures every build has a unique, increasing `versionCode` without manual intervention.

---

## 🚀 How to Ship (The Grand Finale)

Once the data is matched and the database is exported, follow these steps to share the update with the world.

### 1. Build the Signed APK
Always use a "Clean Slate" build to ensure no stale assets are included.
- **Action**: `./gradlew clean assembleRelease`
- **Output**: `app/build/outputs/apk/release/HymnsForAndroidvX.XX-PianoAndGuitar.apk`.

### 2. Commit and Sync
Ensure your local workspace is clean and pushed to the remote.
- **Action**: `git add . && git commit -m "Your descriptive message" && git push origin master`
- **Safety**: NEVER perform a `git push --force` without explicit user permission.

### 3. Publish to GitHub (Draft First!)
Per the `GEMINI.md` mandates, always create a **Draft** release first.
- **Action**: 
  1. Create a markdown file (e.g., `temp/release_notes.md`) with rich formatting (bullet points, emojis, clear headers).
  2. Run the `gh` CLI command, attaching the signed APK built in step 1:
     ```bash
     gh release create v4.XX app/build/outputs/apk/release/HymnsForAndroidvX.XX-PianoAndGuitar.apk --title "v4.XX - Release Title" --notes-file temp/release_notes.md --draft
     ```
- **Review**: Verify the draft on GitHub. Once satisfied, publish it to make it live for the saints.

---
*Created by Gemini CLI - May 2026*
