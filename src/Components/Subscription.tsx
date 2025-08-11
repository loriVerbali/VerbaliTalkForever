import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Modal,
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
  context?: 'settings' | 'onboarding';
}

// Subscription product IDs for MaTalk subscription group
const SUBSCRIPTION_SKUS = Platform.select({
  ios: ['matalkai.monthly', 'matalkai.annual'],
  android: [], // Not needed for iOS-only implementation
}) as string[];

const Subscription: React.FC<SubscriptionProps> = ({
  setGotSubscription,
  context = 'onboarding',
}) => {
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
  const [showModal, setShowModal] = useState(false);
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

      const sku = plan === 'monthly' ? 'matalkai.monthly' : 'matalkai.annual';

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

  const getRegularPrice = (plan: SubscriptionPlan): string => {
    if (Platform.OS === 'ios' && subscriptions.length > 0) {
      const sku = plan === 'monthly' ? 'matalkai.monthly' : 'matalkai.annual';

      const subscription = subscriptions.find(sub => sub.productId === sku);

      if (subscription) {
        // Always return the regular price, not the introductory price
        const finalPrice = subscription.localizedPrice || subscription.price;
        return finalPrice;
      }
    }

    return '';
  };

  const getIntroductoryOfferText = (plan: SubscriptionPlan): string | null => {
    if (Platform.OS === 'ios' && subscriptions.length > 0) {
      const sku = plan === 'monthly' ? 'matalkai.monthly' : null;

      if (sku) {
        const subscription = subscriptions.find(sub => sub.productId === sku);

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
      height: isSmallPhone ? 110 : isMediumPhone ? 125 : 135, // Even smaller height
      overflow: 'visible' as const,
    },
    cardsContainer: {
      ...styles.cardsContainer,
      width: isTablet ? ('90%' as const) : ('95%' as const),
      justifyContent: 'space-around' as const,
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
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 6,
      zIndex: 10,
      transform: [{rotate: '15deg'}],
    },
    plusButton: {
      backgroundColor: 'rgba(0, 122, 255, 0.6)',
      borderRadius: isSmallPhone ? 15 : 20,
      width: isSmallPhone ? 30 : 40,
      height: isSmallPhone ? 30 : 40,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      shadowColor: '#007AFF',
      shadowOffset: {width: 0, height: 1},
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
                {fontSize: isSmallPhone ? 12 : 13, fontWeight: '600'},
              ]}>
              Annual Plan
            </Text>
          </View>
          <View style={styles.cardContent}>
            <Text
              style={[
                dynamicStyles.planPrice,
                {
                  fontSize: isSmallPhone ? 16 : 18,
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
              Save $60 (2 months free)
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
                {fontSize: isSmallPhone ? 6 : isMediumPhone ? 6 : 6},
              ]}>
              {'Intro offer 75% \n off the first 3 months'}
            </Text>
          </View>
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
                {fontSize: isSmallPhone ? 12 : 13, fontWeight: '600'},
              ]}>
              Monthly Plan
            </Text>
          </View>
          <View style={styles.cardContent}>
            <Text
              style={[
                dynamicStyles.planPrice,
                {
                  fontSize: isSmallPhone ? 16 : 18,
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
                  fontSize: isSmallPhone ? 9 : 10,
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
                dynamicStyles.planSubtitle,
                {
                  fontSize: isSmallPhone ? 10 : 11,
                  fontWeight: 'normal',
                  color: '#000',
                },
              ]}>
              Then {getRegularPrice('monthly')}/month thereafter
            </Text>
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
      </View>
      <View style={{marginTop: 1, alignItems: 'center', flexDirection: 'row'}}>
        <Text
          style={[
            styles.modalFeature,
            {fontSize: isTablet ? 14 : 12, fontWeight: 'bold'},
          ]}>
          Both plans include:
        </Text>
        <Text style={[styles.modalFeature, {fontSize: isTablet ? 14 : 12}]}>
          <Text style={{color: 'purple'}}>✓</Text> Full access to all features
        </Text>
        <Text style={[styles.modalFeature, {fontSize: isTablet ? 14 : 12}]}>
          <Text style={{color: 'purple'}}>✓</Text> AI-powered AAC creation
        </Text>
        <Text style={[styles.modalFeature, {fontSize: isTablet ? 14 : 12}]}>
          <Text style={{color: 'purple'}}>✓</Text> Customer support
        </Text>
      </View>

      <View style={{marginTop: 1, alignItems: 'center'}}>
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
            Subscription automatically renews unless canceled at least 24 hours
            before the end of the current period.All subscriptions can be
            managed in your App Store account settings.
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    flex: 1,
    backgroundColor: '#FFF8E7',
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
    flexWrap: 'nowrap',
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
    shadowOffset: {width: 0, height: 2},
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
});

export default Subscription;
