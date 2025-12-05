/**
 * Trial utility functions for managing 7-day free trial
 */

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in
//const TRIAL_DURATION_MS = 2 * 60 * 1000; //2 minutes in milliseconds

/**
 * Check if trial is still active based on installation date
 */
export const isTrialActive = (installationDate: string): boolean => {
  if (!installationDate || installationDate === 'init.NotSet') {
    return false;
  }

  const installTime = parseInt(installationDate);
  const now = Date.now();
  const timeElapsed = now - installTime;
  const isActive = timeElapsed < TRIAL_DURATION_MS;

  return isActive;
};

/**
 * Calculate days remaining in trial
 */
export const getTrialDaysRemaining = (installationDate: string): number => {
  if (!installationDate || installationDate === 'init.NotSet') {
    return 0;
  }
  const installTime = parseInt(installationDate);
  const now = Date.now();
  const timeElapsed = now - installTime;
  const timeRemaining = TRIAL_DURATION_MS - timeElapsed;

  if (timeRemaining <= 0) {
    return 0;
  }

  return Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
};

/**
 * Ensure trial installation date is set if user is in trial but date is missing
 * This should be called before hasAppAccess to ensure the date is properly set
 */
export const ensureTrialDateSet = async (
  isInTrial: string,
  installationDate: string,
  setItem: (key: string, value: string) => Promise<void>,
): Promise<string> => {
  // If user is in trial but date is null/not set, set it to today
  if (
    isInTrial === '1' &&
    (!installationDate || installationDate === 'init.NotSet')
  ) {
    const currentTimestamp = Date.now().toString();
    await setItem('trialInstallationDate', currentTimestamp);
    return currentTimestamp;
  }
  return installationDate;
};

/**
 * Check if user has app access (either paid subscription or active trial)
 *
 * IMPORTANT: If isInTrial === '1' and installationDate is null/not set,
 * call ensureTrialDateSet() first to set the date, then call this function.
 *
 * This function validates access but does NOT modify the installationDate.
 * It will grant access if isInTrial === '1' even if date is null (to prevent
 * blocking access), but the date should be set by the caller.
 *
 * NOTE: If trial has expired (7 days passed), this will return false.
 * The caller should update isInTrial to '0' when the trial expires.
 */
export const hasAppAccess = (
  isIOSActive: string,
  isInTrial: string,
  installationDate: string,
): boolean => {
  const hasPaidSubscription = isIOSActive === '1';

  // If user has paid subscription, grant access
  if (hasPaidSubscription) {
    return true;
  }

  // If user is marked as in trial, check trial status
  if (isInTrial === '1') {
    // If installation date is null/not set, still grant access
    // (the caller should set the date via ensureTrialDateSet, but we don't block access)
    if (!installationDate || installationDate === 'init.NotSet') {
      return true;
    }

    // Check if trial is still active based on date
    // If 7 days have passed, isTrialActive will return false, and hasAppAccess will return false
    const isInTrialPeriod = isTrialActive(installationDate);
    return isInTrialPeriod;
  }

  return false;
};

/**
 * Get subscription status for display
 */
export const getSubscriptionStatus = (
  isIOSActive: string,
  isInTrial: string,
  installationDate: string,
): {status: 'active' | 'trial' | 'expired'; text: string} => {
  if (isIOSActive === '1') {
    return {status: 'active', text: 'Subscription Active'};
  } else if (isInTrial === '1' && isTrialActive(installationDate)) {
    const daysLeft = getTrialDaysRemaining(installationDate);
    return {status: 'trial', text: `Free Trial - ${daysLeft} days remaining`};
  } else {
    return {status: 'expired', text: 'Trial Expired'};
  }
};

/**
 * Check if trial card should be shown in subscription component
 */
export const shouldShowTrialCard = (
  isIOSActive: string,
  isInTrial: string,
  installationDate: string,
): boolean => {
  // Don't show if user has paid subscription
  if (isIOSActive === '1') {
    return false;
  }

  // Don't show if trial has expired
  if (installationDate !== 'init.NotSet' && !isTrialActive(installationDate)) {
    return false;
  }

  // Don't show if user is already in trial
  if (isInTrial === '1') {
    return false;
  }

  return true;
};
