# Runbook: Syncing develop → customApp (MaTalk AI Orgs)

This repo ships **two apps from one tree**:

| Branch | App | Bundle id (iOS) | Version train |
|---|---|---|---|
| `develop` | **MaTalk AI Forever** — paid-upfront twin of `../Matalk` | `matalkaiforever.verbali.io` | plain integers (`MARKETING_VERSION = 4`), see `MATALK_SYNC_RUNBOOK.md` §7 |
| `customApp` | **MaTalk AI Orgs** — Forever + organization enrollment | `matalkaiforevercustom.verbali.io` | semver, own counter (`2.6.2` / build `1` as of 2026-10-13) |

Features travel in two hops: `../Matalk` → `develop` (that hop is `MATALK_SYNC_RUNBOOK.md`), then `develop` → `customApp` (this runbook). **Every Matalk sync must be followed by a customApp sync**, otherwise Orgs silently falls behind — before 2026-10-13 it had missed three syncs (2026-08-22, 2026-08-30, 2026-10-12).

The rule of this hop:

> **Everything from develop flows in. Only two things are Orgs-specific and must survive: the iOS identity (3 pbxproj settings) and the organization-enrollment feature.**

The trap: develop **removed** the organization feature, so most Orgs deviations exist as lines that develop *deleted*. Deletions on one side and no change on the other never conflict — git silently takes the deletion. A conflict-resolution pass alone **cannot** catch this (it wiped the feature on 2026-08-15, restored in `1aed29d`). Always run the two-direction check in §4 before committing.

---

## 0. Setup

```sh
git checkout -b sync-customapp-<date> customApp
git branch backup/pre-develop-merge-customApp-<date> customApp
```

- Source to merge: `develop` once the Matalk sync PR has merged, or the `sync-matalk-<date>` branch directly if it hasn't yet (2026-10-13 merged `sync-matalk-2026-10-12`; when that PR merges, develop becomes an ancestor and the next customApp merge is trivial).
- Node **22.17.0** (`.nvmrc`), local untracked `.env` with `DAVOICE_LICENSE` — same as the Matalk runbook.
- Record the org-wiring baseline *before* merging (used in §4):
  ```sh
  git grep -c -E 'org-connect|deviceRevoked|isEnrolled|bootstrapDevice|orgName|OrganizationConnect' customApp -- src/
  ```

## 1. Merge without committing

```sh
git merge --no-commit --no-ff <source>
```

## 2. Expected conflicts (2026-10-13)

| File | Cause | Resolution |
|---|---|---|
| `ios/MatalkForever.xcodeproj/project.pbxproj` | Forever bumps `MARKETING_VERSION` on its integer train; Orgs has `2.6.x`. Structural pod-install changes may conflict too | **Keep ours for the three identity settings, in both the Debug and Release blocks:** `INFOPLIST_KEY_CFBundleDisplayName = "MaTalk AI Orgs"`, `MARKETING_VERSION = 2.6.2` (Orgs train), `PRODUCT_BUNDLE_IDENTIFIER = matalkaiforevercustom.verbali.io`. `CURRENT_PROJECT_VERSION` is Orgs' own build counter. **Take theirs for everything else** (2026-10-13: `PODFILE_DIR = "$(SRCROOT)"`). Afterwards `git diff <source> -- ios/MatalkForever.xcodeproj/project.pbxproj` must show only those 6 identity lines |
| `package.json` | version bumps on both sides | Take theirs. customApp has no dependencies of its own (its `posthog-react-native-session-replay` add is also in develop). `git diff <source> -- package.json` must be empty |
| `ios/Podfile.lock` | regenerated on both sides | `git checkout --theirs -- ios/Podfile.lock`, then `pod install` (§5). Ours is stale by three syncs; theirs was regenerated against the same `Podfile` |
| `yarn.lock` | regenerated on both sides | Auto-merged identical to develop's on 2026-10-13. If it conflicts: take theirs; `yarn install --frozen-lockfile` must then succeed with "Already up-to-date" |
| `src/App.tsx`, `src/Views/Onboarding.tsx`, `src/Views/Open.tsx`, `src/Views/Settings.tsx` | both sides edit these | **Auto-merged** cleanly on 2026-10-13 — but these four carry the org wiring, so they are exactly the files §4 must verify |

## 3. Keep-ours identity list

Only the pbxproj settings above. Everything else that *looks* like identity is **shared with Forever and must flow from develop**: `app.json`, `ios/Podfile` target `'matalkforever'`, `ios/matalkaiforever.verbali.io/` (Info.plist, AppDelegate, icons), `src/utils/appIdentity.ts` (`APP_KEY = 'matalk_forever'`), the Android identity files.

**Display-name quirk (pre-existing, not a merge regression):** `ios/matalkaiforever.verbali.io/Info.plist` hardcodes `CFBundleDisplayName` = `MaTalk AI Forever` (since 2025-12-14), and a key present in the plist wins over the pbxproj's `INFOPLIST_KEY_CFBundleDisplayName = "MaTalk AI Orgs"`. So every Orgs build so far has shown **"MaTalk AI Forever"** on the home screen — confirmed from the built `Info.plist` on 2026-10-13. If Orgs should read "MaTalk AI Orgs", change the plist value on `customApp` and add that line to this keep-list (it will then conflict visibly whenever develop touches it).

**Android:** Orgs has never had its own Android identity. Before 2026-10-13 it carried the *old* Forever id (`com.verbali.matalkai`, `versionName "MATALKFOREVERV3"`); the merge moved it to the Forever id (`versionName "4"`, `versionCode 26`), because customApp never touched `android/app/build.gradle`. **The correct Forever id is `com.verbali.matalkaiforever`** — the Play listing requires it and rejects anything else. Commit `6d09b09` had wrongly renamed it to `com.verbali.matalkforever`; reverted 2026-10-19. If Orgs ever ships on Android it needs its own `applicationId`/`namespace` and label — add them here and to §2 when that happens.

## 4. Organization-enrollment keep-list — verify in BOTH directions

**(a) Merged tree vs the source — must be *only* the Orgs deviations.**

```sh
git diff --stat <source>
```

Expected (2026-10-13), nothing else:

```
HERO_PROFILE_CARD_MIGRATION.md               (obsolete note, see §8)
ios/MatalkForever.xcodeproj/project.pbxproj  (6 identity lines)
src/App.tsx                                  (+24)
src/Components/OrganizationConnect.tsx       (develop keeps it fully commented out)
src/Navigation/RootControllerView.tsx        (+1/-1)
src/Views/Onboarding.tsx                     (+17)
src/Views/Open.tsx                           (+19)
src/Views/Settings.tsx                       (+86)
src/utils/sessionManager.ts                  (+24/-1)
```

Anything *extra* here is a Forever change that got clobbered by keep-ours — restore it from the source.

**(b) Merged tree vs customApp — org wiring counts must match the pre-merge baseline.**

```sh
grep -c -E 'org-connect|deviceRevoked|isEnrolled|bootstrapDevice|orgName|OrganizationConnect' \
  src/App.tsx src/Components/OrganizationConnect.tsx src/Navigation/RootControllerView.tsx \
  src/Views/Onboarding.tsx src/Views/Open.tsx src/Views/Settings.tsx \
  src/utils/persistance.tsx src/utils/sessionManager.ts
```

Baseline (customApp `119087c`, unchanged after the 2026-10-13 merge): `App.tsx` 2, `OrganizationConnect.tsx` 8, `RootControllerView.tsx` 2, `Onboarding.tsx` 6, `Open.tsx` 4, `Settings.tsx` 6, `persistance.tsx` 6, `sessionManager.ts` 9. A lower number means develop's deletion won — re-apply from `customApp` (`git diff <source> customApp -- <file>` shows the hunks).

What each piece is, so you can recognise it in a diff:

- `src/Components/OrganizationConnect.tsx` — the enrollment screen. develop has the whole file commented out; customApp's is live.
- `src/Views/Onboarding.tsx` — `OrganizationConnect` import; `org-connect` step object **after `terms`, before `name`**; `case 'org-connect'` render (calls `handleNext()` on success); global Next button hidden on that step (`currentStepData.id === 'org-connect'` in the hide condition). This is the "subtle onboarding change" — the step has no question text and no Next button of its own, so a lost import or render case shows up as a blank step, not a crash.
- `src/App.tsx` — `checkDeviceStatusRef`; `checkDeviceStatus()` calling `sessionManager.bootstrapDevice()` and speaking "There seems to be an issue please ask an adult for help" on `device_revoked` / `organization_inactive`; awaited at the end of `bootstrap()` and again on foreground after `ensureValidSession()`.
- `src/Views/Open.tsx` — `deviceRevoked` state loaded from `getItem('deviceRevoked')`; if `'1'` the admin modal opens automatically and its title/description switch to "There seems to be an issue / Please ask an adult for help".
- `src/Navigation/RootControllerView.tsx` — `setShowOnboarding(wasOnboarded !== '1' || isEnrolled !== '1')` (un-enrolled devices go back through onboarding).
- `src/utils/sessionManager.ts` — `isEnrolled` reset in `resetSession`; 403 `device_revoked` / `organization_inactive` → `deviceRevoked = '1'`; success path writes `deviceRevoked '0'`, `isEnrolled`, `orgName`.
- `src/Views/Settings.tsx` — the **Account section org card** (🏢, "Connected to <orgName>" / "Not connected", green "Active" pill) and its `org*` styles. There is *no* other org code in Settings.
- `src/utils/persistance.tsx` — keys `deviceRevoked`, `isEnrolled`, `orgName` (develop kept these; low risk).

## 5. Post-merge

```sh
git commit                                   # "Merge <source> into customApp — keep MaTalk AI Orgs identity and org enrollment"
yarn install --frozen-lockfile               # must say "Already up-to-date"
cd ios && pod install && cd ..               # Podfile.lock must come out unchanged (we took develop's)
git diff --stat                              # see below before committing anything
```

`pod install` (and Xcode, in the other direction) rewrite cosmetic pbxproj lines: empty `inputPaths = ( ); outputPaths = ( );` on the `[CP]` phases and `OTHER_LDFLAGS` as string vs array. They are equivalent. **Revert that churn** (`git checkout -- ios/MatalkForever.xcodeproj/project.pbxproj`) so the Orgs pbxproj stays byte-identical to develop's except the 6 identity lines — otherwise every later sync conflicts on them. Commit only real changes (a changed `Podfile.lock`, new native resources).

## 6. Verify

- `npx tsc --noEmit -p .` → **31 errors**, `npx jest` → only `__tests__/App.test.tsx` fails. That is develop's own baseline (Matalk runbook §7); compare against it, not zero. `mockAudit.test.ts` needs the ignored `docs/iep-dashboard-agent-package/mock-data/` CSVs (copy from `../Matalk/docs/`).
- Never-let-in files absent: `.env`, `ios/MaTalkStore.storekit`, `src/utils/player.js`, `src/utils/trialUtils.ts`, `android/build.log`.
- Identity: pbxproj shows `MaTalk AI Orgs` / `2.6.2` / `matalkaiforevercustom.verbali.io` in both configs; `ios/Podfile` target `'matalkforever'`.
- Built app: `/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' <DerivedData>/Build/Products/Debug-iphonesimulator/matalkforever.app/Info.plist` → `matalkaiforevercustom.verbali.io`, `CFBundleShortVersionString` → the Orgs version. (`CFBundleDisplayName` reads "MaTalk AI Forever" until §3 is resolved.)
- Build `ios/Matalk.xcworkspace`, scheme `MatalkForever` — the Orgs identity lives only in the pbxproj, so the same scheme produces the Orgs app on this branch.
- Walk onboarding: Terms (I Accept) → **Organization connect** (no global Next button; advances on successful enrollment) → hero name → … No plan-selection step, no paywall.
- Settings: Account section shows the org card; Reports shows the **IEP Progress** card (2026-10-12 feature); no subscription section.
- Open.tsx: with `deviceRevoked = '1'` the admin modal opens by itself with the "There seems to be an issue" copy.

**Update-popup caveat (new since 2026-08-30):** `appIdentity.ts` is shared, so Orgs sends `appKey=matalk_forever` to the backend. `appUpdateService` only evaluates integer versions, so with `MARKETING_VERSION = 2.6.2` the start-up update popup is **silently disabled on iOS for Orgs** — probably what you want, since Orgs is on its own release train. On Android it *would* evaluate (`versionName "4"`) against Forever's policy. If Orgs should ever get its own popup policy: give it an integer train and its own `APP_KEY` (backend `appUpdate.service.js` accepted-keys list), and add `appIdentity.ts` to §3.

## 7. Releasing Orgs

Bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in `ios/MatalkForever.xcodeproj/project.pbxproj` (both configs) on `customApp` only. Never bump on develop for an Orgs release — the two trains are independent and the pbxproj conflict in §2 is expected on every sync.

## 8. Sync log

| Date | Source | Branch | Conflicts | Notes |
|---|---|---|---|---|
| 2026-08-14 | `develop` (`a97f6bc`) | `customApp-update1`, PR #14 | identity + onboarding/settings UX | develop merge **wiped the org feature** (no conflicts); restored by hand in `1aed29d`; org card in Settings Account added (`f7240d8`, `6d590fa`); hero profile card `6df8ca3` (byte-identical to Matalk's `8ef25e8`, so `HERO_PROFILE_CARD_MIGRATION.md` is now obsolete — develop got the same change from Matalk) |
| 2026-10-13 | `sync-matalk-2026-10-12` (`0d0202e` = develop `93f047f` + Matalk `00a2c42`) | `sync-customapp-2026-10-13` | pbxproj (`MARKETING_VERSION` keep 2.6.2, `PODFILE_DIR` take), `package.json` (take theirs), `Podfile.lock` (take theirs) | Three missed syncs in one: RN 0.86.2 / Android upgrade, start-up update popup, Terms accept-button flow, IEP progress dashboard. All four org-bearing source files auto-merged correctly (verified §4 both ways). `yarn.lock` auto-merged identical to develop. Android identity moved to the Forever id / `"4"` (§3) — recorded at the time as `com.verbali.matalkforever`, which was wrong; the Play id is `com.verbali.matalkaiforever` (corrected 2026-10-19). tsc 31 / jest App.test.tsx only — same as develop. `pod install` (11 s) left `Podfile.lock` unchanged and only flipped the cosmetic pbxproj lines — reverted, pbxproj = develop + 6 identity lines. iOS Debug simulator build of `Matalk.xcworkspace` / scheme `MatalkForever` succeeded (Xcode 27.0) and the built `Info.plist` has bundle id `matalkaiforevercustom.verbali.io`, version 2.6.2 (1) — but display name "MaTalk AI Forever" (pre-existing, see §3). |
