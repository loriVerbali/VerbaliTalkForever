import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
  Switch,
  Linking,
  ScrollView,
} from 'react-native';
import ParentalGate from './ParentalGate';
import {
  initConnection,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  fetchProducts,
  requestPurchase,
  clearTransactionIOS,
  endConnection,
  PurchaseError,
  Purchase,
  getAvailablePurchases,
  getReceiptDataIOS,
  requestReceiptRefreshIOS,
} from 'react-native-iap';
import { useAdmin } from '../contexts/adminContext';
import { useToast } from '../contexts/ToastContext';
import {
  validateSubscription,
  buildAndroidReceipt,
} from '../utils/recieptValidation';
import { useAppSettings } from '../utils/persistance';
import { shouldShowTrialCard } from '../utils/trialUtils';
import mixpanel from '../utils/mixpanelInstance';

const { width, height } = Dimensions.get('window');

export type SubscriptionPlan = 'monthly' | 'yearly' | 'trial';

interface SubscriptionProps {
  setGotSubscription: (gotSubscription: boolean) => void;
  context?: 'settings' | 'onboarding';
}

// Subscription product IDs for MaTalk subscription group
// Note: For Google Play Billing v6+, Android subscriptions require basePlanId and offerToken
// These are automatically extracted from the subscription details when making purchases
const SUBSCRIPTION_SKUS = Platform.select({
  ios: ['matalkai.monthly', 'matalkai.annual'],
  android: ['matalk.monthly', 'matalk.annual'], // Android SKUs - need to be configured in Google Play Console
}) as string[];

const Subscription: React.FC<SubscriptionProps> = ({
  setGotSubscription,
  context = 'onboarding',
}) => {
  const { isTablet } = useAdmin();
  const { showError } = useToast();

  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
  const [isIAPInitialized, setIsIAPInitialized] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(
    null,
  );
  const [showParentalGate, setShowParentalGate] = useState(true); // Start with parental gate shown
  const [parentalGatePassed, setParentalGatePassed] = useState(false); // Track if parental gate was passed
  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlan | null>(null); // Paid plan awaiting parental gate
  const [showYearlyPlan, setShowYearlyPlan] = useState(false); // Toggle between yearly and monthly
  const [showSubscriptionInfo, setShowSubscriptionInfo] = useState(false); // Toggle for subscription info
  const { setItem, preferences } = useAppSettings();
  const scrollRef = useRef<any>(null);
  const [collapsibleY, setCollapsibleY] = useState(0);

  const handleToggleSubscriptionInfo = () => {
    setShowSubscriptionInfo(prev => {
      const next = !prev;
      if (next && !isTablet) {
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTo({
              y: Math.max(collapsibleY - 24, 0),
              animated: true,
            });
          }
        }, 120);
      }
      return next;
    });
  };

  // Log component mounting
  useEffect(() => { }, []);

  // Add logging for preferences state changes
  useEffect(() => { }, [
    preferences.isIOSActive,
    preferences.isInTrial,
    preferences.trialInstallationDate,
  ]);

  // Log when trial card should be rendered
  useEffect(() => {
    const shouldShow = shouldShowTrialCard(
      preferences.isIOSActive,
      preferences.isInTrial,
      preferences.trialInstallationDate,
    );
  }, [
    preferences.isIOSActive,
    preferences.isInTrial,
    preferences.trialInstallationDate,
  ]);

  // Initialize IAP connection immediately to check existing subscription
  useEffect(() => {
    if (!purchaseSuccess) {
      initializeIAP();
    }

    return () => {
      endConnection();
    };
  }, [purchaseSuccess]);

  // v16 removed purchase.transactionReceipt. iOS: the app receipt comes from
  // getReceiptDataIOS(). Android: dataAndroid is the raw Play receipt JSON
  // (same payload the old transactionReceipt held), purchaseToken as fallback.
  //
  // v16's native getReceiptDataIOS throws purchase-verification-failed when
  // the receipt file simply doesn't exist yet (normal in sandbox/dev builds
  // until StoreKit syncs) — that must not abort the purchase flow.
  // allowRefresh triggers AppStore.sync() which can show an auth prompt, so
  // it's only safe right after a purchase, never on passive init.
  const getReceiptForValidation = async (
    purchase: Purchase,
    { allowRefresh = false } = {},
  ): Promise<string> => {
    if (Platform.OS === 'ios') {
      try {
        return (await getReceiptDataIOS()) ?? '';
      } catch (receiptError) {
        if (allowRefresh) {
          try {
            return (await requestReceiptRefreshIOS()) ?? '';
          } catch (refreshError) {
            console.error(
              'getReceiptForValidation: receipt refresh failed:',
              refreshError,
            );
          }
        }
        return '';
      }
    }
    return buildAndroidReceipt(purchase);
  };

  const initializeIAP = async () => {
    try {
      const result = await initConnection();
      if (result) {
        const purchases = await getAvailablePurchases();

        const owned = purchases.some(p =>
          Platform.OS === 'ios'
            ? p.productId === 'matalkai.monthly' ||
            p.productId === 'matalkai.annual'
            : p.productId === 'matalk.monthly' ||
            p.productId === 'matalk.annual',
        );
        setIsIAPInitialized(true);

        await loadSubscriptions();

        setupPurchaseListeners();

        if (owned) {
          // Sort by transactionDate (string timestamp)
          const sorted = purchases.sort(
            (a, b) =>
              parseInt(String(b.transactionDate)) -
              parseInt(String(a.transactionDate)),
          );

          const latestPurchase = sorted[0];

          const latestReceipt = await getReceiptForValidation(latestPurchase);
          const isActive = await validateSubscription(latestReceipt);
          await setItem('isIOSActive', isActive ? '1' : '0');

          if (isActive) {
            setGotSubscription(true);
            setShowParentalGate(false);
            setParentalGatePassed(true);
          } else {
            setGotSubscription(false);
          }
          return;
        }
      }
    } catch (error) {
      console.error('initializeIAP: IAP initialization failed:', error);
    }
  };

  const loadSubscriptions = async (retryCount = 0) => {
    const maxRetries = 2;

    try {
      setIsLoadingSubscriptions(true);
      const products = await fetchProducts({
        skus: SUBSCRIPTION_SKUS,
        type: 'subs',
      });
      setSubscriptions(products ?? []);
      setIsLoadingSubscriptions(false);
    } catch (error) {
      if (retryCount < maxRetries) {
        setTimeout(() => {
          loadSubscriptions(retryCount + 1);
        }, 2000);
      } else {
        setIsLoadingSubscriptions(false);
      }
    }
  };

  const setupPurchaseListeners = () => {
    const purchaseUpdateSubscription = purchaseUpdatedListener(
      (purchase: Purchase) => {
        handlePurchaseUpdate(purchase);
      },
    );

    const purchaseErrorSubscription = purchaseErrorListener(
      (error: PurchaseError) => {
        setIsLoading(false);
        if (error) {
          console.error('Purchase error details:', error);
        } else {
          showError('Purchase was cancelled or failed. Please try again.');
        }
      },
    );

    return () => {
      purchaseUpdateSubscription?.remove();
      purchaseErrorSubscription?.remove();
    };
  };

  const handlePurchaseUpdate = async (purchase: Purchase) => {
    try {
      setIsLoading(false);

      if (Platform.OS === 'android') {
        // For subscriptions, also log subscription-specific details
        if (
          purchase.productId.includes('monthly') ||
          purchase.productId.includes('annual')
        ) {
        }
      }

      const receipt = await getReceiptForValidation(purchase, {
        allowRefresh: true,
      });

      // Android without a receipt has nothing to send the backend. iOS may
      // legitimately have no receipt file yet (sandbox/dev before StoreKit
      // syncs), so it still proceeds and lets validation decide.
      if (!receipt && Platform.OS === 'android') {
        console.error(
          '💥 handlePurchaseUpdate: Android - empty receipt for purchase:',
          purchase.productId,
        );
        showError(
          'We could not verify your purchase. Please try again or contact support.',
        );
        return;
      }

      // Finish the transaction. On Android this acknowledges the purchase;
      // a finish failure (e.g. already finished when the listener fires
      // twice) must not block granting access, so don't let it throw.
      try {
        await finishTransaction({ purchase });
      } catch (finishError) {
        console.error(
          '💥 handlePurchaseUpdate: finishTransaction failed:',
          finishError,
        );
      }

      const isActive = await validateSubscription(receipt);

      if (isActive) {
        await setItem('isIOSActive', isActive ? '1' : '0');
        setGotSubscription(true);
        setPurchaseSuccess(true);
        mixpanel.track('Subscription Purchased', {
          screen_label: 'subscription',
          selection_type: purchase.productId.includes('monthly')
            ? 'monthly'
            : 'yearly',
        });
      } else {
        // Don't leave the user stuck on this screen with no feedback
        showError(
          'We could not verify your purchase. Please try again or contact support.',
        );
      }
    } catch (error) {
      console.error('💥 handlePurchaseUpdate: Error handling purchase:', error);
    }
  };

  const handlePlanSelection = async (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);

    mixpanel.track('Onboarding Subscription Selected', {
      screen_label: 'subscription',
      selection_type: plan === 'monthly' ? 'monthly' : 'yearly',
    });

    // Paid purchases stay behind the parental gate
    if (!parentalGatePassed) {
      setPendingPlan(plan);
      setShowParentalGate(true);
      return;
    }

    if (isIAPInitialized) {
      await purchaseSubscription(plan);
    } else {
      showError('In-app purchases are not available. Please try again later.');
    }
  };

  const handleTrialSelection = async () => {
    try {
      setIsLoading(true);
      setSelectedPlan('trial');

      mixpanel.track('Onboarding Subscription Selected', {
        screen_label: 'subscription',
        selection_type: 'trial',
      });

      // Set trial status and grant access. The trial clock starts now, at
      // tap time — not at first app launch — so the user gets the full 7 days.
      await setItem('trialInstallationDate', Date.now().toString());
      await setItem('isInTrial', '1');

      // Grant app access
      setShowParentalGate(false);
      setGotSubscription(true);
      setPurchaseSuccess(true);
    } catch (error) {
      console.error('💥 Error starting trial:', error);
      showError('Failed to start trial. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleParentalGateSuccess = async () => {
    setShowParentalGate(false);
    setParentalGatePassed(true);

    // Continue the paid purchase the user started before the gate
    if (pendingPlan) {
      const plan = pendingPlan;
      setPendingPlan(null);
      if (isIAPInitialized) {
        await purchaseSubscription(plan);
      } else {
        showError(
          'In-app purchases are not available. Please try again later.',
        );
      }
    }
  };

  const purchaseSubscription = async (plan: SubscriptionPlan) => {
    try {
      setIsLoading(true);

      const sku =
        plan === 'monthly'
          ? Platform.OS === 'ios'
            ? 'matalkai.monthly'
            : 'matalk.monthly'
          : Platform.OS === 'ios'
            ? 'matalkai.annual'
            : 'matalk.annual';

      if (Platform.OS === 'ios') {
        // Clear any pending transactions
        await clearTransactionIOS();

        // Success is handled by purchaseUpdatedListener, not the return value
        await requestPurchase({
          request: { apple: { sku } },
          type: 'subs',
        });
      } else {
        // Android - Google Play Billing requires subscriptionOffers with offerToken

        const subscription = subscriptions.find(sub => sub.id === sku);
        if (!subscription) {
          console.error(
            '💥 purchaseSubscription: Android - Subscription not found for SKU:',
            sku,
          );
          throw new Error(`Subscription not found for SKU: ${sku}`);
        }

        // Extract offerToken from subscription offers. Prefer an offer with an
        // offerId (introductory/promotional), fall back to the base plan offer.
        const offers = subscription.subscriptionOffers ?? [];
        const chosenOffer =
          offers.find((offer: any) => offer.id && offer.offerTokenAndroid) ??
          offers.find((offer: any) => offer.offerTokenAndroid);
        const offerToken = chosenOffer?.offerTokenAndroid;

        if (!offerToken) {
          console.error(
            '💥 purchaseSubscription: Android - No offerToken found in subscription offers',
          );
          console.error(
            '💥 purchaseSubscription: Android - Available subscription offers:',
            JSON.stringify(offers, null, 2),
          );
          throw new Error(
            'No offerToken found for Android subscription. Please ensure your subscription is properly configured in Google Play Console.',
          );
        }

        // Success is handled by purchaseUpdatedListener, not the return value
        await requestPurchase({
          request: {
            google: {
              skus: [sku],
              subscriptionOffers: [{ sku, offerToken }],
            },
          },
          type: 'subs',
        });
      }
    } catch (error) {
      console.error('💥 purchaseSubscription: Purchase failed:', error);
      console.error(
        '💥 purchaseSubscription: Error details:',
        JSON.stringify(error, null, 2),
      );
      setIsLoading(false);
      showError(
        'Unable to complete your purchase. Please try again or contact support.',
      );
    }
  };

  const getSubscriptionPrice = (plan: SubscriptionPlan): string => {
    if (subscriptions.length > 0) {
      const sku =
        plan === 'monthly'
          ? Platform.OS === 'ios'
            ? 'matalkai.monthly'
            : 'matalk.monthly'
          : Platform.OS === 'ios'
            ? 'matalkai.annual'
            : 'matalk.annual';

      const subscription = subscriptions.find(sub => sub.id === sku);

      if (subscription) {
        if (Platform.OS === 'android') {
          // Android subscription structure
          if (
            subscription.subscriptionOffers &&
            subscription.subscriptionOffers.length > 0
          ) {
            // Look for introductory offer first (offer id exists)
            const introOffer = subscription.subscriptionOffers.find(
              (offer: any) => offer.id,
            );
            if (
              introOffer &&
              introOffer.pricingPhasesAndroid &&
              introOffer.pricingPhasesAndroid.pricingPhaseList &&
              introOffer.pricingPhasesAndroid.pricingPhaseList.length > 0
            ) {
              const introPrice =
                introOffer.pricingPhasesAndroid.pricingPhaseList[0]
                  .formattedPrice;

              return introPrice;
            }

            // Fall back to regular price
            const regularOffer = subscription.subscriptionOffers[0];
            if (
              regularOffer &&
              regularOffer.pricingPhasesAndroid &&
              regularOffer.pricingPhasesAndroid.pricingPhaseList &&
              regularOffer.pricingPhasesAndroid.pricingPhaseList.length > 0
            ) {
              const regularPrice =
                regularOffer.pricingPhasesAndroid.pricingPhaseList[
                  regularOffer.pricingPhasesAndroid.pricingPhaseList.length - 1
                ].formattedPrice;

              return regularPrice;
            }
          }
        } else {
          // iOS subscription structure
          // Check for introductory offer
          if (subscription.introductoryPriceIOS) {
            return subscription.introductoryPriceIOS;
          }

          const finalPrice = subscription.displayPrice || subscription.price;

          return finalPrice;
        }
      } else {
        console.warn(
          `⚠️ getSubscriptionPrice: Subscription not found for SKU: ${sku}`,
        );
        console.warn(
          `📋 getSubscriptionPrice: Available SKUs:`,
          subscriptions.map(sub => sub.productId),
        );
      }
    } else {
      console.warn(`⚠️ getSubscriptionPrice: No subscriptions loaded yet`);
    }

    // Fallback to hardcoded prices
    return '';
  };

  const getRegularPrice = (plan: SubscriptionPlan): string => {
    if (subscriptions.length > 0) {
      const sku =
        plan === 'monthly'
          ? Platform.OS === 'ios'
            ? 'matalkai.monthly'
            : 'matalk.monthly'
          : Platform.OS === 'ios'
            ? 'matalkai.annual'
            : 'matalk.annual';

      const subscription = subscriptions.find(sub => sub.id === sku);

      if (subscription) {
        if (Platform.OS === 'android') {
          // Android subscription structure - always get the regular price (last pricing phase)
          if (
            subscription.subscriptionOffers &&
            subscription.subscriptionOffers.length > 0
          ) {
            const regularOffer =
              subscription.subscriptionOffers.find(
                (offer: any) => !offer.id,
              ) || subscription.subscriptionOffers[0];
            if (
              regularOffer &&
              regularOffer.pricingPhasesAndroid &&
              regularOffer.pricingPhasesAndroid.pricingPhaseList &&
              regularOffer.pricingPhasesAndroid.pricingPhaseList.length > 0
            ) {
              const regularPrice =
                regularOffer.pricingPhasesAndroid.pricingPhaseList[
                  regularOffer.pricingPhasesAndroid.pricingPhaseList.length - 1
                ].formattedPrice;

              return regularPrice;
            }
          }
        } else {
          // iOS subscription structure - always return the regular price, not the introductory price
          const finalPrice = subscription.displayPrice || subscription.price;

          return finalPrice;
        }
      } else {
        console.warn(
          `⚠️ getRegularPrice: Subscription not found for SKU: ${sku}`,
        );
      }
    } else {
      console.warn(`⚠️ getRegularPrice: No subscriptions loaded yet`);
    }

    return '';
  };

  const getIntroductoryOfferText = (plan: SubscriptionPlan): string | null => {
    if (subscriptions.length > 0) {
      const sku =
        plan === 'monthly'
          ? Platform.OS === 'ios'
            ? 'matalkai.monthly'
            : 'matalk.monthly'
          : null;

      if (sku) {
        const subscription = subscriptions.find(sub => sub.id === sku);

        if (Platform.OS === 'android') {
          // Android subscription structure
          if (
            subscription?.subscriptionOffers &&
            subscription.subscriptionOffers.length > 0
          ) {
            const introOffer = subscription.subscriptionOffers.find(
              (offer: any) => offer.id,
            );
            if (
              introOffer &&
              introOffer.pricingPhasesAndroid &&
              introOffer.pricingPhasesAndroid.pricingPhaseList &&
              introOffer.pricingPhasesAndroid.pricingPhaseList.length > 1
            ) {
              const introPrice =
                introOffer.pricingPhasesAndroid.pricingPhaseList[0]
                  .formattedPrice;
              const introCycles =
                introOffer.pricingPhasesAndroid.pricingPhaseList[0]
                  .billingCycleCount;

              const offerText =
                plan === 'monthly'
                  ? `Intro offer: ${introPrice}/month for the first ${introCycles} months`
                  : null;

              if (offerText) {
                return offerText;
              }
            }
          }
        } else {
          // iOS subscription structure
          if (subscription?.introductoryPriceIOS) {
            // Use the actual introductory price from IAP
            const introPrice = subscription.introductoryPriceIOS;
            const offerText =
              plan === 'monthly'
                ? `Intro offer: ${introPrice}/month for the first 3 months`
                : null;

            if (offerText) {
              return offerText;
            }
          }
        }
      }
    }

    return null;
  };

  // Dynamic styles based on device type and screen size
  const isSmallPhone = width < 375; // iPhone SE, small Android phones
  const isMediumPhone = width >= 375 && width < 414; // iPhone 12/13/14, medium Android phones
  const isLargePhone = width >= 414; // iPhone 12/13/14 Pro Max, large Android phones

  const dynamicStyles = {
    title: {
      ...styles.title,
      fontSize: isSmallPhone ? 18 : isMediumPhone ? 20 : 24,
      marginBottom: isSmallPhone ? 15 : isMediumPhone ? 20 : 30,
    },
    card: {
      ...styles.card,
      width: isTablet
        ? width * 0.35
        : isSmallPhone
          ? width * 0.4
          : isMediumPhone
            ? width * 0.38
            : width * 0.36,
      // Android text renders taller (font padding), so a fixed height makes
      // the card content spill over the elements below it. Let the card grow
      // on Android; keep the fixed height on iOS.
      [Platform.OS === 'android' ? 'minHeight' : 'height']: isTablet
        ? isSmallPhone
          ? 110
          : isMediumPhone
            ? 125
            : 135
        : isSmallPhone
          ? 88
          : isMediumPhone
            ? 100
            : 108, // 20% smaller on mobile
      overflow: 'visible' as const,
    },
    cardsContainer: {
      ...styles.cardsContainer,
      width: isTablet ? ('90%' as const) : ('95%' as const),
      justifyContent: 'center' as const,
      flexDirection: 'row' as const, // Always row for better layout
      flexWrap: 'nowrap' as const, // Prevent wrapping
      gap: isSmallPhone ? 8 : 12, // Much smaller gap
      marginTop: isTablet ? 0 : 20,
    },
    planTitle: {
      ...styles.planTitle,
      fontSize: isSmallPhone ? 11 : isMediumPhone ? 12 : 13,
      marginBottom: isSmallPhone ? 2 : 4,
    },
    planPrice: {
      ...styles.planPrice,
      fontSize: isSmallPhone ? 12 : isMediumPhone ? 14 : 16,
      marginBottom: isSmallPhone ? 1 : 2,
    },
    planSubtitle: {
      ...styles.planSubtitle,
      fontSize: isSmallPhone ? 8 : isMediumPhone ? 9 : 10,
      marginBottom: isSmallPhone ? 2 : 3,
    },
    introOfferText: {
      ...styles.introOfferText,
      fontSize: isSmallPhone ? 9 : isMediumPhone ? 10 : 11,
      marginBottom: isSmallPhone ? 2 : 3,
    },
    selectText: {
      ...styles.selectText,
      fontSize: isSmallPhone ? 8 : isMediumPhone ? 9 : 10,
    },
    savingsAmount: {
      ...styles.savingsAmount,
      fontSize: isSmallPhone ? 8 : isMediumPhone ? 9 : 10,
      lineHeight: isSmallPhone ? 10 : 12,
    },
    savingsDescription: {
      ...styles.savingsDescription,
      fontSize: isSmallPhone ? 6 : isMediumPhone ? 7 : 8,
    },
    savingsBadge: {
      ...styles.savingsBadge,
      left: isSmallPhone ? -4 : -8,
      top: isSmallPhone ? 8 : 12,
      minWidth: isSmallPhone ? 40 : 50,
      minHeight: isSmallPhone ? 40 : 50,
      paddingHorizontal: isSmallPhone ? 4 : 6,
      paddingVertical: isSmallPhone ? 4 : 6,
      borderRadius: isSmallPhone ? 12 : 16,
    },
    cancelBadge: {
      position: 'absolute' as const,
      right: isSmallPhone ? -8 : -12,
      top: isSmallPhone ? -6 : -8,
      backgroundColor: '#FF6B35',
      borderRadius: isSmallPhone ? 8 : 10,
      paddingHorizontal: isSmallPhone ? 2 : 3,
      paddingVertical: isSmallPhone ? 2 : 3,
      minWidth: isSmallPhone ? 30 : 35,
      minHeight: isSmallPhone ? 25 : 30,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      shadowColor: '#FF6B35',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 6,
      zIndex: 10,
      transform: [{ rotate: '15deg' }],
    },
    plusButton: {
      backgroundColor: 'rgba(0, 122, 255, 0.6)',
      borderRadius: isSmallPhone ? 15 : 20,
      width: isSmallPhone ? 30 : 40,
      height: isSmallPhone ? 30 : 40,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      shadowColor: '#007AFF',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      elevation: 3,
      zIndex: 10,
      borderWidth: 1,
      borderColor: 'rgba(0, 122, 255, 0.8)',
    },
    plusButtonText: {
      color: 'white',
      fontSize: isSmallPhone ? 18 : 24,
      fontWeight: 'bold' as const,
    },
  };

  // Show parental gate first. The 7-day free trial is offered below the gate
  // so it can be started without parental help — it creates no subscription.
  if (showParentalGate) {
    const trialAvailable = shouldShowTrialCard(
      preferences.isIOSActive,
      preferences.isInTrial,
      preferences.trialInstallationDate,
    );
    return (
      <View style={styles.container}>
        <ParentalGate
          onSuccess={handleParentalGateSuccess}
          isSettingsContext={context === 'settings'}
          message="Choosing a plan is a protected area. Ask your parents to continue:"
          footer={
            trialAvailable ? (
              <View
                style={[
                  styles.gateTrialContainer,
                  !isTablet && styles.gateTrialContainerPhone,
                ]}>
                <TouchableOpacity
                  style={[
                    styles.gateTrialButton,
                    !isTablet && styles.gateTrialButtonPhone,
                  ]}
                  onPress={handleTrialSelection}
                  disabled={isLoading}>
                  <Text
                    style={[
                      styles.gateTrialButtonText,
                      !isTablet && styles.gateTrialButtonTextPhone,
                    ]}>
                    {isLoading ? 'Starting...' : 'Start 7-Day Free Trial'}
                  </Text>
                </TouchableOpacity>
                <Text
                  style={[
                    styles.trialDisclaimer,
                    !isTablet && styles.trialDisclaimerPhone,
                  ]}>
                  Starting the free trial does not create an auto-renewable
                  subscription and nothing will be charged. You can subscribe
                  from Settings during or after the 7 days.
                </Text>
              </View>
            ) : undefined
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ActivityIndicator always mounted to avoid Fabric recycling crash */}
      <ActivityIndicator
        size="large"
        color="#007AFF"
        style={{ opacity: isLoadingSubscriptions ? 1 : 0, position: isLoadingSubscriptions ? 'relative' : 'absolute' }}
      />
      {isLoadingSubscriptions ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading subscription plans...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={
            showSubscriptionInfo
              ? styles.scrollContentContainerExpanded
              : styles.scrollContentContainer
          }
          ref={scrollRef}
          showsVerticalScrollIndicator={false}>
          {/* Toggle Switch for Yearly/Monthly when trial card is shown */}
          {shouldShowTrialCard(
            preferences.isIOSActive,
            preferences.isInTrial,
            preferences.trialInstallationDate,
          ) && (
              <View style={styles.toggleContainer}>
                <Text style={styles.toggleLabel}>Monthly</Text>
                <Switch
                  value={showYearlyPlan}
                  onValueChange={setShowYearlyPlan}
                  trackColor={{ false: '#767577', true: '#34C759' }}
                  thumbColor={showYearlyPlan ? '#FFFFFF' : '#f4f3f4'}
                  ios_backgroundColor="#767577"
                />
                <Text style={styles.toggleLabel}>Yearly</Text>
              </View>
            )}
          <View style={dynamicStyles.cardsContainer}>
            {shouldShowTrialCard(
              preferences.isIOSActive,
              preferences.isInTrial,
              preferences.trialInstallationDate,
            ) && (
                <TouchableOpacity
                  style={[
                    dynamicStyles.card,
                    selectedPlan === 'trial' && styles.selectedCard,
                  ]}
                  onPress={() => {
                    handleTrialSelection();
                  }}
                  disabled={isLoading}>
                  <View
                    style={[
                      styles.cardHeader,
                      {
                        backgroundColor: '#34C759',
                      },
                    ]}></View>
                  <View
                    style={{
                      backgroundColor: '#34C759',
                      width: '100%',
                      borderTopLeftRadius: 16,
                      borderTopRightRadius: 16,
                      alignItems: 'center',
                    }}>
                    <Text
                      style={[
                        dynamicStyles.planTitle,
                        {
                          fontSize: isSmallPhone ? 12 : 13,
                          fontWeight: '600',
                          color: '#FFFFFF',
                        },
                      ]}>
                      Free Trial
                    </Text>
                  </View>
                  <View style={styles.cardContent}>
                    <Text
                      style={[
                        dynamicStyles.planPrice,
                        {
                          fontSize: isSmallPhone ? 16 : 18,
                          fontWeight: 'bold',
                          color: '#34C759',
                        },
                      ]}>
                      FREE
                    </Text>
                    <Text
                      style={[
                        dynamicStyles.planSubtitle,
                        {
                          fontSize: isSmallPhone ? 22 : 24,
                          fontWeight: 'normal',
                          color: '#666',
                          textAlign: 'center',
                        },
                      ]}>
                      7-Day Free Trial
                    </Text>
                    <Text
                      style={[
                        dynamicStyles.selectText,
                        {
                          fontSize: isSmallPhone ? 12 : 13,
                          fontWeight: 'normal',
                          color: '#666',
                          textAlign: 'center',
                        },
                      ]}>
                      Full access to all features
                    </Text>
                    <Text
                      style={[
                        dynamicStyles.selectText,
                        selectedPlan === 'trial' && styles.selectedText,
                      ]}>
                      {isLoading && selectedPlan === 'trial'
                        ? 'Processing...'
                        : selectedPlan === 'trial'
                          ? 'Selected'
                          : 'Start Free Trial'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

            {/* Show yearly card only when showYearlyPlan is true or when no trial card is shown */}
            {(showYearlyPlan ||
              !shouldShowTrialCard(
                preferences.isIOSActive,
                preferences.isInTrial,
                preferences.trialInstallationDate,
              )) && (
                <TouchableOpacity
                  style={[
                    dynamicStyles.card,
                    selectedPlan === 'yearly' && styles.selectedCard,
                  ]}
                  onPress={() => {
                    handlePlanSelection('yearly');
                  }}
                  disabled={isLoading}>
                  <View
                    style={[
                      styles.cardHeader,
                      {
                        backgroundColor: '#E8F5E8',
                      },
                    ]}></View>
                  <View
                    style={{
                      backgroundColor: '#E8F5E8',
                      width: '100%',
                      borderTopLeftRadius: 16,
                      borderTopRightRadius: 16,
                      alignItems: 'center',
                    }}>
                    <Text
                      style={[
                        dynamicStyles.planTitle,
                        { fontSize: isSmallPhone ? 12 : 13, fontWeight: '600' },
                      ]}>
                      Annual Plan
                    </Text>
                  </View>
                  <View style={styles.cardContent}>
                    <Text
                      style={[
                        dynamicStyles.planPrice,
                        {
                          fontSize: isSmallPhone ? 22 : 24,
                          fontWeight: 'bold',
                          color: '#000',
                        },
                      ]}>
                      {getRegularPrice('yearly')}/year
                    </Text>
                    <Text
                      style={[
                        dynamicStyles.planSubtitle,
                        {
                          fontSize: isSmallPhone ? 10 : 11,
                          fontStyle: 'italic',
                          color: '#FF3B30',
                        },
                      ]}>
                      Save! (2 months free)!
                    </Text>
                    <Text
                      style={[
                        dynamicStyles.selectText,
                        {
                          fontSize: isSmallPhone ? 9 : 10,
                          fontWeight: 'normal',
                          color: '#666',
                          textAlign: 'center',
                        },
                      ]}>
                      Billed yearly. Auto-Renews annually
                    </Text>
                    <Text
                      style={[
                        dynamicStyles.selectText,
                        selectedPlan === 'yearly' && styles.selectedText,
                      ]}>
                      {isLoading && selectedPlan === 'yearly'
                        ? 'Processing...'
                        : selectedPlan === 'yearly'
                          ? 'Selected'
                          : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

            {/* Show monthly card only when showYearlyPlan is false or when no trial card is shown */}
            {(!showYearlyPlan ||
              !shouldShowTrialCard(
                preferences.isIOSActive,
                preferences.isInTrial,
                preferences.trialInstallationDate,
              )) && (
                <TouchableOpacity
                  style={[
                    dynamicStyles.card,
                    selectedPlan === 'monthly' && styles.selectedCard,
                  ]}
                  onPress={() => {
                    handlePlanSelection('monthly');
                  }}
                  disabled={isLoading}>
                  <View
                    style={[
                      styles.cardHeader,
                      {
                        backgroundColor: '#E8F5E8',
                      },
                    ]}></View>
                  <View
                    style={{
                      backgroundColor: '#E8F5E8',
                      width: '100%',
                      borderTopLeftRadius: 16,
                      borderTopRightRadius: 16,
                      alignItems: 'center',
                    }}>
                    <Text
                      style={[
                        dynamicStyles.planTitle,
                        { fontSize: isSmallPhone ? 12 : 13, fontWeight: '600' },
                      ]}>
                      Monthly Plan
                    </Text>
                  </View>
                  <View style={styles.cardContent}>
                    <Text
                      style={[
                        dynamicStyles.planPrice,
                        {
                          fontSize: isSmallPhone ? 20 : 22,
                          fontWeight: 'bold',
                          color: '#FF9500',
                        },
                      ]}>
                      {getRegularPrice('monthly')}/month
                    </Text>
                    <Text
                      style={[
                        dynamicStyles.selectText,
                        {
                          fontSize: isSmallPhone ? 12 : 13,
                          fontWeight: 'normal',
                          color: '#666',
                          textAlign: 'center',
                          marginBottom: 8,
                        },
                      ]}>
                      Billed monthly. Auto-Renews monthly
                    </Text>

                    {getIntroductoryOfferText('monthly') && (
                      <Text
                        style={[
                          dynamicStyles.introOfferText,
                          {
                            fontSize: isSmallPhone ? 10 : 11,
                            fontWeight: 'normal',
                            color: 'black',
                          },
                        ]}>
                        {getIntroductoryOfferText('monthly')}
                      </Text>
                    )}

                    <Text
                      style={[
                        dynamicStyles.selectText,
                        selectedPlan === 'monthly' && styles.selectedText,
                      ]}>
                      {isLoading && selectedPlan === 'monthly'
                        ? 'Processing...'
                        : selectedPlan === 'monthly'
                          ? 'Selected'
                          : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
          </View>

          {shouldShowTrialCard(
            preferences.isIOSActive,
            preferences.isInTrial,
            preferences.trialInstallationDate,
          ) && (
              <Text style={styles.trialDisclaimer}>
                Starting the free trial does not create an auto-renewable
                subscription and nothing will be charged. You can subscribe
                from Settings during or after the 7 days.
              </Text>
            )}

          <View
            style={{
              marginTop: 1,
              alignItems: 'center',
              flexDirection: 'row',
              // On Android the four texts overflow the row and pile up;
              // let them wrap. iOS layout untouched.
              ...(Platform.OS === 'android' && {
                flexWrap: 'wrap' as const,
                justifyContent: 'center' as const,
                columnGap: 8,
                paddingHorizontal: 8,
              }),
            }}>
            <Text
              style={[
                styles.modalFeature,
                { fontSize: isTablet ? 14 : 12, fontWeight: 'bold' },
              ]}>
              Both plans include:
            </Text>
            <Text style={[styles.modalFeature, { fontSize: isTablet ? 14 : 12 }]}>
              <Text style={{ color: 'purple' }}>✓</Text> Full access to all
              features
            </Text>
            <Text style={[styles.modalFeature, { fontSize: isTablet ? 14 : 12 }]}>
              <Text style={{ color: 'purple' }}>✓</Text> AI-powered AAC creation
            </Text>
            <Text style={[styles.modalFeature, { fontSize: isTablet ? 14 : 12 }]}>
              <Text style={{ color: 'purple' }}>✓</Text> Customer support
            </Text>
          </View>

          <View style={{ marginTop: 1, alignItems: 'center' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text
                style={{
                  fontSize: isTablet ? 14 : 11,
                  fontWeight: 'normal',
                  color: '#666',
                  textAlign: 'center',
                  paddingHorizontal: 20,
                }}>
                {Platform.OS === 'android' ? (
                  // Android (Fabric) renders an inline view inside <Text> on
                  // top of the paragraph; a nested Text with onPress lays out
                  // correctly inline.
                  <Text
                    onPress={handleToggleSubscriptionInfo}
                    style={{
                      color: '#007AFF',
                      fontWeight: 'bold',
                      fontSize: isTablet ? 12 : 10,
                    }}>
                    Subscription Information{showSubscriptionInfo ? ' ▼' : ' ▶'}
                  </Text>
                ) : (
                  <TouchableOpacity onPress={handleToggleSubscriptionInfo}>
                    <Text
                      style={{
                        color: '#007AFF',
                        fontWeight: 'bold',
                        fontSize: isTablet ? 12 : 10,
                      }}>
                      Subscription Information
                      {showSubscriptionInfo ? ' ▼' : ' ▶'}
                    </Text>
                  </TouchableOpacity>
                )}
                : Subscription automatically renews unless canceled at least 24
                hours before the end of the current period.All subscriptions can
                be managed in your{' '}
                {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} account
                settings.
              </Text>
            </View>
            {/* Collapsible Subscription Information (moved below text) */}
            {showSubscriptionInfo && (
              <View
                style={styles.subscriptionInfoContent}
                onLayout={({ nativeEvent }) =>
                  setCollapsibleY(nativeEvent.layout.y)
                }>
                <View style={styles.subscriptionDetails}>
                  <Text style={styles.subscriptionDetailText}>
                    <Text style={styles.boldText}>Title:</Text> MaTalk AI
                    Premium Subscription
                  </Text>
                  <Text style={styles.subscriptionDetailText}>
                    <Text style={styles.boldText}>Length:</Text> Monthly (1
                    month) or Annual (12 months)
                  </Text>
                  <Text style={styles.subscriptionDetailText}>
                    <Text style={styles.boldText}>Price:</Text>{' '}
                    {getRegularPrice('monthly')}/month or{' '}
                    {getRegularPrice('yearly')}
                    /year
                  </Text>
                </View>

                <View style={styles.legalLinksContainer}>
                  <TouchableOpacity
                    style={styles.legalLink}
                    onPress={() =>
                      Linking.openURL(
                        'https://www.verbali.io/matalk-ai-privacy-policy',
                      )
                    }>
                    <Text style={styles.legalLinkText}>Privacy Policy</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.legalLink}
                    onPress={() =>
                      Linking.openURL('https://www.verbali.io/eula')
                    }>
                    <Text style={styles.legalLinkText}>
                      End User License Agreement (EULA)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.legalLink}
                    onPress={() =>
                      Linking.openURL(
                        'https://www.verbali.io/terms-of-use-standalone',
                      )
                    }>
                    <Text style={styles.legalLinkText}>Terms of Use</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    flex: 1,
    backgroundColor: '#FFF8E7',
  },
  scrollContainer: {
    flex: 1,
    width: '100%',
    minHeight: 400,
  },
  scrollContentContainer: {
    alignItems: 'center',
    paddingBottom: 60,
    flexGrow: 1,
  },
  scrollContentContainerExpanded: {
    alignItems: 'center',
    paddingBottom: 590,
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  cardsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '90%',
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  card: {
    borderRadius: 16,
    overflow: 'visible',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    backgroundColor: 'white',
    marginBottom: height * 0.02,
  },
  selectedCard: {
    shadowColor: '#47B76F',
    shadowOpacity: 1,
    elevation: 12,
  },
  cardHeader: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    alignItems: 'center',
  },
  cardContent: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 16,
    alignItems: 'center',
  },

  planTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
    color: '#000',
    marginBottom: 8,
  },
  planPrice: {
    fontWeight: 'bold',
    fontSize: 20,
    color: '#146CF0',
    textAlign: 'center',
    marginBottom: 4,
  },
  planSubtitle: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  introOfferText: {
    color: '#FF6B35',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '600',
  },
  selectText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  selectedText: {
    color: '#47B76F',
    fontWeight: 'bold',
  },
  savingsText: {
    color: '#FF6B35',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '600',
    lineHeight: 14,
  },
  savingsBadge: {
    position: 'absolute',
    left: -12,
    top: 20,
    backgroundColor: '#FF6B35',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 80,
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
    transform: [{ rotate: '-10deg' }],
  },
  savingsAmount: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 14,
  },
  savingsDescription: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    margin: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'purple',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalFeatures: {
    marginBottom: 20,
  },
  modalFeature: {
    color: '#333',
    marginBottom: 8,
    lineHeight: 20,
  },
  trialDisclaimer: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 24,
    marginTop: 6,
    marginBottom: 4,
  },
  gateTrialContainer: {
    marginTop: 18,
    alignItems: 'center',
    paddingHorizontal: 24,
    maxWidth: 480,
  },
  gateTrialButton: {
    backgroundColor: '#34C759',
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: 36,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  gateTrialButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: 'bold',
  },
  // Phone-only: keeps the trial offer under the gate instead of overlapping it
  gateTrialContainerPhone: {
    marginTop: 12,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
  },
  gateTrialButtonPhone: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 26,
  },
  gateTrialButtonTextPhone: {
    fontSize: 15,
  },
  trialDisclaimerPhone: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  modalCloseButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
    paddingHorizontal: 5,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginHorizontal: 10,
  },
  subscriptionInfoLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  subscriptionInfoContent: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  subscriptionDetails: {
    marginBottom: 16,
  },
  subscriptionDetailText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
    lineHeight: 20,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#333',
  },
  legalLinksContainer: {
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    paddingTop: 12,
  },
  legalLink: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  legalLinkText: {
    fontSize: 14,
    color: '#007AFF',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});

export default Subscription;
