# Multi-App Start Update Popup Plan

## Scope

Add a database-controlled update popup at app start for all four React Native applications:

- `Matalk`
- `MatalkForever`
- `VerbaliTalk`
- `VerbaliTalkForever`

This document is a plan only; it does not implement the feature.

The intended behavior is:

- Identify both the app and the platform when requesting a policy.
- Use the installed native build number as the comparable version.
- Show the popup when the installed build is below the database-configured threshold.
- Never show the popup more than once during a single app session.
- Allow an important update to target everyone behind the newest build.
- Do not prevent the app from starting when the update check fails.

Example:

- Latest release build: `35`
- Database threshold: `minimum_popup_build = 33`
- Installed build `31`: show the popup
- Installed build `32`: show the popup
- Installed build `33` or newer: do not show the popup

The eligibility comparison inside each app/platform policy is:

```text
showPopup = update.enabled && installedBuild < minimumPopupBuild
```

## Version Source

Use the native, monotonically increasing build number:

- Android: `versionCode`
- iOS: `CFBundleVersion`
- React Native: `DeviceInfo.getBuildNumber()`

Do not use `DeviceInfo.getVersion()`, `package.json`, or a display version such as `6.2` for numeric threshold comparisons. Those values are marketing/display versions and are not guaranteed to be monotonically increasing integers.

## Stable App Identity

Each client must send an explicit, code-owned app key. Recommended values:

| Repository | `appKey` |
|---|---|
| `Matalk` | `matalk` |
| `MatalkForever` | `matalk_forever` |
| `VerbaliTalk` | `verbali_talk` |
| `VerbaliTalkForever` | `verbali_talk_forever` |

Do not derive this key from `package.json` names, display names, bundle identifiers, or Android application IDs. Those values are inconsistent or shared in the current repositories. Define the key as a constant in each app so it cannot change accidentally during branding or native-project updates.

## Proposed Database Model

Add one active update-policy record per app and platform with fields equivalent to:

```text
app_key                  matalk | matalk_forever | verbali_talk | verbali_talk_forever
platform                 ios | android
enabled                  boolean
minimum_popup_build      integer
latest_build             integer
importance               recommended | important
title                    text
message                  text
store_url                text
updated_at               timestamp
```

Add a uniqueness constraint on `(app_key, platform)`, or a partial uniqueness constraint covering the single active policy if policy history is retained.

`minimum_popup_build` determines which installations see the popup. `latest_build` is informational and may also be used for messaging, administration, or analytics.

For an important update that should be shown to everyone behind the newest release, configure:

```text
importance = important
minimum_popup_build = latest_build
```

This keeps one authoritative comparison rule instead of creating separate, potentially conflicting rules for ordinary and important updates.

## Proposed Backend Endpoint

Add a small public endpoint:

```http
GET /api/app-update?appKey=matalk&platform=ios
```

Example response:

```json
{
  "appKey": "matalk",
  "platform": "ios",
  "enabled": true,
  "minimumPopupBuild": 33,
  "latestBuild": 35,
  "importance": "important",
  "title": "An important update is available",
  "message": "Please update Verbali to get the latest improvements.",
  "storeUrl": "https://..."
}
```

The endpoint should:

- Validate `appKey` against the four supported values.
- Validate the requested platform.
- Query only the active policy for that app/platform pair.
- Return `enabled: false` when no active policy exists.
- Avoid making the eligibility decision from a stored device record; the app should compare the policy with its actual installed build.
- Be available before authentication so new, unenrolled, and session-failure users can receive important notices.
- Fail safely without affecting normal application startup.
- Return only the fields required by the client.

The backend authentication bypass list will need to explicitly allow this endpoint.

## App-Side Update Service

Add a focused update-check service that:

1. Reads its compile-time `appKey` constant.
2. Reads `Platform.OS`.
3. Reads and parses `DeviceInfo.getBuildNumber()`.
4. Requests the policy for the current app/platform pair.
5. Strictly validates the response, including matching `appKey` and platform.
6. Compares the installed build with `minimumPopupBuild`.
7. Returns either a displayable update policy or `null`.

Use a short request timeout. Network failures, malformed responses, disabled policies, and invalid build numbers should all result in no popup rather than blocking or crashing startup.

## Startup Integration

Integrate the check at the application root in each repository's `src/App.tsx`.

Recommended lifecycle:

```text
App starts
  -> begin the existing initialization
  -> fetch the update policy in parallel
  -> render the main application
  -> show the update modal if the installation is eligible
```

Do not make wake-word, TTS, local database, or navigation initialization wait indefinitely for the update-policy request. The existing startup sequence already performs substantial initialization.

The popup should be owned near the application root so it works regardless of whether the user is entering onboarding or the logged-in navigation stack.

`Matalk`, `MatalkForever`, and `VerbaliTalkForever` currently share the newer guarded bootstrap structure. Start the policy request from that one-time bootstrap and display the result after the root UI is available.

`VerbaliTalk` has an older startup structure without `bootstrapDone` or `bootstrapRanRef`. Add a separate update-check-on-mount effect with its own once-only guard rather than tying it to the multiple existing service and app-state effects. Do not refactor its voice-service lifecycle as part of this feature.

## Once-Per-Session Guarantee

Use an in-memory or module-scoped guard equivalent to:

```text
updatePopupShownThisSession
```

Set the guard only when the modal is actually displayed.

Do not store this flag in AsyncStorage, default preferences, or the database. Persistent storage would suppress the popup in later app sessions, which is not the requested behavior.

Expected lifecycle:

- React re-renders: do not show again.
- Navigation restart/remount during the same native process: do not show again.
- Background and foreground transition: do not show again.
- Full native app termination and restart: the new session may show it again.

## Popup UI

Add a dedicated update modal containing:

- The database-provided title and message.
- An **Update now** action that opens the platform-specific `store_url`.
- A **Not now** action when the update is dismissible.
- Safe error handling when the store URL cannot be opened.
- Accessibility labels and sufficiently large touch targets.

If `important` is intended to mean mandatory, define that explicitly. A mandatory update would omit **Not now** and prevent dismissing the modal. That is a separate product rule from showing a dismissible popup to everyone below a threshold.

## Testing Plan

### Backend tests

- Returns the correct policy for every supported app/platform combination.
- Does not return one app's policy when another app key is requested.
- Rejects unsupported app keys.
- Rejects unsupported platform values.
- Returns a disabled result when no active policy exists.
- Does not expose unrelated database columns.

### App tests

- Installed build `31` with threshold `33` shows the popup.
- Installed build `32` with threshold `33` shows the popup.
- Installed build `33` with threshold `33` does not show the popup.
- Installed build `35` with threshold `33` does not show the popup.
- A disabled policy does not show the popup.
- Invalid server data does not show the popup.
- A network failure does not block startup.
- Backgrounding and foregrounding do not show the popup again.
- A second render or root remount in the same session does not show the popup again.
- All four app keys use independent policies.
- iOS and Android use their own policies and store URLs for every app.
- The update action opens the configured store URL.
- Failure to open the store URL is handled without crashing.

## Gaps Found in the Current Code

### 1. Version sources are inconsistent

The repositories currently contain several unrelated version values:

| App | Android `versionCode` | Android `versionName` | iOS build | iOS marketing version |
|---|---:|---|---:|---|
| Matalk | 29 | `MatalkV2` | 1 | `35` |
| MatalkForever | 26 | `MATALKFOREVERV3` | 2 | `3.0.1` |
| VerbaliTalk | 25 | `GoaliV1` | 2 | `1` |
| VerbaliTalkForever | 26 | `VERBALITALKV1` | 1 | `6.2` |

All four `package.json` files report `0.0.2` or otherwise cannot serve as release build authority. The newer apps' `bootstrapDevice()` implementations also send `DeviceInfo.getVersion()`, which is the display version rather than the native build number.

Before using thresholds such as `33`, establish a monotonically increasing native build-number policy. The update threshold should be platform-specific because the iOS and Android build histories already differ.

### 2. Native identifiers do not reliably distinguish all four products

The current native identifiers include collisions:

- `Matalk` and `MatalkForever` both use Android application ID `com.verbali.matalkai`.
- `VerbaliTalk` and `VerbaliTalkForever` both use Android application ID `verbalitalk.io.verbali`.
- The four iOS bundle identifiers are distinct, but they do not follow one consistent naming convention.
- Several `package.json` names are also copied or shared.

Therefore, neither native identifiers nor package metadata can be the sole backend policy key. Each app needs the explicit stable `appKey` described above. The shared Android IDs also need product confirmation because they imply the standard and Forever variants may be store successors rather than independently installable Android products.

### 3. Existing device bootstrap is not a reliable delivery path

`sessionManager.bootstrapDevice()` appears to be unused by the app startup flow.

Additionally, the backend `/device/bootstrap` route returns early for devices that are not already present in the `devices` table. Using that route for update policy would therefore miss ordinary unenrolled installations.

A standalone update-policy endpoint is the cleaner path.

### 4. There is no clear backend migration framework

The backend uses PostgreSQL directly but does not have an organized migration framework or schema history in the repository. The update-policy table should be introduced through a repeatable migration rather than an undocumented manual production database edit.

### 5. Store URLs are not currently defined

The apps do not currently contain a complete mapping of App Store and Google Play update URLs for this feature. URLs need to be confirmed for every real app/platform store listing. If a standard app must update into its Forever successor, its policy must point to the successor's store listing deliberately.

### 6. Startup implementations are not identical

None of the apps currently fetch application-level remote update configuration. `Matalk`, `MatalkForever`, and `VerbaliTalkForever` share a guarded bootstrap, while `VerbaliTalk` uses an older lifecycle with multiple effects. The shared behavior can use the same service and modal design, but integration must be verified independently in each repository.

### 7. Shared code is duplicated across repositories

These are separate repositories with heavily duplicated React Native code. There is no shared package from which the update service and modal can automatically reach all four apps. The implementation must either:

- Apply and test equivalent files in all four repositories; or
- First introduce a shared internal package, which is a broader architectural change and is not recommended solely for this feature.

For this feature, use equivalent app-local implementations with the app key as the intentional difference, and maintain a common contract test fixture to reduce drift.

### 8. Important versus mandatory is undefined

The current request establishes who should see an important update, but it does not establish whether users can dismiss it.

The default proposed behavior is:

- `recommended`: dismissible
- `important`: dismissible, but targeted to all builds below the configured threshold

If a forced update is required later, add an explicit `mandatory` policy instead of changing the meaning of `important` implicitly.

## Recommended Implementation Order

1. Confirm whether each standard/Forever pair represents separate products or successive store listings, especially on Android where IDs are shared.
2. Establish native build-number policies for all four apps on both platforms.
3. Assign and lock the four explicit app keys.
4. Confirm all App Store and Google Play destination URLs.
5. Add the database migration and seed eight initially disabled policies: four apps multiplied by two platforms.
6. Add and test the public backend endpoint.
7. Add equivalent app-local policy types, service, modal, and root-level session guard in all four repositories.
8. Integrate the check into each startup lifecycle without blocking initialization.
9. Add backend contract tests and app tests in all four repositories.
10. Release each app with its database policy disabled.
11. Verify production requests for the correct app key, platform, and build.
12. Enable thresholds independently for the intended app/platform policies.

## Recommended Final Design

Use a standalone, public, app-and-platform-specific update-policy endpoint. Each of the four apps sends its explicit stable app key and platform, compares its native build number with that policy's database threshold, and displays a root-level modal guarded by an in-memory once-per-session flag.

This design covers enrolled and unenrolled users, prevents policies from leaking between products, preserves startup when the network is unavailable, supports eight independent release histories, and lets each threshold be changed without publishing another app build.
