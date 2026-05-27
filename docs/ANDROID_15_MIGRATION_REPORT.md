# Android 15 (API 35) Migration & UI Repair Report: Deep Dive

## 📋 Overview
This document provides an exhaustive technical breakdown of the migration from Target SDK 34 to **Target SDK 35 (Android 15)**. Due to Android 15's enforced "Edge-to-Edge" policy, the application required significant refactoring of its theme, layouts, and window management logic to maintain its professional aesthetic and usability.

---

## 🛠️ Technical Challenges & Solutions

### 1. The Battle of the Bars (Edge-to-Edge)
- **Problem**: In API 35, `android:windowTranslucentStatus` and `android:windowTranslucentNavigation` are effectively deprecated and cause a mandatory "scrim" (dark tint) that cannot be styled. Furthermore, the UI began drawing *under* the system status bar, making the search and hamburger icons difficult to click.
- **The Failed Approach**: Initial attempts using `android:fitsSystemWindows="true"` in the XML resulted in a "Double Gap" (excessive white space) because it conflicted with existing layout behaviors in `CoordinatorLayout`.
- **The Winning Approach**: Switched to purely **Programmatic Window Insets**.
  - **Logic**: Used `ViewCompat.setOnApplyWindowInsetsListener` on top-level activity containers.
  - **Code Implementation**:
    ```java
    Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
    toolbar.setPadding(0, systemBars.top, 0, 0); // Precision top padding
    ```
  - **Result**: The toolbar now respects the status bar height on all devices, regardless of notches or system icon sizes.

### 2. The "Invisible Settings" Crisis (Theme Conflict)
- **Problem**: To make the main hymn numbers white against the Aegean Blue bar, `android:textColorPrimary` was set to white in the base theme. However, the Settings screen uses a white background for its preference list, rendering all titles invisible.
- **Solution**: Created a specialized **`SettingsTheme`** with high-contrast overrides.
  - **Inheritance**: `MyMaterialTheme.Base` -> `SettingsTheme`.
  - **Overrides**: Forced `android:textColorPrimary` to `@android:color/black`.
  - **Consistency**: Set `colorPrimary` to white for the Settings Activity to ensure the black "Settings" title and back arrow remained visible on a light bar.

### 3. Banishing the "Sliding Ghost Bar"
- **Problem**: During lyrics scrolling, a 15px white block would slide into view at the bottom. This was a "Double Padding" artifact where the `ViewPager` was padded by the Activity, and its movement revealed the underlying padded area.
- **Solution**: 
  - **Removed padding** from the `ViewPager` in `HymnsActivity`.
  - **Refined ContentArea**: Applied `setClipToPadding(false)` to the `NestedScrollView`.
  - **Logic**: Applied the bottom `systemBars` insets only to the scrollable content's internal padding.
  - **Result**: Lyrics now flow seamlessly behind a **100% transparent** navigation bar, but the "Composer" text at the very bottom remains reachable and clear of the system's home swipe bar.

### 4. The "Manual Scrim" Strategy
- **Problem**: Android 15's enforced transparency made the status bar icons (wifi/battery) hard to read against certain hymn colors. Standard theme-level coloring was being ignored.
- **Solution**: Implemented a **Persistent Scrim View**.
  - **XML Hierarchy**: Wrapped the entire `DrawerLayout` in a `FrameLayout`.
  - **The Overlay**: Added a dedicated `<View android:id="@+id/status_bar_scrim" />` as the final child of the FrameLayout.
  - **Z-Order Dominance**: Applied `android:elevation="99dp"` to ensure it stays on top of both the content *and* the navigation drawer.
  - **Persistence**: Because it is outside the `DrawerLayout`, the 25% dark tint (`#44000000`) remains perfectly stationary even when the drawer slides out.

---

## ⚙️ Engineering Standards & Builds

### 🔢 Automatic Versioning (Minute-Based)
To solve the issue of testers seeing "stale" databases, we moved away from manual `versionCode` bumping.
- **Logic**: `versionCode = (Minutes since Jan 1, 2024)`.
- **Technical Constraint**: Stayed within the 32-bit Integer limit (max ~2.1 billion).
- **Implementation**:
  ```gradle
  def autoVersionCode = ((System.currentTimeMillis() - 1704067200000L) / 60000).toInteger()
  ```
- **Benefit**: Ensures every build has a unique, increasing ID that triggers the `HymnsSqliteHelper.onUpgrade()` database refresh.

### 🔐 4096-bit Security Upgrade
The legacy 1024-bit signing key was rejected by Google Play security checks.
- **Action**: Created `hymnsKey-new.jks` using the **PKCS12** format.
- **Strength**: 4096-bit RSA (Industry Standard).
- **Policy**: Registered as the official **Upload Key** in the Play Console, allowing for high-security uploads without breaking the "App Signing" path for existing users.

---

## ✅ Final State Summary
- **Target SDK**: 35 (Android 15)
- **Min SDK**: 21 (Android 5.0 Lollipop)
- **Status Bar**: Persistent semi-transparent scrim (#44000000).
- **Nav Bar**: 100% Transparent with immersive scroll-under support.
- **Code Health**: Enforced mandatory self-compilation rules in `GEMINI.md`.

---
*Report generated by Gemini CLI - May 2026*
