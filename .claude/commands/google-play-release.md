---
description: Build the release bundle for Google Play (test channel or production) and write the Play Console release notes.
---

For uploading the app to Google Play (a test channel such as internal testing, or production). The GitHub release is a separate step: `/github-release`.

Arguments (optional): $ARGUMENTS: what to stress in the notes.

## Steps

1. **Version.** Every upload needs a new version (`hymnAppVersion` in `app/build.gradle`): bump the patch number first if the current one has already been uploaded (see the memory note about bumping on every republish). Commit the bump.
2. **Build** (slow, run it in the background): `./gradlew clean assembleRelease bundleRelease`. The upload file is `app/build/outputs/bundle/release/HymnsForAndroidv<version>-PianoAndGuitar.aab`.
3. **Release notes.** Every time you produce a release build, end your report with the Play Console release notes in exactly this form, in a code block so Lemuel can paste them (Lemuel 2026-11-03):
   ```
   <en-US>
   short plain-text notes: what changed for users, one line per change, no emoji or markdown
   </en-US>
   ```
   Play allows at most 500 characters in all inside the tags: count them and cut until they fit. Source: `git log <last released tag>..HEAD`, and only what a user notices. Add a `<xx-XX>` block per other language only if he asks.
4. **Report** the path of the `.aab`, the version, and the notes. Uploading to the Play Console is done by Lemuel.
