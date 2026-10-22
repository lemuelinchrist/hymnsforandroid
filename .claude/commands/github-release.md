---
description: Build the release artifacts and create a draft GitHub release, following this repo's established release pattern.
---

Create a GitHub release draft for the current version, following the exact pattern used for past releases (v4.23 through v5.4.6). The authoritative process is documented in `AGENTS.md` under "Publishing a GitHub Release" — read that section first if it's been a while, in case it's drifted from what's below.

Arguments (optional): $ARGUMENTS — a short description for the release title (e.g. "Bug Fixes", "Greek Hymns Update"). If omitted, propose one yourself based on the changes found in step 2, and confirm it with the user before creating anything.

## Steps

1. **Read the current version.** Get `hymnAppVersion` from `app/build.gradle` (e.g. `"v5.7.6"`): that full number is `<version>`, used in the build's file names and in the app itself (for debugging). **The release uses only major.minor**, `<release>` (e.g. `5.7`): the git tag `v<release>`, the title and every mention in the notes (Lemuel 2026-10-22: keep it simple for the public; since v5.7). Confirm a release for `v<release>` doesn't already exist (`gh release view v<release>`) — if it does (an earlier 5.7.x was already released), stop and ask the user how to proceed rather than overwriting.

2. **Survey what changed since the last release**, so the notes are accurate rather than guessed:
   - Find the most recent existing tag (`git tag --sort=-creatordate | head -1`).
   - `git log <last-tag>..HEAD --oneline` to see every commit in scope.
   - Read the current `docs/v5.4/v5.4-report.md`-style planning doc if one exists for this cycle (check `docs/` for a report matching the current version line) — it usually already has a curated, human-readable account of what shipped and why, which is better source material than raw commit subjects.
   - Group the findings into themes a user would care about (new features, bug fixes, content/data corrections, technical/infra changes) — not a raw commit list. Skip purely internal changes (skill docs, this command, CI-irrelevant refactors) unless they affect what a user experiences.

3. **Draft the release notes** in this repo's established style — see `gh release view v5.2` or `gh release view v5.1` for tone/format reference:
   - Emoji section headers (`### 🎉 New`, `### 🐛 Bug Fixes`, `### ✨ Other Improvements`), bullet points, bold lead-ins on each bullet.
   - A `⚠️ IMPORTANT` callout near the top ONLY if there's a real compatibility break the user must act on (e.g. a signing-key change requiring uninstall-before-install) — don't invent one if there isn't.
   - In the footer, before the Google Play line, add the iPhone line **with the web app link written out** (like the Play link): `🍎 iPhone and iPad users: use the web app at https://lemuelinchrist.github.io/hymnsforandroid/ — open it in Safari, tap **Share**, then **Add to Home Screen**; after the first visit it works offline.` (Since v5.6.1 the `...-iOS.html` is no longer attached: Lemuel 2026-10-22, the web app replaces it; he wants the link in this footer every release.)
   - Close with the Google Play link: `📱 The app is also available on Google Play: https://play.google.com/store/apps/details?id=com.lemuelinchrist.android.hymns` (add a "should be live within about a week" note if the Play Console submission is still pending review — ask the user if unsure).
   - Do not add any "Co-authored-by" line to the release notes body itself — that convention belongs in git commit messages/PR descriptions per the current session's attribution instructions, not release notes.

4. **Show the drafted title and notes to the user for confirmation before proceeding** — this is content a real audience will read; don't publish speculative wording without a check.

5. **Build the release artifacts**:
   ```
   ./gradlew clean assembleRelease bundleRelease
   ```
   This produces `app/build/outputs/apk/release/HymnsForAndroidv<version>-PianoAndGuitar.apk` and the `.aab` bundle (the `.aab` is for Play Console, not attached to the GitHub release). The build also runs the `buildIosHymnal` task (`app/build/outputs/ios/HymnsForAndroidv<version>-iOS.html`); it is **not attached** to the release any more, so a `buildIosHymnal skipped` warning does not matter.

6. **Tag and push**:
   ```
   git tag v<release>
   git push origin v<release>
   ```

7. **Create the draft release** with the APK attached:
   ```
   gh release create v<release> \
     "app/build/outputs/apk/release/HymnsForAndroidv<version>-PianoAndGuitar.apk" \
     --draft \
     --title "v<release> - <short description>" \
     --notes-file <path to the drafted notes>
   ```
   Note: `gh release view` on a still-draft release shows an `untagged-...` URL — this is normal GitHub behavior for unpublished drafts, not an error; it resolves to the real tag URL once published.

8. **Report the draft URL back to the user** and ask whether to publish now (`gh release edit v<release> --draft=false`) or leave it as a draft for further review — don't auto-publish without asking, even though past releases were typically published shortly after drafting.

9. **After publishing, redeploy the web app from master.** Publishing a release runs `.github/workflows/web-app.yml` on the release's tag, which rolls the web app back if master has newer web changes (or a tag made on an older commit). Run `gh workflow run web-app.yml --ref master` right away: the workflow's concurrency group cancels the tag's run. Check with `gh run list --workflow web-app.yml --limit 3`.
