/**
 * Types for the database-controlled start-up update popup.
 */

export type UpdatePlatform = 'ios' | 'android';

export type UpdateImportance = 'recommended' | 'important';

/** Raw contract returned by GET /api/app-update?appKey=...&platform=... */
export interface UpdatePolicyResponse {
  appKey: string;
  platform: UpdatePlatform;
  enabled: boolean;
  minimumPopupBuild: number;
  latestBuild: number;
  importance: UpdateImportance;
  title: string;
  message: string;
  storeUrl: string;
}

/** A validated policy that this installation is eligible to display. */
export interface DisplayableUpdatePolicy {
  importance: UpdateImportance;
  title: string;
  message: string;
  storeUrl: string;
  minimumPopupBuild: number;
  latestBuild: number;
  installedBuild: number;
}
