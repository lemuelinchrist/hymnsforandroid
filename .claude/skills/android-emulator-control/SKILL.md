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

**CRITICAL WSL rule**: calling Windows `.exe` binaries (`adb.exe`, `emulator.exe`, `powershell.exe`, `tasklist.exe`) from a WSL command runner can hang indefinitely waiting on PTY stdin or inherited daemon pipes (especially when `adb.exe` auto-starts the Windows adb server daemon). **Always close stdin with `</dev/null` and wrap every Windows `.exe` call in `timeout`** (e.g. `timeout 15` for queries/taps, `timeout 30` for `screencap`/`pull`, `timeout 60` for `install`):

```bash
ADB=/mnt/c/Users/lemue/AppData/Local/Android/Sdk/platform-tools/adb.exe
timeout 15 "$ADB" devices </dev/null   # confirm an emulator is attached, e.g. "emulator-5554  device"
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
# WRONG - adb.exe can't stat a /mnt/c path, and without </dev/null it may hang
$ADB install -r /mnt/c/Users/.../app-debug.apk

# RIGHT
timeout 60 "$ADB" install -r "$(wslpath -w /mnt/c/Users/.../app-debug.apk)" </dev/null
```

## Starting the emulator from WSL

If `timeout 15 "$ADB" devices </dev/null` shows no attached emulator, do not ask the user or invoke `emulator.exe` directly in the shell — launch it detached via PowerShell `Start-Process` so it never inherits WSL's stdout/stderr pipes:

```bash
# List available AVDs if needed (Pixel_9_Android16, Pixel_9_Pro_XL, Medium_Tablet; default phone is Pixel_9_Android16)
timeout 10 /mnt/c/Users/lemue/AppData/Local/Android/Sdk/emulator/emulator.exe -list-avds </dev/null

# Launch Pixel_9_Android16 detached on Windows
timeout 10 /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command \
  'Start-Process -FilePath "C:\Users\lemue\AppData\Local\Android\Sdk\emulator\emulator.exe" -ArgumentList "-avd","Pixel_9_Android16"' </dev/null

# Confirm the emulator process spawned
timeout 5 /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command \
  'Get-Process emulator,qemu* -ErrorAction SilentlyContinue | Format-Table Id,ProcessName' </dev/null
```

Then wait until `emulator-5554` appears and `sys.boot_completed` outputs `1` (usually a few seconds with Quick Boot; check periodically with `schedule` if still booting rather than using a blocking wait without timeout), unlock the screen, and confirm responsiveness:

```bash
timeout 10 "$ADB" devices </dev/null
timeout 10 "$ADB" shell getprop sys.boot_completed </dev/null   # ready when "1"
timeout 10 "$ADB" shell input keyevent 82 </dev/null           # unlock if locked
timeout 10 "$ADB" shell wm size </dev/null
```

## Build and install

```bash
cd /mnt/c/Users/lemue/IdeaProjects/hymnsforandroid
JAVA_HOME=/home/lemue/.jdk ./gradlew :app:assembleDebug -q
APK=$(find app/build/outputs/apk/debug -name '*.apk')
timeout 60 "$ADB" install -r "$(wslpath -w "$APK")" </dev/null
```

(When verifying a release build, install an already-built APK under `app/build/outputs/apk/release/` directly instead of rebuilding.)

**Signature mismatch**: if the emulator has a release-signed build installed (e.g. from
a previous Play Store internal-testing push) and you install a differently-signed debug
build (or vice versa), you get:

```
INSTALL_FAILED_UPDATE_INCOMPATIBLE: ...signatures do not match newer version...
```

This is the same "uninstall before installing" situation documented for Victor's
manual testing. On the emulator it's safe to just uninstall and reinstall:

```bash
timeout 30 "$ADB" uninstall com.lemuelinchrist.android.hymns </dev/null
timeout 60 "$ADB" install -r "$(wslpath -w "$APK")" </dev/null
```

## Launch and screenshot

```bash
timeout 15 "$ADB" shell am start -n com.lemuelinchrist.android.hymns/.HymnsActivity </dev/null
sleep 2
timeout 30 "$ADB" shell screencap -p /sdcard/screen.png </dev/null
timeout 30 "$ADB" pull /sdcard/screen.png "C:\Users\lemue\AppData\Local\Temp\claude_test\screen.png" </dev/null
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
timeout 10 "$ADB" shell wm size </dev/null      # e.g. Physical size: 1344x2992
timeout 10 "$ADB" shell wm density </dev/null   # e.g. Physical density: 480
```

## Driving the UI

```bash
timeout 15 "$ADB" shell input tap <x> <y> </dev/null
timeout 15 "$ADB" shell input text "422" </dev/null         # types into a focused text field
timeout 15 "$ADB" shell input keyevent 4 </dev/null         # back button
timeout 15 "$ADB" shell input swipe <x1> <y1> <x2> <y2> <duration_ms> </dev/null   # scroll/drag
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
