/**
 * Trial utility functions for managing 7-day free trial
 */

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

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

  return timeElapsed < TRIAL_DURATION_MS;
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
 * Check if user has app access (either paid subscription or active trial)
 */
export const hasAppAccess = (
  isIOSActive: string,
  isInTrial: string,
  installationDate: string,
): boolean => {
  const hasPaidSubscription = isIOSActive === '1';
  const isInTrialPeriod = isInTrial === '1' && isTrialActive(installationDate);

  return hasPaidSubscription || isInTrialPeriod;
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
    console.log('has paid subscription');
    return false;
  }
  // Don't show if trial has expired
  if (installationDate !== 'init.NotSet' && !isTrialActive(installationDate)) {
    console.log('trial has expired');
    return false;
  }
  // Don't show if user is already in trial
  if (isInTrial === '1') {
    console.log('user is already in trial');
    return false;
  }

  return true;
};
