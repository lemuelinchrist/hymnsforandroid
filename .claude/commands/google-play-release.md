---
description: Build the release bundle for Google Play (test channel or production) and write the Play Console release notes.
---

For uploading the app to Google Play (a test channel such as internal testing, or production). The GitHub release is a separate step: `/github-release`.

Arguments (optional): $ARGUMENTS: what to stress in the notes.

## Steps

1. **Version.** Every upload needs a new version (`hymnAppVersion` in `app/build.gradle`): bump the patch number first if the current one has already been uploaded (v5.9.3 -> v5.9.4; a rebuild after a failed upload counts too), so builds can be told apart in About and by file name. Commit and push the bump.
2. **Build** (slow, run it in the background): `./gradlew assembleRelease bundleRelease` (no `clean` unless a stale build is suspected: it adds about 2 minutes). The upload file is `app/build/outputs/bundle/release/HymnsForAndroidv<version>-PianoAndGuitar.aab`. If you build in a separate worktree, copy the `.aab` and `.apk` into the **main checkout's** `app/build/outputs/bundle/release` and `apk/release`: Lemuel uploads from there.
3. **Release notes.** Every time you produce a release build, end your report with the Play Console release notes in exactly this form, in a code block so Lemuel can paste them (Lemuel 2026-11-03):
   ```
   <en-US>
   short plain-text notes: what changed for users, one line per change, no emoji or markdown
   </en-US>
   ```
   Play allows at most 500 characters in all inside the tags: count them and cut until they fit. Source: `git log <last released tag>..HEAD`, and only what a user notices. Add a `<xx-XX>` block per other language only if he asks.
4. **Report** the path of the `.aab`, the version, and the notes. Uploading to the Play Console is done by Lemuel.

## Store listing images (`docs/playStore/`)

Phone screenshots must be **9:16 or 16:9**, each side 320-3840 px, PNG/JPEG up to 8 MB: shoot on the Pixel_9_Android16 emulator (1344x2992) and crop to
**1341x2384** from the status bar down, without cutting a row mid-text. The 512 px icon must be **full-bleed** (opaque square): Play rounds it itself.
