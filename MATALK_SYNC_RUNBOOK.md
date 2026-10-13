# Runbook: Syncing Matalk → MatalkForever

MatalkForever is the **paid-upfront** twin of `../Matalk` (the **subscription** version). They share git history and are synced by cross-repo merges. The rule of the sync:

> **Feature functionality flows in. Subscription/trial/paywall code and Matalk's app identity do not.**

This runbook is reconstructed from the 2026-08 sync (merges `05131e4` and `75eb8f8`, PR #13), including what auto-merged, what conflicted, what was hand-edited during the merge, and what had to be fixed afterwards.

---

## 0. Setup and pre-flight

- Remote is already configured: `matalk → /Users/lori/Documents/Dev/Matalk/Matalk`.
- **Fetch Matalk's `origin/develop`, not its local `develop`** (the local branch lags):
  ```sh
  git fetch matalk +refs/remotes/origin/develop:refs/remotes/matalk/develop
  ```
- Create a working branch and a backup:
  ```sh
  git checkout -b <feature-sync-branch> develop
  git branch backup/pre-matalk-merge
  ```
- Node **22.17.0** (`.nvmrc`; installed via nvm). Local `.env` must contain `DAVOICE_LICENSE` (copy value from `../Matalk/.env` — but never commit the file, see §3).

## 1. Merge without committing

```sh
git merge --no-commit matalk/develop
```

## 2. Expected conflicts (from the last sync)

Both real conflicts were resolved **keep-ours**:

| File | Cause | Resolution |
|---|---|---|
| `ios/Matalk.xcodeproj/project.pbxproj` (now `ios/MatalkForever.xcodeproj/`) | Both sides touched the project file; Matalk bumps `CURRENT_PROJECT_VERSION` / `MARKETING_VERSION` (e.g. 3 / 34) | Keep ours (Forever versions its own builds, e.g. 2 / 4 — MARKETING_VERSION must stay a plain integer, see §7), then hand-apply any *structural* changes from Matalk (new source files, resources) — see §5 |
| `src/Views/Onboarding.tsx` | Matalk's version has the `subscription` onboarding step | Take Matalk's feature changes, then delete: the `Subscription` import, `SUBSCRIPTIONSKIP`, the `subscription` step object (leave `// Removed subscription step - this is a paid app`), `gotSubscription` state, the subscription `useEffect`, the deferred-navigation special case, and the whole `case 'subscription-selection'` render branch |
| `src/Views/Settings.tsx` | Matalk's subscription section vs Forever's stripped version | Keep ours for the subscription section; take Matalk's new feature sections (e.g. Personal Memory) — `showAccountSettings` must default `true` |
| `android/app/build.gradle` | Matalk bumps `versionCode` (29→32 in 2026-08-30) and may change *functional* lines in the same hunk (2026-08-30: `abiFilters` → `arm64-v8a` only, matching `gradle.properties`) | Keep ours (`versionCode` and the integer `versionName` are Forever's own train), then hand-apply the functional change |
| `src/Views/Home.tsx` | 2026-10-12: Forever's copy is prettier-formatted (`{useDatabase}`), Matalk's has `{ useDatabase }` plus a new `iepCapture` import on the next line | Take Matalk's hunk (both imports); the rest of the file auto-merges |
| `ios/Podfile.lock`, `yarn.lock` | Both sides regenerated them | Never hand-merge. `yarn.lock`: if the merged `package.json` differs from Matalk's only in name/version/scripts (`git diff matalk/develop -- package.json`), take Matalk's (`git checkout --theirs -- yarn.lock`) — `yarn install` must then be a no-op. `Podfile.lock`: keep ours and regenerate (§6) |

git follows the `ios/Matalk.xcodeproj` → `ios/MatalkForever.xcodeproj` and `ios/Matalk/Info.plist` → `ios/matalkaiforever.verbali.io/Info.plist` renames, so Matalk's edits to those land in Forever's files (as a conflict or an auto-merge).

Everything else auto-merges — but the auto-merge result is **not** shippable. Continue below before committing.

## 3. Never let in (delete while still in `--no-commit`)

These arrived via auto-merge last time and were removed by hand before committing:

```sh
git rm -f --cached .env                       # Matalk tracks it — contains secrets
git checkout HEAD -- .env 2>/dev/null || rm -f .env   # keep local untracked copy if you have one
git rm -f ios/MaTalkStore.storekit            # StoreKit config — subscription-only
git rm -f src/utils/player.js                 # contains a leaked sk-proj- key
git rm -f src/utils/trialUtils.ts             # trial logic — no trials in Forever
```

## 4. Keep-ours identity list (restore from HEAD while still in `--no-commit`)

> **Diff before you restore.** Run `git diff develop -- <file>` on the auto-merged result first and restore only files whose identity hunks actually got clobbered. A blanket restore silently drops functional hunks: `TermsAndConditions.tsx` (2026-08-22, accept button), `ios/Podfile` (2026-10-12: the auto-merge correctly kept target `'matalkforever'` *and* took Matalk's new prebuilt-binaries `post_install` block — a restore would have dropped it), `package.json` (new deps). In 2026-10-12 none of the auto-merged files on this list needed restoring.

```sh
git checkout HEAD -- \
  app.json \
  package.json \
  ios/Podfile \
  ios/Matalk.xcworkspace/contents.xcworkspacedata \
  ios/matalkaiforever.verbali.io/ \
  src/Components/TermsAndConditions.tsx \
  src/Components/Subscription.tsx \
  src/utils/recieptValidation.ts \
  src/utils/config.ts \
  src/utils/appIdentity.ts \
  android/app/build.gradle \
  android/app/src/main/AndroidManifest.xml \
  android/app/src/main/res/values/strings.xml \
  android/app/src/main/java/com/verbali/matalkai/MainActivity.kt
```

Notes on why each:
- `app.json`, android files — Forever app name/bundle identity.
- `ios/MatalkForever.xcodeproj/` — Matalk's tree still names it `Matalk.xcodeproj`; keep Forever's renamed project, scheme (`MatalkForever.xcscheme`), `matalkforever-Bridging-Header.h`, `matalkforever.entitlements`. `Matalk.xcworkspace` points at `MatalkForever.xcodeproj`.
- `ios/matalkaiforever.verbali.io/` — Forever's app target folder (AppDelegate, Info.plist, `MaTalkForever.jpg` icons).
- `ios/Podfile` — target is `'matalkforever'`.
- `package.json` — keep Forever's name/version and the `copyHermes` / `deleteDerivedData` scripts; **do** take Matalk's new dependencies (last time: memory deps, posthog).
- `TermsAndConditions.tsx` — keep Forever's one-time-license **text** (title "MaTalk AI Forever", §payment "one time license fee", the extra license sections), but **take Matalk's component mechanics**. A blanket keep-ours here silently dropped Matalk `5243795` (2026-08-22: scroll-to-bottom checkbox → top "I Accept" button + `onAccept` prop, which Onboarding already wires to `handleNext`); it had to be back-ported on 2026-08-30. Recipe: `git diff <base> matalk/develop -- src/Components/TermsAndConditions.tsx > /tmp/t.diff && patch -p1 -F3 < /tmp/t.diff`, then eyeball the text hunks.
- `Subscription.tsx` — Forever keeps a de-trialed orphan copy (not rendered anywhere); don't let Matalk's trial version replace it.
- `recieptValidation.ts` — Forever's paid-app receipt handling.
- `config.ts` — Matalk's develop periodically lands with `baseUrl` flipped to a LAN dev IP (`http://192.168.1.175:3000`, 2026-08-30). Keep ours and confirm `baseUrl` is the railway URL; hand-apply only *new* config keys.
- `appIdentity.ts` — `APP_KEY` must be `'matalk_forever'` (Matalk's is `'matalk'`). It selects the backend update-popup policy; accepted keys live in MatalkBE `matalkapi/services/appUpdate/appUpdate.service.js`. `__tests__/appUpdateService.test.ts` asserts the value twice (the `APP_KEY` describe block and the end-to-end URL check `appKey=${APP_KEY}&platform=ios`, which Matalk hardcodes as `appKey=matalk`) — fix the assertions, not the key.

## 5. Subscription strip on newly arrived code (the "functionality yes, subscriptions no" pass)

After the identity restore, grep the merged tree and strip gating that came in with new features. Where a guard is removed, leave the marker comment `// This is a paid app - always allow navigation`.

Known guard locations (from commit `f2a87cc`):
- **`src/Views/Open.tsx`** — `hasAppAccess` + `askForAdultHelp` gating. Remove the gate, always allow through.
- **`src/Views/Onboarding.tsx`** — subscription step (see §2).
- **`src/Views/Settings.tsx`** — subscription/manage-plan section; `showAccountSettings` defaults `true`.
- **`src/Views/Login.tsx`** — trial-date sync on login. Remove.
- **`src/utils/fetcher.ts`** — `__DEV__` receipt stub. Remove.
- **`src/utils/trialUtils.ts`** — delete the whole file (§3) and every import of it.
- **`src/Views/Convo.tsx` is never guarded directly** — don't add or expect guards there.

Sweep for stragglers before committing:
```sh
grep -rn --include='*.ts*' -e trialUtils -e hasAppAccess -e 'subscription' -e SUBSCRIPTIONSKIP src/ | grep -v Subscription.tsx
```

Then commit the merge (message pattern: *"Merge Matalk develop (…) — keep MatalkForever identity"*).

## 6. Post-merge native follow-ups (these were separate commits last time)

1. **Xcode project surgery** (`4b31309`): make sure new native resources from Matalk (last time: DaVoice models) are added to `MatalkForever.xcodeproj` resources, and stale references removed (last time: sherpa/espeak files, `AudioSessionManager*` were deleted upstream — remove their pbxproj references and AppDelegate calls too).
2. **Regenerate lockfiles** (`aeef240`):
   ```sh
   yarn install
   cd ios && pod install   # new native deps come via autolinking
   ```
   - If `pod install` stops with *could not find compatible versions* for a pod pinned in our `Podfile.lock`, a JS dependency bump raised its native requirement — unlock just that pod: `pod update <Pod>` (2026-10-12: `pod update Mixpanel-swift`, 6.5.0 → 6.8.0 for mixpanel-react-native 3.8.1).
   - Then compare with Matalk's lock and align drifted pods so both apps build the same native stack: `git diff --no-index <(git show matalk/develop:ios/Podfile.lock) ios/Podfile.lock` (2026-10-12: `pod update SDWebImage SDWebImageWebPCoder libwebp`). Expected residual diff: the `hermes-engine` checksum and `PODFILE CHECKSUM` only.
   - `pod install` also normalizes `MatalkForever.xcodeproj/project.pbxproj` (drops empty `inputPaths`/`outputPaths`, rewrites `OTHER_LDFLAGS` as an array) — commit that too.
3. Commit `Podfile.lock`, `yarn.lock`, and pbxproj changes.

## 7. Verify

- `tsc` / `lint` / `jest` — **compare against Matalk's baseline, not zero**: both repos share identical pre-existing failures (the `App.test.tsx` suite fails in both).
- `__tests__/iep/mock/mockAudit.test.ts` (since 2026-10-12) reads CSV fixtures from the gitignored `docs/iep-dashboard-agent-package/mock-data/` and fails with ENOENT on a fresh checkout of either repo. Copy that folder from `../Matalk/docs/` to run it locally (it stays ignored).
- Settings → Reports: the full-width purple **IEP Progress** card must open the IEP dashboard (`views.IEP_DASHBOARD`).
- Build and run the iOS app (`Matalk.xcworkspace`, scheme `MatalkForever`); walk Onboarding end-to-end — there must be **no plan-selection step** and no paywall on entry (Open → Convo).
- Check Settings: new feature sections present, no subscription/manage-plan section, account settings visible.
- Confirm `.env`, `MaTalkStore.storekit`, `player.js`, `trialUtils.ts` are absent from `git status` / the tree.
- **App versions must stay plain integers** (since 2026-08-30: iOS `MARKETING_VERSION = 4`, Android `versionName "4"`): `appUpdateService.checkForUpdatePopup()` parses `DeviceInfo.getVersion()` with `/^\d+$/` and silently disables the popup for anything else (the old `3.0.1` / `MATALKFOREVERV3` did exactly that). Bump the integer by 1 on both platforms per store release; the backend `minimumPopupBuild` for `matalk_forever` compares against it. `CURRENT_PROJECT_VERSION` / `versionCode` remain the ordinary store build counters.

## 8. If the sync lands as two Matalk PRs (like last time)

The 2026-08 sync merged Matalk in two steps: first PR #38 (intake) at `05b6cec`, then PR #39 (memory) at `46484b7`. The second merge conflicted only on `project.pbxproj` (version numbers — keep ours) and `Settings.tsx` (keep ours header, take new feature UI). Repeat §2–§6 for each step; the second pass is much smaller.

## 9. Sync log

| Date | Matalk range | Branch / PR | Conflicts | Notes |
|---|---|---|---|---|
| 2026-08-13 | → `46484b7` | `intake-and-memory`, PR #13 | pbxproj, Onboarding, Settings | intake + personal memory + DaVoice |
| 2026-08-2x | → `abf289e` | `updateAug1`, PR #15 | — | Android upgrade / RN 0.86.2 |
| 2026-08-30 | `abf289e` → `7e82143` (PRs #42, #43) | `sync-matalk-2026-08-30` | pbxproj, Onboarding, Subscription, `android/app/build.gradle` (all keep-ours; abiFilters hand-applied) | start-up update popup (`appUpdateService`, `AppUpdateModal`, `APP_KEY=matalk_forever`), ParentalGate phone layout, Android arm64-only + KSP pin, DaVoice/wakeword bumps + postinstall Fix 6. Dropped: `android/build.log`, dev `baseUrl`. Follow-up commits: integer app versions (iOS 4 / Android "4") so the popup can evaluate them; back-port of Matalk `5243795` Terms redesign (accept button, no scroll gate) missed by the 2026-08-22 keep-ours. |
| 2026-10-12 | `7e82143` → `00a2c42` (PR #44, IEP) | `sync-matalk-2026-10-12` | `build.gradle`, pbxproj, `Podfile.lock`, `yarn.lock` (keep-ours / regenerate), `Home.tsx` (import hunk, take Matalk's) | IEP progress dashboard (`src/features/iep`, Settings "IEP Progress" card, session-evidence capture in Home/Convo/SentenceBuilder/Verbi/KeyboardHome, profile export/import of `Documents/iep`), Podfile prebuilt-binaries workaround, new deps pdf-lib / react-native-svg / @types/node, DaVoice TTS 1.0.403 + wakeword 1.1.162. No subscription gating arrived; no pbxproj structural changes. `Podfile.lock` needed `pod update Mixpanel-swift`; image pods aligned to Matalk. tsc identical to Matalk's baseline (31 pre-existing errors); jest at parity (`App.test.tsx` only) once `docs/` fixtures were copied. iOS Debug simulator build of scheme `MatalkForever` succeeded (Xcode 27.0). |
