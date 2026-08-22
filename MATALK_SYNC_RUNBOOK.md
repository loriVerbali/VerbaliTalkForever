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
| `ios/Matalk.xcodeproj/project.pbxproj` (now `ios/MatalkForever.xcodeproj/`) | Both sides touched the project file; Matalk bumps `CURRENT_PROJECT_VERSION` / `MARKETING_VERSION` (e.g. 3 / 34) | Keep ours (Forever versions its own builds, e.g. 1 / 3.0), then hand-apply any *structural* changes from Matalk (new source files, resources) — see §5 |
| `src/Views/Onboarding.tsx` | Matalk's version has the `subscription` onboarding step | Take Matalk's feature changes, then delete: the `Subscription` import, `SUBSCRIPTIONSKIP`, the `subscription` step object (leave `// Removed subscription step - this is a paid app`), `gotSubscription` state, the subscription `useEffect`, the deferred-navigation special case, and the whole `case 'subscription-selection'` render branch |
| `src/Views/Settings.tsx` | Matalk's subscription section vs Forever's stripped version | Keep ours for the subscription section; take Matalk's new feature sections (e.g. Personal Memory) — `showAccountSettings` must default `true` |

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
- `TermsAndConditions.tsx` — Forever's one-time-license text, not subscription terms.
- `Subscription.tsx` — Forever keeps a de-trialed orphan copy (not rendered anywhere); don't let Matalk's trial version replace it.
- `recieptValidation.ts` — Forever's paid-app receipt handling.

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
3. Commit `Podfile.lock`, `yarn.lock`, and pbxproj changes.

## 7. Verify

- `tsc` / `lint` / `jest` — **compare against Matalk's baseline, not zero**: both repos share identical pre-existing failures (the `App.test.tsx` suite fails in both).
- Build and run the iOS app (`Matalk.xcworkspace`, scheme `MatalkForever`); walk Onboarding end-to-end — there must be **no plan-selection step** and no paywall on entry (Open → Convo).
- Check Settings: new feature sections present, no subscription/manage-plan section, account settings visible.
- Confirm `.env`, `MaTalkStore.storekit`, `player.js`, `trialUtils.ts` are absent from `git status` / the tree.

## 8. If the sync lands as two Matalk PRs (like last time)

The 2026-08 sync merged Matalk in two steps: first PR #38 (intake) at `05b6cec`, then PR #39 (memory) at `46484b7`. The second merge conflicted only on `project.pbxproj` (version numbers — keep ours) and `Settings.tsx` (keep ours header, take new feature UI). Repeat §2–§6 for each step; the second pass is much smaller.
