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
  getSubscriptions,
  requestSubscription,
  clearTransactionIOS,
  endConnection,
  PurchaseError,
  SubscriptionPurchase,
  ProductPurchase,
  Purchase,
  getAvailablePurchases,
} from 'react-native-iap';
import { useAdmin } from '../contexts/adminContext';
import { useToast } from '../contexts/ToastContext';
import { validateSubscription } from '../utils/recieptValidation';
import { useAppSettings } from '../utils/persistance';
// Removed trialUtils import - this is a paid app
import { Mixpanel } from 'mixpanel-react-native';

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
  const mixpanel = new Mixpanel('f88f7a27585868c53b1e08c06f5226bd', true);
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



  // Removed trial card logic - this is a paid app

  // Initialize IAP connection immediately to check existing subscription
  useEffect(() => {
    if (!purchaseSuccess) {
      initializeIAP();
    }

    return () => {
      endConnection();
    };
  }, [purchaseSuccess]);

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

          const latestReceipt = latestPurchase.transactionReceipt;
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
      const products = await getSubscriptions({ skus: SUBSCRIPTION_SKUS });
      setSubscriptions(products);
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
      (purchase: SubscriptionPurchase | ProductPurchase) => {
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

      if (purchase.transactionReceipt) {
        // Finish the transaction

        const finishResult = await finishTransaction({ purchase });

        const isActive = await validateSubscription(
          purchase.transactionReceipt,
        );

        if (isActive) {
          await setItem('isIOSActive', isActive ? '1' : '0');
          setGotSubscription(true);
          setPurchaseSuccess(true);
        }

        // Optionally, you can store purchase info if needed
      }
    } catch (error) {
      console.error('💥 handlePurchaseUpdate: Error handling purchase:', error);
    }
  };

  const handlePlanSelection = async (plan: SubscriptionPlan) => {
    // Directly proceed with purchase since parental gate was already passed
    setSelectedPlan(plan);

    mixpanel.track('Onboarding Subscription Selected', {
      screen_label: 'subscription',
      selection_type: plan === 'monthly' ? 'monthly' : 'yearly',
    });

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

      // Set trial status and grant access
      await setItem('isInTrial', '1');

      // Grant app access
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

        // iOS uses the traditional sku parameter
        const purchaseResult = await requestSubscription({ sku });

        if (purchaseResult) {
          setPurchaseSuccess(true);
          setGotSubscription(true);
        }
      } else {
        // Android - Google Play Billing v6+ requires subscriptionOffers with offerToken

        const subscription = subscriptions.find(sub => sub.productId === sku);
        if (!subscription) {
          console.error(
            '💥 purchaseSubscription: Android - Subscription not found for SKU:',
            sku,
          );
          throw new Error(`Subscription not found for SKU: ${sku}`);
        }

        // Extract offerToken from subscription details
        let offerToken: string | undefined;
        let basePlanId: string | undefined;

        if (
          subscription.subscriptionOfferDetails &&
          subscription.subscriptionOfferDetails.length > 0
        ) {
          // Look for introductory offer first (if exists)
          const introOffer = subscription.subscriptionOfferDetails.find(
            (offer: any) => offer.offerId,
          );

          if (introOffer && introOffer.offerToken) {
            offerToken = introOffer.offerToken;
            basePlanId = introOffer.basePlanId;
          } else {
            // Fall back to base plan offer
            const baseOffer =
              subscription.subscriptionOfferDetails.find(
                (offer: any) => !offer.offerId,
              ) || subscription.subscriptionOfferDetails[0];

            if (baseOffer && baseOffer.offerToken) {
              offerToken = baseOffer.offerToken;
              basePlanId = baseOffer.basePlanId;
            }
          }
        }

        if (!offerToken) {
          console.error(
            '💥 purchaseSubscription: Android - No offerToken found in subscription details',
          );
          console.error(
            '💥 purchaseSubscription: Android - Available subscription offer details:',
            JSON.stringify(subscription.subscriptionOfferDetails, null, 2),
          );
          throw new Error(
            'No offerToken found for Android subscription. Please ensure your subscription is properly configured in Google Play Console.',
          );
        }

        // Android uses subscriptionOffers parameter for Google Play Billing v6+
        const subscriptionOffer: any = {
          sku,
          offerToken,
        };
        if (basePlanId) {
          subscriptionOffer.basePlanId = basePlanId;
        }

        const purchaseResult = await requestSubscription({
          subscriptionOffers: [subscriptionOffer],
        });

        if (purchaseResult) {
          setPurchaseSuccess(true);
          setGotSubscription(true);
        }
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

      const subscription = subscriptions.find(sub => sub.productId === sku);

      if (subscription) {
        if (Platform.OS === 'android') {
          // Android subscription structure
          if (
            subscription.subscriptionOfferDetails &&
            subscription.subscriptionOfferDetails.length > 0
          ) {
            // Look for introductory offer first (offerId exists)
            const introOffer = subscription.subscriptionOfferDetails.find(
              (offer: any) => offer.offerId,
            );
            if (
              introOffer &&
              introOffer.pricingPhases &&
              introOffer.pricingPhases.pricingPhaseList &&
              introOffer.pricingPhases.pricingPhaseList.length > 0
            ) {
              const introPrice =
                introOffer.pricingPhases.pricingPhaseList[0].formattedPrice;

              return introPrice;
            }

            // Fall back to regular price
            const regularOffer = subscription.subscriptionOfferDetails[0];
            if (
              regularOffer &&
              regularOffer.pricingPhases &&
              regularOffer.pricingPhases.pricingPhaseList &&
              regularOffer.pricingPhases.pricingPhaseList.length > 0
            ) {
              const regularPrice =
                regularOffer.pricingPhases.pricingPhaseList[
                  regularOffer.pricingPhases.pricingPhaseList.length - 1
                ].formattedPrice;

              return regularPrice;
            }
          }
        } else {
          // iOS subscription structure
          // Check for introductory offer
          if (subscription.introductoryPrice) {
            return subscription.introductoryPrice;
          }

          const finalPrice = subscription.localizedPrice || subscription.price;

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

      const subscription = subscriptions.find(sub => sub.productId === sku);

      if (subscription) {
        if (Platform.OS === 'android') {
          // Android subscription structure - always get the regular price (last pricing phase)
          if (
            subscription.subscriptionOfferDetails &&
            subscription.subscriptionOfferDetails.length > 0
          ) {
            const regularOffer =
              subscription.subscriptionOfferDetails.find(
                (offer: any) => !offer.offerId,
              ) || subscription.subscriptionOfferDetails[0];
            if (
              regularOffer &&
              regularOffer.pricingPhases &&
              regularOffer.pricingPhases.pricingPhaseList &&
              regularOffer.pricingPhases.pricingPhaseList.length > 0
            ) {
              const regularPrice =
                regularOffer.pricingPhases.pricingPhaseList[
                  regularOffer.pricingPhases.pricingPhaseList.length - 1
                ].formattedPrice;

              return regularPrice;
            }
          }
        } else {
          // iOS subscription structure - always return the regular price, not the introductory price
          const finalPrice = subscription.localizedPrice || subscription.price;

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
        const subscription = subscriptions.find(sub => sub.productId === sku);

        if (Platform.OS === 'android') {
          // Android subscription structure
          if (
            subscription.subscriptionOfferDetails &&
            subscription.subscriptionOfferDetails.length > 0
          ) {
            const introOffer = subscription.subscriptionOfferDetails.find(
              (offer: any) => offer.offerId,
            );
            if (
              introOffer &&
              introOffer.pricingPhases &&
              introOffer.pricingPhases.pricingPhaseList &&
              introOffer.pricingPhases.pricingPhaseList.length > 1
            ) {
              const introPrice =
                introOffer.pricingPhases.pricingPhaseList[0].formattedPrice;
              const introCycles =
                introOffer.pricingPhases.pricingPhaseList[0].billingCycleCount;

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
          if (subscription?.introductoryPrice) {
            // Use the actual introductory price from IAP
            const introPrice = subscription.introductoryPrice;
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
      height: isTablet
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

  // Show parental gate first
  if (showParentalGate) {
    return (
      <View style={styles.container}>
        <ParentalGate
          onSuccess={handleParentalGateSuccess}
          isSettingsContext={context === 'settings'}
          message="Choosing a plan is a protected area. Ask your parents to continue:"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isLoadingSubscriptions ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
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
          {/* Toggle Switch for Yearly/Monthly - trial removed for paid app */}
          {false && (
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
            {false && (
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

            {/* Show yearly card only when showYearlyPlan is true - trial removed for paid app */}
            {showYearlyPlan && (
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

            {/* Show monthly card only when showYearlyPlan is false - trial removed for paid app */}
            {!showYearlyPlan && (
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

          <View
            style={{ marginTop: 1, alignItems: 'center', flexDirection: 'row' }}>
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
                <TouchableOpacity onPress={handleToggleSubscriptionInfo}>
                  <Text
                    style={{
                      color: '#007AFF',
                      fontWeight: 'bold',
                      fontSize: isTablet ? 12 : 10,
                    }}>
                    Subscription Information{showSubscriptionInfo ? ' ▼' : ' ▶'}
                  </Text>
                </TouchableOpacity>
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
