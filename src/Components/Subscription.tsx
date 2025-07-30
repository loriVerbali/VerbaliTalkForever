import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
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
import {useAdmin} from '../contexts/adminContext';
import {useToast} from '../contexts/ToastContext';
import {validateSubscription} from '../utils/recieptValidation';
import {useAppSettings} from '../utils/persistance';

const {width, height} = Dimensions.get('window');

export type SubscriptionPlan = 'monthly' | 'yearly';

interface SubscriptionProps {
  setGotSubscription: (gotSubscription: boolean) => void;
}

// Subscription product IDs for MaTalk subscription group
const SUBSCRIPTION_SKUS = Platform.select({
  ios: ['matalkai.monthly', 'matalkai.annual'],
  android: [], // Not needed for iOS-only implementation
}) as string[];

const Subscription: React.FC<SubscriptionProps> = ({setGotSubscription}) => {
  const {isTablet} = useAdmin();
  const {showSuccess, showError} = useToast();

  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isIAPInitialized, setIsIAPInitialized] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(
    null,
  );
  const [showParentalGate, setShowParentalGate] = useState(true); // Start with parental gate shown
  const [parentalGatePassed, setParentalGatePassed] = useState(false); // Track if parental gate was passed
  const {setItem} = useAppSettings();

  // Initialize IAP connection
  useEffect(() => {
    if (Platform.OS === 'ios' && parentalGatePassed) {
      !purchaseSuccess ? initializeIAP() : null;
    }

    return () => {
      if (Platform.OS === 'ios') {
        endConnection();
      }
    };
  }, [purchaseSuccess, parentalGatePassed]);

  const initializeIAP = async () => {
    try {
      const result = await initConnection();

      if (result) {
        const purchases = await getAvailablePurchases();

        const owned = purchases.some(
          p =>
            p.productId === 'matalkai.monthly' ||
            p.productId === 'matalkai.annual',
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
          } else {
            setGotSubscription(false);
          }
          return;
        }
      }
    } catch (error) {
      console.error('💥 initializeIAP: IAP initialization failed:', error);
    }
  };

  const loadSubscriptions = async () => {
    try {
      const products = await getSubscriptions({skus: SUBSCRIPTION_SKUS});
      setSubscriptions(products);
    } catch (error) {
      console.error(
        '💥 loadSubscriptions: Failed to load subscriptions:',
        error,
      );
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
          console.log('Purchase error', error);
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
      console.log('🔄 handlePurchaseUpdate: Setting loading to false');
      setIsLoading(false);

      if (purchase.transactionReceipt) {
        // Purchase successful

        // Finish the transaction
        const finishResult = await finishTransaction({purchase});
        const isActive = await validateSubscription(
          purchase.transactionReceipt,
        );
        if (isActive) {
          await setItem('isIOSActive', isActive ? '1' : '0');
          setGotSubscription(true);
          setPurchaseSuccess(true);
        }

        // Optionally, you can store purchase info if needed
      } else {
        console.log('⚠️ handlePurchaseUpdate: No transaction receipt found');
      }
    } catch (error) {
      console.error('💥 handlePurchaseUpdate: Error handling purchase:', error);
    }
  };

  const handlePlanSelection = async (plan: SubscriptionPlan) => {
    // Directly proceed with purchase since parental gate was already passed
    setSelectedPlan(plan);
    if (Platform.OS === 'ios' && isIAPInitialized) {
      await purchaseSubscription(plan);
    }
  };

  const handleParentalGateSuccess = async () => {
    setShowParentalGate(false);
    setParentalGatePassed(true);
  };

  const purchaseSubscription = async (plan: SubscriptionPlan) => {
    try {
      setIsLoading(true);

      const sku = plan === 'monthly' ? 'matalkai.monthly' : 'matalkai.oneyear';

      // Clear any pending transactions
      await clearTransactionIOS();
      // Request subscription with introductory offer support
      const purchaseResult = await requestSubscription({sku});
      if (purchaseResult) {
        setPurchaseSuccess(true);
        setGotSubscription(true);
      }
    } catch (error) {
      console.error('💥 purchaseSubscription: Purchase failed:', error);
      setIsLoading(false);
      showError(
        'Unable to complete your purchase. Please try again or contact support.',
      );
    }
  };

  const getSubscriptionPrice = (plan: SubscriptionPlan): string => {
    if (Platform.OS === 'ios' && subscriptions.length > 0) {
      const sku = plan === 'monthly' ? 'matalkai.monthly' : 'matalkai.annual';

      const subscription = subscriptions.find(sub => sub.productId === sku);

      if (subscription) {
        // Check for introductory offer
        if (subscription.introductoryPrice) {
          return subscription.introductoryPrice;
        }

        const finalPrice = subscription.localizedPrice || subscription.price;

        return finalPrice;
      }
    }

    // Fallback to hardcoded prices

    return '';
  };

  const getIntroductoryOfferText = (plan: SubscriptionPlan): string | null => {
    if (Platform.OS === 'ios' && subscriptions.length > 0) {
      const sku = plan === 'monthly' ? 'matalkai.monthly' : null;

      if (sku) {
        const subscription = subscriptions.find(sub => sub.productId === sku);

        if (subscription?.introductoryPrice) {
          const offerText =
            plan === 'monthly' ? ' after 3 months :  $29.99/month' : null;

          if (offerText) {
            return offerText;
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
        ? width * 0.75
        : isMediumPhone
        ? width * 0.38
        : width * 0.35,
      height: isSmallPhone ? 120 : isMediumPhone ? 140 : 150, // Much smaller height
      overflow: 'visible' as const,
    },
    cardsContainer: {
      ...styles.cardsContainer,
      width: isTablet ? ('90%' as const) : ('95%' as const),
      justifyContent: isSmallPhone
        ? ('center' as const)
        : ('space-around' as const),
      flexDirection: isSmallPhone ? ('column' as const) : ('row' as const),
      gap: isSmallPhone ? 15 : 25, // Smaller gap
      marginTop: isTablet ? 0 : 32,
    },
    planTitle: {
      ...styles.planTitle,
      fontSize: isSmallPhone ? 12 : isMediumPhone ? 13 : 14,
      marginBottom: isSmallPhone ? 4 : 6,
    },
    planPrice: {
      ...styles.planPrice,
      fontSize: isSmallPhone ? 14 : isMediumPhone ? 16 : 18,
      marginBottom: isSmallPhone ? 2 : 3,
    },
    planSubtitle: {
      ...styles.planSubtitle,
      fontSize: isSmallPhone ? 10 : isMediumPhone ? 11 : 12,
      marginBottom: isSmallPhone ? 4 : 6,
    },
    introOfferText: {
      ...styles.introOfferText,
      fontSize: isSmallPhone ? 11 : isMediumPhone ? 12 : 13,
      marginBottom: isSmallPhone ? 4 : 6,
    },
    selectText: {
      ...styles.selectText,
      fontSize: isSmallPhone ? 9 : isMediumPhone ? 10 : 11,
    },
    popularBadge: {
      ...styles.popularBadge,
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
      left: isSmallPhone ? -6 : -10,
      top: isSmallPhone ? 10 : 15,
      minWidth: isSmallPhone ? 50 : 60,
      minHeight: isSmallPhone ? 50 : 60,
      paddingHorizontal: isSmallPhone ? 6 : 8,
      paddingVertical: isSmallPhone ? 6 : 8,
      borderRadius: isSmallPhone ? 15 : 20,
    },
    cancelBadge: {
      position: 'absolute' as const,
      right: isSmallPhone ? -6 : -10,
      bottom: isSmallPhone ? 5 : 8,
      backgroundColor: '#FF6B35',
      borderRadius: isSmallPhone ? 12 : 15,
      paddingHorizontal: isSmallPhone ? 4 : 6,
      paddingVertical: isSmallPhone ? 4 : 6,
      minWidth: isSmallPhone ? 40 : 50,
      minHeight: isSmallPhone ? 35 : 45,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      shadowColor: '#FF6B35',
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 6,
      zIndex: 10,
      transform: [{rotate: '10deg'}],
    },
  };

  // Show parental gate first
  if (showParentalGate) {
    return (
      <View style={styles.container}>
        <ParentalGate onSuccess={handleParentalGateSuccess} />
      </View>
    );
  }

  // Show subscription plans only after parental gate is passed
  return (
    <View style={styles.container}>
      <View style={dynamicStyles.cardsContainer}>
        <TouchableOpacity
          style={[
            dynamicStyles.card,
            selectedPlan === 'yearly' && styles.selectedCard,
          ]}
          onPress={() => {
            handlePlanSelection('yearly');
          }}
          disabled={isLoading}>
          <View style={dynamicStyles.savingsBadge}>
            <Text style={dynamicStyles.savingsAmount}>💰 SAVE</Text>
            <Text style={dynamicStyles.savingsAmount}>$60!</Text>
            <Text style={dynamicStyles.savingsDescription}>2 months FREE</Text>
          </View>
          <View
            style={[
              styles.cardHeader,
              {
                backgroundColor:
                  selectedPlan === 'yearly' ? '#E8F5E8' : '#FFE4E1',
              },
            ]}>
            <Text style={dynamicStyles.popularBadge}>Most Popular</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={dynamicStyles.planTitle}>Annual Plan</Text>
            <Text style={dynamicStyles.planPrice}>
              {getSubscriptionPrice('yearly')}
            </Text>
            <Text style={dynamicStyles.planSubtitle}>per year</Text>
            <Text
              style={[
                dynamicStyles.selectText,
                selectedPlan === 'yearly' && styles.selectedText,
              ]}>
              {isLoading && selectedPlan === 'yearly'
                ? 'Processing...'
                : selectedPlan === 'yearly'
                ? 'Selected'
                : 'Select Plan'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            dynamicStyles.card,
            selectedPlan === 'monthly' && styles.selectedCard,
          ]}
          onPress={() => {
            handlePlanSelection('monthly');
          }}
          disabled={isLoading}>
          <View style={dynamicStyles.cancelBadge}>
            <Text
              style={[
                dynamicStyles.savingsAmount,
                {fontSize: isSmallPhone ? 6 : isMediumPhone ? 7 : 8},
              ]}>
              {'Cancel anytime'}
            </Text>
          </View>
          <View
            style={[
              styles.cardHeader,
              {
                backgroundColor:
                  selectedPlan === 'monthly' ? '#E8F5E8' : '#FFE4E1',
              },
            ]}>
            <Text style={dynamicStyles.planTitle}>Monthly Plan</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={dynamicStyles.planPrice}>
              {getIntroductoryOfferText('monthly')
                ? `${getSubscriptionPrice('monthly')} per month for 3 months`
                : `${getSubscriptionPrice('monthly')} per month`}
            </Text>

            {getIntroductoryOfferText('monthly') && (
              <Text style={dynamicStyles.introOfferText}>
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
                : 'Select Plan'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  cardsContainer: {
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '90%',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    borderRadius: 16,
    overflow: 'visible',
    shadowColor: 'gray',
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
    backgroundColor: 'white',
    marginBottom: height * 0.02,
    width: width * 0.28,
    position: 'relative',
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
    paddingVertical: 6,
    alignItems: 'center',
  },
  cardContent: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    alignItems: 'center',
  },
  popularBadge: {
    color: '#8E24AA',
    fontSize: 12,
    fontWeight: 'bold',
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
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
    transform: [{rotate: '-10deg'}],
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
});

export default Subscription;
