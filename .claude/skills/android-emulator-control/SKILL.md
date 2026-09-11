---
name: android-emulator-control
description: Use when asked to run, test, or visually verify a change in the Hymns For Android app on the emulator — installing a build, navigating the UI, taking screenshots, or driving taps/swipes/text input via adb. Covers the WSL-to-Windows adb path gotchas specific to this dev machine.
---

# Controlling the Android Emulator from WSL

This dev machine runs Claude Code inside WSL, but the Android emulator and its `adb`
are Windows processes. There is no `adb` in the WSL `$PATH` — you must call the
Windows binary directly, and it only accepts **Windows-style paths**, not WSL's
`/mnt/c/...` paths, for local file arguments (`install`, `pull`, `push`).

## Setup

```bash
ADB=/mnt/c/Users/lemue/AppData/Local/Android/Sdk/platform-tools/adb.exe
$ADB devices   # confirm an emulator is attached, e.g. "emulator-5554  device"
```

Keep a scratch dir on the Windows side for screenshots/APKs, since `adb pull`/`push`
write through the Windows filesystem:

```bash
mkdir -p /mnt/c/Users/lemue/AppData/Local/Temp/claude_test
```

**Path rule**: any path passed *to* `adb.exe` for a local (non-device) file must be a
Windows path. Convert with `wslpath -w /mnt/c/...` when starting from a WSL path, or
just type the `C:\...` form directly. Device-side paths (`/sdcard/...`) are always
Linux-style regardless.

```bash
# WRONG - adb.exe can't stat a /mnt/c path
$ADB install -r /mnt/c/Users/.../app-debug.apk

# RIGHT
$ADB install -r "$(wslpath -w /mnt/c/Users/.../app-debug.apk)"
```

## Build and install

```bash
cd /mnt/c/Users/lemue/IdeaProjects/hymnsforandroid
./gradlew :app:assembleDebug -q
APK=$(find app/build/outputs/apk/debug -name '*.apk')
$ADB install -r "$(wslpath -w "$APK")"
```

**Signature mismatch**: if the emulator has a release-signed build installed (e.g. from
a previous Play Store internal-testing push) and you install a differently-signed debug
build, you get:

```
INSTALL_FAILED_UPDATE_INCOMPATIBLE: ...signatures do not match newer version...
```

This is the same "uninstall before installing" situation documented for Victor's
manual testing. On the emulator it's safe to just uninstall and reinstall:

```bash
$ADB uninstall com.lemuelinchrist.android.hymns
$ADB install -r "$(wslpath -w "$APK")"
```

## Launch and screenshot

```bash
$ADB shell am start -n com.lemuelinchrist.android.hymns/.HymnsActivity
sleep 2
$ADB shell screencap -p /sdcard/screen.png
$ADB pull /sdcard/screen.png "C:\Users\lemue\AppData\Local\Temp\claude_test\screen.png"
```

Then view it with the Read tool at the **WSL path**:
`/mnt/c/Users/lemue/AppData/Local/Temp/claude_test/screen.png`.

## Coordinates: always work in real device pixels

The Read tool downsamples large screenshots and reports the scale factor, e.g.:

> `[Image: original 1344x2992, displayed at 898x2000. Multiply coordinates by 1.50 ...]`

When you pick a tap target by eye from the *displayed* image, multiply both x and y by
that factor before sending it to `adb shell input tap`. Getting this wrong is the most
common cause of a tap silently landing on the wrong widget. Device resolution/density
can be checked directly:

```bash
$ADB shell wm size      # e.g. Physical size: 1344x2992
$ADB shell wm density   # e.g. Physical density: 480
```

## Driving the UI

```bash
$ADB shell input tap <x> <y>
$ADB shell input text "422"                 # types into a focused text field
$ADB shell input keyevent 4                 # back button
$ADB shell input swipe <x1> <y1> <x2> <y2> <duration_ms>   # scroll/drag
```

Swipe direction is "finger movement," same as a real touch: swiping from a high y to a
low y (finger moves *up* the screen) scrolls the content *down* (reveals what's below),
matching a natural upward scroll gesture.

`input text` occasionally triggers a floating Gboard clipboard/emoji toolbar to pop up
over part of the screen after typing — this is a keyboard UI artifact, not an app bug;
it doesn't block taps outside its bounds and can be ignored or dismissed with `keyevent 4`.

Always re-screenshot after each interaction before deciding the next tap — don't chain
multiple blind taps based on a stale screenshot's coordinates, since a screen change
(dialog, scroll position, keyboard appearing) shifts everything.

## Navigating this app specifically

There's no deep-link/intent-extra way to jump straight to a specific hymn (checked
`AndroidManifest.xml` and `HymnsActivity`/`SearchActivity` — `SearchActivity` requires a
`HymnGroup` Java-enum Serializable extra that `am start --es` can't construct, and
`HymnsActivity` only takes a hymn ID via in-process navigation, not an Intent extra).
The reliable path is UI navigation:

1. Launch `HymnsActivity` — it opens on the default/last-viewed hymn.
2. Tap the hamburger icon (top-left) to open the language/group drawer.
3. Tap the target `HymnGroup` (e.g. "Spanish Youth" for `SY`, "Japanese" for `J`).
   **The search tab that opens next is scoped to whatever group you're currently in**,
   so you must switch groups *before* searching if you want a hymn from a different
   group than the one you landed on.
4. Tap the search icon (top-right, magnifying glass) — opens `SearchActivity` on the
   "HYMN NUMBERS" tab by default.
5. `input text "<number>"` (just the numeric part, no group-letter prefix — the number
   tab is already scoped to the current group) — results filter live.
6. Tap the matching result row to open that hymn's lyrics view.
7. Scroll with `input swipe` to see stanzas below the fold.

## When you're just verifying a rendering fix

For a one-off visual check (not a repeatable regression suite), this manual
screenshot-and-look workflow is the right tool — don't reach for Espresso/UI Automator
test code unless the user asks for a real automated test to be added to the repo.
