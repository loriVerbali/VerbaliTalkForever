/**
 * Stable, code-owned application identity.
 *
 * This key is sent to the backend for app-specific configuration such as the
 * start-up update popup policy. It must NOT be derived from package.json,
 * display names, bundle identifiers or Android application IDs — those are
 * shared or inconsistent across the Matalk / Forever / VerbaliTalk apps.
 *
 * Do not change this value during branding or native-project updates.
 */
export const APP_KEY = 'matalk' as const;

export type AppKey = typeof APP_KEY;
