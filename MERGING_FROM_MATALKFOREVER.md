# Merging matalkforever `develop` into VerbaliTalkForever

This repo is the **adult** fork of [matalkforever](https://github.com/loriVerbali/matalkforever).
Everything should behave exactly like upstream **except** the differences in
[Adult invariants](#adult-invariants) below.

Upstream is merged in periodically. This is the runbook.

> First done 2026-08-16 in merge commit `1e261b0`. That merge took ~10 conflicts and
> surfaced 4 bugs that a clean merge would have shipped silently. Read
> [What auto-merge gets wrong](#what-auto-merge-gets-wrong) before starting.

---

## 0. One-time setup

```bash
git remote add matalk https://github.com/loriVerbali/matalkforever.git
```

`origin` is VerbaliTalkForever. `matalk` is upstream. Don't confuse them.

---

## 1. The merge

```bash
git fetch matalk
git checkout -b sync-$(date +%Y%m%d)      # never merge straight onto a branch you care about
git merge matalk/develop --no-commit --no-ff
```

**The histories are already joined.** Merge commit `1e261b0` records `matalk/develop`
as a real second parent, so `matalk/develop` is a true ancestor of this repo now.
Expect an ordinary 3-way merge.

<details>
<summary>If git says "refusing to merge unrelated histories"</summary>

That means upstream rewrote history again. Do **not** use
`--allow-unrelated-histories` — it conflicts on ~557 files because with no merge
base every differing file is a conflict.

Instead find a commit whose tree is identical on both sides and graft it:

```bash
# find the closest upstream commit to some local commit
for c in $(git rev-list matalk/develop -n 60); do
  echo "$(git diff --name-only $c <local-sha> -- src | wc -l) $c $(git log -1 --format=%s $c)"
done | sort -n | head

# confirm the trees actually match, then graft
git rev-parse <local-sha>^{tree}  # must equal:
git rev-parse <upstream-sha>^{tree}
git replace --graft <local-sha> <upstream-sha>
```

This is how the 2026-08-16 merge went from 557 conflicts to 10.
**Delete the graft after committing** (`git replace -d <local-sha>`) — it is a
local-only ref that makes your history view differ from everyone else's.
</details>

---

## 2. Resolve conflicts

Rules that held up last time:

| area | resolution |
|---|---|
| `ios/*.xcodeproj/project.pbxproj` | **Keep ours** (`git checkout --ours`). The two projects build different targets (`VerbaliTalkForever` vs `matalkforever`) with different native stacks. Never line-merge a pbxproj. |
| `android/app/build.gradle` | Keep our `applicationId` / `versionName`, take upstream's higher `versionCode`. |
| `.gitignore` | Union both sides. |
| Card rendering | Ours — see [Adult invariants](#adult-invariants). |
| `ios/matalkaiforever.verbali.io/*.swift` | Dead here — our target compiles `ios/AppDelegate.swift`. Port upstream's edits to `ios/AppDelegate.swift`; `git mv` any *new* source (2026-10-23: `SceneDelegate.swift`) to `ios/` and register it in `VerbaliTalkForever.xcodeproj` by hand. See [Traps](#6-traps). |
| `android/app/src/main/java/com/verbali/matalkai/*.kt` | Take upstream's code, but `package verbalitalk.io.verbali` (must equal the gradle `namespace` — the manifest uses relative `.MainActivity`) and `getMainComponentName() = "VerbaliTalkForever"` (must equal `app.json` `name`). |
| Everything else | Theirs, unless it collides with an invariant. |

**Deleted-by-us conflicts (`DU`)**: our iOS restructure moved app sources from
`ios/matalkaiforever.verbali.io/` up to `ios/`. Keep our deletion. But if upstream
adds a *native asset* under a deleted path (e.g. a speech model), restore it:
`git checkout matalk/develop -- <path>`.

---

## 3. Adult invariants

Check every one of these after the merge. Most auto-merge correctly; the ones
marked ⚠️ have silently reverted before.

**API** — `src/utils/config.ts`
- `/answers/generate-adult`, not `/answers/generate`
- `baseUrl` intentionally **follows upstream** (currently `matalkapi-copy-nologin`)

**Text-only cards.** The app shows words, never pictures:
- `Feelings.tsx` / `ShortCuts.tsx` word grids render `<Text>` only, font `88/72` and `60/48`.
  ShortCuts' 5 *category header* tiles keep their images — that is intended.
- `Open.tsx` — the adult-only `isPepeCard()` gate (doesn't exist upstream): user-added
  "Pepe" cards keep images; `default_` / `../assets/` / `http` render as text.
  Also keeps its own `yesNoCard` shadow tuning.
- `My8WordsCustomizer.tsx` — image search stays removed; new words save `imageUrl: ''`.
- `SentenceBuilderGrid.tsx` ⚠️ — word and folder cards render the word filling the
  card. No image branch, no label strip underneath.
- `VerbiSuggestionTile.tsx` ⚠️ — word fills the tile. No `FastImage`, no label strip.
- `EditModal.tsx` ⚠️ — no image search; words are **typed** (`name.trim()`), not picked
  from the library.

**Other adult deltas**
- `MyPepesAndStuff.tsx` — category is **Medicine** (Pills, Inhalers, Prescription…),
  not upstream's **Toys**.
- 5 extra avatars in Onboarding + Settings: `oman`, `obman`, `owwoman`, `obwoman`, `aowoman`.
- Keyboard text is `isTablet ? 48 : 32` with `72/56` buttons, not upstream's flat `18`/`40`.
- Verbi predictions send `isAdult: true` (`useVerbiPrediction.ts`).
- `Home.tsx` `resolvePepesImage` lists `Medicine`, not upstream's `Toys` (unified Home since 2026-10-23).

**Identity** — `applicationId verbalitalk.io.verbali`, `versionName VERBALITALKV1`,
`ios/VerbaliTalkForever.xcodeproj`. Never take MatalkForever branding.
Also: Kotlin `package verbalitalk.io.verbali` + `getMainComponentName() = "VerbaliTalkForever"`;
iOS `startReactNative(withModuleName: "VerbaliTalkForever")` (in `ios/SceneDelegate.swift` since 2026-10-23);
`src/utils/appIdentity.ts` `APP_KEY = 'verbali_talk_forever'` (upstream: `matalk_forever`) — the backend's
accepted keys are in `matalkapi/services/appUpdate/appUpdate.service.js`, and
`__tests__/appUpdateService.test.ts` asserts the value.

> Image **assets** are still in the repo (28 feelings, 41 shortcuts) — just unimported.
> Re-enabling images is a code change, not an asset restore.

---

## 4. What auto-merge gets wrong

Every one of these was a real bug in the 2026-08-16 merge. They compile and bundle
fine; they break at runtime or silently degrade behaviour.

**Deleted modules still called.** Upstream removed `AudioSessionManager` (native + JS)
in the DaVoice migration, but our side of the `Open.tsx` conflict still called
`AudioSessionManager.prepareForTTS()`. Would have crashed on tap.
→ After resolving, grep for identifiers upstream deleted.

**Image gates that block behaviour, not just pixels.** `SentenceBuilderGrid` had
`if (isPlaceholderImage(node.imageUri)) return;` — a word with a placeholder image
refused to speak and showed a "add an image in Settings" modal, pointing at a flow
that no longer exists in this build.
→ Grep for `isPlaceholderImage` and any early-return keyed on an image.

**Server-side image filters.** `verbi.prediction.js processSuggestions` drops any
predicted word with no picture in `word_image` unless `isAdult` is set. In a
text-only app that silently deletes vocabulary.
→ Keep `isAdult: true` in the prediction request.

**Required-image save paths.** `EditModal.handleSave` used to *require* an API image
selection and read the title from it. Stripping the search without rewriting the
save path makes adding a word impossible.
→ After removing any image picker, check what the save path reads.

---

## 5. Verify

`tsc` has **never** passed in this repo (24 pre-existing errors, mostly dead imports
of uninstalled packages). Don't chase a clean run — diff against a baseline instead:

```bash
# baseline from BEFORE your merge
git stash && npx tsc --noEmit 2>&1 | grep "error TS" \
  | sed -E 's/\([0-9]+,[0-9]+\)//' | sort -u > /tmp/base.txt && git stash pop

# after
npx tsc --noEmit 2>&1 | grep "error TS" \
  | sed -E 's/\([0-9]+,[0-9]+\)//' | sort -u > /tmp/after.txt
comm -23 /tmp/after.txt /tmp/base.txt   # empty == no regressions
```

This is what caught two `Cannot find name` bugs the bundler happily ignored.

**Bundle both platforms** — the real check that the JS tree resolves. Platform-specific
files (`*.ios.tsx` / `*.android.tsx`) are only compiled for their own platform, so one
bundle proves nothing about the other:

```bash
npx react-native bundle --entry-file index.js --platform ios \
  --dev true --bundle-output /tmp/ios.jsbundle --assets-dest /tmp/a
npx react-native bundle --entry-file index.js --platform android \
  --dev true --bundle-output /tmp/and.jsbundle --assets-dest /tmp/b
```

**Native build**, if anything under `ios/` changed:

```bash
cd ios && pod install
xcodebuild -workspace VerbaliTalkForever.xcworkspace -scheme VerbaliTalkForever \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5)' build
```

A Debug simulator build defers bundling to Metro, so **it does not validate your JS** —
it only proves the native side links. You need both.

Then actually run it. Bundling proves nothing about layout or whether DaVoice speaks.

---

## 6. Traps

**Check what's reachable before editing it.** `src/Components/SentenceBuilder/` had 9
files; only 3 were live. `FolderCard`, `WordCard`, `SentenceBar`, `Breadcrumb`, `AddCard`
were imported by nothing (now deleted). `Login.tsx` is commented out of the navigator and
imports `react-native-auth0`, which isn't in `package.json` — so all `/get-assistant`,
`/make-assistant`, `/delete-assistant` calls are dead code.

```bash
grep -rn "ComponentName" src/ | grep -v "^src/path/to/ComponentName.tsx"
```

**Don't truncate audit greps.** A `| head -20` hid `SentenceBuilderGrid.tsx` — the main
word grid — during the image audit, and it shipped with images for a full round trip.

**The backend is checked out locally** at `../MatalkBE/matalkapi`. Read it instead of
guessing. It has a full adult mode: `/answers/generate-adult`,
`/get-assistant-adult-mode`, `/make-assistant-adult-mode`, `/delete-assistant-adult`
(separate `user_assistants_adult` table, `AssistantDefs/currentAdult.json` persona),
and `isAdult` on `/v1/verbi/predictions`.

**Deployment ≠ source.** The backend repo having a route says nothing about whether
`matalkapi-copy-nologin` is running that build. Verify against the live host.

**Two AppDelegates, one compiled.** Git follows the
`ios/matalkaiforever.verbali.io/Info.plist → ios/Info.plist` rename but not the AppDelegate
one, so upstream's AppDelegate edits land in the dead `ios/matalkaiforever.verbali.io/`
folder while their Info.plist edits land in the live `ios/Info.plist`. On 2026-10-23 that put
the UIScene manifest in the live plist and `SceneDelegate.swift` in the dead folder — a black
screen at launch, had it shipped. The dead AppDelegate is deleted now (next time it is a `DU`
conflict: keep our deletion), but any *new* native source upstream adds under that folder still
has to be moved to `ios/` and added to the pbxproj (file ref, build file, group child, Sources
phase — four edits, fresh 24-hex ids).
→ After the merge: `git status -- ios/matalkaiforever.verbali.io` must show nothing you want compiled.

**The update popup is silently off here.** `appUpdateService.checkForUpdatePopup()` only runs
when `DeviceInfo.getVersion()` is a plain integer (`/^\d+$/`). Ours are `MARKETING_VERSION = 6.2`
and `versionName "VERBALITALKV1"`, so the popup never evaluates. Upstream switched to integer
versions for exactly this (`f8dc7fd`: iOS 4 / Android "4"). Making ours integers is a
release-train decision, not a merge step — but until then the backend's `verbali_talk_forever`
policy does nothing.

**Upstream's `'Toys'` is our `Medicine` — only partly.** `Home.tsx` and `MyPepesAndStuff.tsx` say
Medicine; `pepesUtils.ts`, `ProfileExportService.ts`, `ProfileImportService.ts`,
`My8WordsCustomizer.tsx` and `TellUsMore/*` still say Toys (pre-existing, not from a merge), so
profile export/import skips Medicine pepes. Not touched on 2026-10-23 — out of merge scope.

---

## 7. Sync log

| Date | Upstream range | Branch | Conflicts | Notes |
|---|---|---|---|---|
| 2026-08-16 | → `0127b0e` | `upgrademe`, merge `1e261b0` | 10 (after graft) | First merge. Surfaced the four runtime bugs in §4. |
| 2026-10-23 | `0127b0e` → `5cf008b` (42 commits) | `sync-matalk-20261023` | 11: `build.gradle`, `gradle-wrapper.jar`, `Podfile.lock`, pbxproj, `EditModal`, `SpecialPlaces`, `TermsAndConditions`, `Home.android.tsx` (modify/delete — deleted, Medicine ported to the unified `Home.tsx`), `KeyboardHome.{ios,android}`, `Open.tsx` (upstream moved styles into `createStyles(width,height)`; our adult style deltas re-applied inside it) | RN 0.82 → 0.86.2 (reanimated 4 / worklets / nitro), IEP progress dashboard, start-up update popup (`APP_KEY = verbali_talk_forever`), iOS 27 UIScene life cycle (`SceneDelegate.swift`, ported by hand — see §6), unified `Home.tsx`, Terms accept button (disclaimer re-branded), Gradle 9.3.1 / Kotlin 2.4.10 / arm64-only Android, Whisper / `react-native-tts` / `Subscription.tsx` / `recieptValidation.ts` removed upstream. `versionCode` 26 → 30. tsc: no new errors vs upstream's baseline (ours adds only the dead `soundContext.tsx`). iOS + Android bundles OK. jest 48/50 suites — `App.test.tsx` and `iep/mock/mockAudit.test.ts` fail upstream too (the latter needs the gitignored `docs/` fixtures). Native: `pod install` stopped on `hermes-engine` because `Pods/Local Podspecs` was still RN 0.82's — `pod update hermes-engine --no-repo-update` fixed it; the lock then differs from upstream's only in the hermes checksum and `PODFILE CHECKSUM`. Xcode 27 Debug simulator build of scheme `VerbaliTalkForever` succeeded and the app launches to Onboarding on iPad Pro 13-inch (M5) under the UIScene life cycle. If the MatalkForever Metro is holding port 8081, run ours on 8082 and point the simulator app at it: `xcrun simctl spawn <sim> defaults write verbalitalkforever.verbali.io RCT_jsLocation localhost:8082` (delete the default afterwards). Android was not built — no disk headroom. |
