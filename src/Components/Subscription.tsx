// import React, {useState, useEffect} from 'react';
// import {
//   View,
//   Text,
//   TouchableOpacity,
//   StyleSheet,
//   Dimensions,
//   Platform,
// } from 'react-native';
// // import {
// //   initConnection,
// //   purchaseUpdatedListener,
// //   purchaseErrorListener,
// //   finishTransaction,
// //   getSubscriptions,
// //   requestSubscription,
// //   clearTransactionIOS,
// //   endConnection,
// //   PurchaseError,
// //   SubscriptionPurchase,
// //   ProductPurchase,
// //   Purchase,
// // } from 'react-native-iap';
// import {useAdmin} from '../contexts/adminContext';
// import {useToast} from '../contexts/ToastContext';

// const {width, height} = Dimensions.get('window');

// export type SubscriptionPlan = 'monthly' | 'yearly';

// // interface SubscriptionProps {
// //   onPlanSelect: (plan: SubscriptionPlan) => void;
// //   selectedPlan?: SubscriptionPlan;
// //   onPurchaseSuccess?: (purchase: Purchase) => void;
// //   onPurchaseError?: (error: PurchaseError) => void;
// // }

// // // Subscription product IDs for MaTalk subscription group
// // const SUBSCRIPTION_SKUS = Platform.select({
// //   ios: ['verbali.matalkai.monthly', 'verbali.matalkai.oneyear'],
// //   android: [], // Not needed for iOS-only implementation
// // }) as string[];

// const Subscription: React.FC<SubscriptionProps> = ({
//   onPlanSelect,
//   selectedPlan,
//   onPurchaseSuccess,
//   onPurchaseError,
// }) => {
//   const {isTablet} = useAdmin();
//   const {showSuccess, showError} = useToast();

//   console.log('🚀 Subscription component initialized');
//   console.log('📱 Platform:', Platform.OS);
//   console.log('📱 Device type:', isTablet ? 'Tablet' : 'Phone');
//   console.log('🏷️ SUBSCRIPTION_SKUS:', SUBSCRIPTION_SKUS);
//   console.log('⚙️ Props received:', {
//     selectedPlan,
//     onPlanSelect: !!onPlanSelect,
//     onPurchaseSuccess: !!onPurchaseSuccess,
//     onPurchaseError: !!onPurchaseError,
//   });

//   const [subscriptions, setSubscriptions] = useState<any[]>([]);
//   const [isLoading, setIsLoading] = useState(false);
//   const [isIAPInitialized, setIsIAPInitialized] = useState(false);

//   // Initialize IAP connection
//   useEffect(() => {
//     console.log('🔄 useEffect triggered - checking platform');
//     if (Platform.OS === 'ios') {
//       console.log('📱 iOS detected - initializing IAP');
//       initializeIAP();
//     } else {
//       console.log('🚫 Non-iOS platform - skipping IAP initialization');
//     }

//     return () => {
//       console.log('🧹 Component cleanup - ending connection');
//       if (Platform.OS === 'ios') {
//         endConnection();
//       }
//     };
//   }, []);

//   const initializeIAP = async () => {
//     console.log('🔧 initializeIAP: Starting IAP initialization');
//     try {
//       console.log('🔗 initializeIAP: Calling initConnection()');
//       const result = await initConnection();
//       console.log('✅ initializeIAP: initConnection result:', result);

//       if (result) {
//         console.log(
//           '✅ initializeIAP: Connection successful - setting initialized to true',
//         );
//         setIsIAPInitialized(true);

//         console.log('📦 initializeIAP: Loading subscriptions');
//         await loadSubscriptions();

//         console.log('👂 initializeIAP: Setting up purchase listeners');
//         setupPurchaseListeners();

//         console.log('🎉 initializeIAP: Initialization complete');
//       } else {
//         console.log('❌ initializeIAP: Connection failed - result was falsy');
//       }
//     } catch (error) {
//       console.error('💥 initializeIAP: IAP initialization failed:', error);
//       showError(
//         'Having trouble setting up subscriptions. Please try again in a moment.',
//       );
//     }
//   };

//   const loadSubscriptions = async () => {
//     console.log('📦 loadSubscriptions: Starting to load subscriptions');
//     console.log('📦 loadSubscriptions: SKUs to load:', SUBSCRIPTION_SKUS);
//     console.log('📦 loadSubscriptions: Platform check:', Platform.OS);
//     console.log(
//       '📦 loadSubscriptions: Environment check:',
//       __DEV__ ? 'Development' : 'Production',
//     );

//     try {
//       console.log('📦 loadSubscriptions: Calling getSubscriptions()');
//       const products = await getSubscriptions({skus: SUBSCRIPTION_SKUS});
//       console.log('✅ loadSubscriptions: Products received:', products);
//       console.log('📊 loadSubscriptions: Products count:', products.length);
//       console.log(
//         '🔍 loadSubscriptions: Raw products data:',
//         JSON.stringify(products, null, 2),
//       );

//       if (products.length === 0) {
//         console.log(
//           '⚠️ loadSubscriptions: No products found - this indicates StoreKit configuration issue',
//         );
//         console.log('⚠️ loadSubscriptions: Please check:');
//         console.log('   1. StoreKit configuration is selected in Xcode scheme');
//         console.log('   2. Running in iOS Simulator (not device)');
//         console.log('   3. StoreKit testing is properly configured');
//       }

//       products.forEach((product, index) => {
//         console.log(`📦 loadSubscriptions: Product ${index + 1}:`, {
//           productId: product.productId,
//           title: product.title,
//           description: product.description,
//           price: (product as any).price,
//           localizedPrice: (product as any).localizedPrice,
//           currency: (product as any).currency,
//           introductoryPrice: (product as any).introductoryPrice,
//           introductoryPriceAsAmountIOS: (product as any)
//             .introductoryPriceAsAmountIOS,
//           introductoryPricePaymentModeIOS: (product as any)
//             .introductoryPricePaymentModeIOS,
//           introductoryPriceNumberOfPeriodsIOS: (product as any)
//             .introductoryPriceNumberOfPeriodsIOS,
//           introductoryPriceSubscriptionPeriodIOS: (product as any)
//             .introductoryPriceSubscriptionPeriodIOS,
//         });
//       });

//       setSubscriptions(products);
//       console.log('✅ loadSubscriptions: Subscriptions state updated');
//     } catch (error) {
//       console.error(
//         '💥 loadSubscriptions: Failed to load subscriptions:',
//         error,
//       );
//       console.error('💥 loadSubscriptions: Error details:', {
//         message: (error as any).message,
//         code: (error as any).code,
//         name: (error as any).name,
//         stack: (error as any).stack,
//       });
//       showError(
//         'Unable to load subscription plans. Please check your connection and try again.',
//       );
//     }
//   };

//   const setupPurchaseListeners = () => {
//     console.log('👂 setupPurchaseListeners: Setting up purchase listeners');

//     const purchaseUpdateSubscription = purchaseUpdatedListener(
//       (purchase: SubscriptionPurchase | ProductPurchase) => {
//         console.log(
//           '🛒 purchaseUpdatedListener: Purchase update received:',
//           purchase,
//         );
//         handlePurchaseUpdate(purchase);
//       },
//     );

//     const purchaseErrorSubscription = purchaseErrorListener(
//       (error: PurchaseError) => {
//         console.error(
//           '💥 purchaseErrorListener: Purchase error received:',
//           error,
//         );
//         console.error('💥 purchaseErrorListener: Error details:', {
//           message: error.message,
//           code: error.code,
//           debugMessage: error.debugMessage,
//           responseCode: error.responseCode,
//           userCancelled: (error as any).userCancelled,
//         });

//         console.log('🔄 purchaseErrorListener: Setting loading to false');
//         setIsLoading(false);

//         if (onPurchaseError) {
//           console.log(
//             '📞 purchaseErrorListener: Calling onPurchaseError callback',
//           );
//           onPurchaseError(error);
//         } else {
//           console.log(
//             '⚠️ purchaseErrorListener: No onPurchaseError callback - showing toast',
//           );
//           showError('Purchase was cancelled or failed. Please try again.');
//         }
//       },
//     );

//     console.log('✅ setupPurchaseListeners: Listeners set up successfully');

//     return () => {
//       console.log('🧹 setupPurchaseListeners: Cleaning up listeners');
//       purchaseUpdateSubscription?.remove();
//       purchaseErrorSubscription?.remove();
//     };
//   };

//   const handlePurchaseUpdate = async (purchase: Purchase) => {
//     console.log('🛒 handlePurchaseUpdate: Processing purchase update');
//     console.log('🛒 handlePurchaseUpdate: Purchase details:', {
//       productId: purchase.productId,
//       transactionId: purchase.transactionId,
//       transactionDate: purchase.transactionDate,
//       transactionReceipt: purchase.transactionReceipt ? 'Present' : 'Missing',
//       purchaseToken: purchase.purchaseToken,
//       originalTransactionDateIOS: purchase.originalTransactionDateIOS,
//       originalTransactionIdentifierIOS:
//         purchase.originalTransactionIdentifierIOS,
//     });

//     try {
//       console.log('🔄 handlePurchaseUpdate: Setting loading to false');
//       setIsLoading(false);

//       if (purchase.transactionReceipt) {
//         console.log(
//           '✅ handlePurchaseUpdate: Transaction receipt found - purchase successful',
//         );

//         // Purchase successful
//         if (onPurchaseSuccess) {
//           console.log(
//             '📞 handlePurchaseUpdate: Calling onPurchaseSuccess callback',
//           );
//           onPurchaseSuccess(purchase);
//         } else {
//           console.log(
//             '⚠️ handlePurchaseUpdate: No onPurchaseSuccess callback - showing toast',
//           );
//           showSuccess(
//             '🎉 Welcome to MaTalk Premium! Your subscription is now active.',
//           );
//         }

//         // Finish the transaction
//         console.log('🏁 handlePurchaseUpdate: Finishing transaction');
//         await finishTransaction({purchase});
//         console.log(
//           '✅ handlePurchaseUpdate: Transaction finished successfully',
//         );
//       } else {
//         console.log('⚠️ handlePurchaseUpdate: No transaction receipt found');
//       }
//     } catch (error) {
//       console.error('💥 handlePurchaseUpdate: Error handling purchase:', error);
//       showError(
//         'There was an issue processing your purchase. Please contact support if charged.',
//       );
//     }
//   };

//   const handlePlanSelection = async (plan: SubscriptionPlan) => {
//     console.log('📋 handlePlanSelection: Plan selected:', plan);
//     console.log('📋 handlePlanSelection: Current state:', {
//       isLoading,
//       isIAPInitialized,
//       platform: Platform.OS,
//       subscriptionsLoaded: subscriptions.length,
//     });

//     // Only call onPlanSelect for UI updates (showing selected state)
//     console.log(
//       '📞 handlePlanSelection: Calling onPlanSelect callback for UI update',
//     );
//     onPlanSelect(plan);

//     if (Platform.OS === 'ios' && isIAPInitialized) {
//       console.log(
//         '✅ handlePlanSelection: iOS and IAP initialized - proceeding with purchase',
//       );
//       await purchaseSubscription(plan);
//     } else {
//       console.log(
//         '⚠️ handlePlanSelection: Skipping purchase - not iOS or IAP not initialized',
//       );
//       // For non-iOS platforms, immediately call success callback since there's no actual purchase
//       if (onPurchaseSuccess) {
//         console.log(
//           '📞 handlePlanSelection: Calling onPurchaseSuccess for non-iOS platform',
//         );
//         onPurchaseSuccess({
//           productId:
//             plan === 'monthly'
//               ? 'verbali.matalkai.monthly'
//               : 'verbali.matalkai.oneyear',
//           transactionId: 'mock-transaction-' + Date.now(),
//           transactionDate: Date.now(),
//           transactionReceipt: 'mock-receipt',
//           purchaseToken: 'mock-token',
//         } as any);
//       }
//     }
//   };

//   const purchaseSubscription = async (plan: SubscriptionPlan) => {
//     console.log(
//       '💳 purchaseSubscription: Starting purchase process for plan:',
//       plan,
//     );

//     try {
//       console.log('🔄 purchaseSubscription: Setting loading to true');
//       setIsLoading(true);

//       const sku =
//         plan === 'monthly'
//           ? 'verbali.matalkai.monthly'
//           : 'verbali.matalkai.oneyear';

//       console.log('🏷️ purchaseSubscription: SKU determined:', sku);

//       // Clear any pending transactions
//       console.log('🧹 purchaseSubscription: Clearing pending transactions');
//       await clearTransactionIOS();
//       console.log('✅ purchaseSubscription: Pending transactions cleared');

//       // Request subscription with introductory offer support
//       console.log(
//         '🛒 purchaseSubscription: Requesting subscription with SKU:',
//         sku,
//       );
//       await requestSubscription({sku});
//       console.log(
//         '✅ purchaseSubscription: Subscription request sent successfully',
//       );
//     } catch (error) {
//       console.error('💥 purchaseSubscription: Purchase failed:', error);
//       console.error('💥 purchaseSubscription: Error details:', {
//         message: (error as any).message,
//         code: (error as any).code,
//         name: (error as any).name,
//         stack: (error as any).stack,
//       });

//       console.log(
//         '🔄 purchaseSubscription: Setting loading to false due to error',
//       );
//       setIsLoading(false);

//       showError(
//         'Unable to complete your purchase. Please try again or contact support.',
//       );
//     }
//   };

//   const getSubscriptionPrice = (plan: SubscriptionPlan): string => {
//     console.log('💰 getSubscriptionPrice: Getting price for plan:', plan);
//     console.log('💰 getSubscriptionPrice: Current state:', {
//       platform: Platform.OS,
//       subscriptionsCount: subscriptions.length,
//       subscriptions: subscriptions.map(sub => ({
//         productId: sub.productId,
//         price: sub.price,
//         localizedPrice: sub.localizedPrice,
//         introductoryPrice: sub.introductoryPrice,
//       })),
//     });

//     if (Platform.OS === 'ios' && subscriptions.length > 0) {
//       const sku =
//         plan === 'monthly'
//           ? 'verbali.matalkai.monthly'
//           : 'verbali.matalkai.oneyear';

//       console.log('🔍 getSubscriptionPrice: Looking for SKU:', sku);
//       const subscription = subscriptions.find(sub => sub.productId === sku);
//       console.log('🔍 getSubscriptionPrice: Found subscription:', subscription);

//       if (subscription) {
//         console.log('✅ getSubscriptionPrice: Subscription found');

//         // Check for introductory offer
//         if (subscription.introductoryPrice) {
//           console.log(
//             '🎁 getSubscriptionPrice: Using introductory price:',
//             subscription.introductoryPrice,
//           );
//           return subscription.introductoryPrice;
//         }

//         const finalPrice = subscription.localizedPrice || subscription.price;
//         console.log(
//           '💰 getSubscriptionPrice: Using regular price:',
//           finalPrice,
//         );
//         return finalPrice;
//       } else {
//         console.log(
//           '⚠️ getSubscriptionPrice: Subscription not found for SKU:',
//           sku,
//         );
//       }
//     } else {
//       console.log(
//         '⚠️ getSubscriptionPrice: Using fallback - not iOS or no subscriptions loaded',
//       );
//     }

//     // Fallback to hardcoded prices
//     const fallbackPrice = plan === 'monthly' ? '$29.99' : '$300';
//     console.log(
//       '💰 getSubscriptionPrice: Using fallback price:',
//       fallbackPrice,
//     );
//     return fallbackPrice;
//   };

//   const getIntroductoryOfferText = (plan: SubscriptionPlan): string | null => {
//     console.log(
//       '🎁 getIntroductoryOfferText: Checking introductory offer for plan:',
//       plan,
//     );

//     if (Platform.OS === 'ios' && subscriptions.length > 0) {
//       const sku = plan === 'monthly' ? 'verbali.matalkai.monthly' : null;

//       if (sku) {
//         console.log('🔍 getIntroductoryOfferText: Looking for SKU:', sku);

//         const subscription = subscriptions.find(sub => sub.productId === sku);
//         console.log(
//           '🔍 getIntroductoryOfferText: Found subscription:',
//           subscription,
//         );

//         if (subscription?.introductoryPrice) {
//           console.log(
//             '🎁 getIntroductoryOfferText: Introductory offer found:',
//             subscription.introductoryPrice,
//           );

//           const offerText =
//             plan === 'monthly'
//               ? 'First month $20, then $7/month for 3 months'
//               : null;

//           if (offerText) {
//             console.log(
//               '🎁 getIntroductoryOfferText: Returning offer text:',
//               offerText,
//             );
//             return offerText;
//           }
//         } else {
//           console.log(
//             '⚠️ getIntroductoryOfferText: No introductory offer found',
//           );
//         }
//       }
//     } else {
//       console.log(
//         '⚠️ getIntroductoryOfferText: Conditions not met for introductory offer',
//       );
//     }

//     console.log('🎁 getIntroductoryOfferText: Returning null');
//     return null;
//   };

//   // Log state changes
//   useEffect(() => {
//     console.log(
//       '📊 State change - subscriptions:',
//       subscriptions.length,
//       'items',
//     );
//   }, [subscriptions]);

//   useEffect(() => {
//     console.log('📊 State change - isLoading:', isLoading);
//   }, [isLoading]);

//   useEffect(() => {
//     console.log('📊 State change - isIAPInitialized:', isIAPInitialized);
//   }, [isIAPInitialized]);

//   useEffect(() => {
//     console.log('📊 State change - selectedPlan:', selectedPlan);
//   }, [selectedPlan]);

//   console.log('🎨 Rendering Subscription component with state:', {
//     subscriptions: subscriptions.length,
//     isLoading,
//     isIAPInitialized,
//     selectedPlan,
//   });

//   // Dynamic styles based on device type
//   const dynamicStyles = {
//     card: {
//       ...styles.card,
//       width: isTablet ? width * 0.35 : width * 0.4,
//       height: 180, // Fixed height for all cards
//       overflow: 'visible' as const,
//     },
//     cardsContainer: {
//       ...styles.cardsContainer,
//       width: isTablet ? ('90%' as const) : ('95%' as const),
//       justifyContent: 'center' as const,
//       gap: 30, // Increased gap to accommodate the badge
//     },
//   };

//   return (
//     <View style={styles.container}>
//       <View style={dynamicStyles.cardsContainer}>
//         <TouchableOpacity
//           style={[
//             dynamicStyles.card,
//             selectedPlan === 'yearly' && styles.selectedCard,
//           ]}
//           onPress={() => {
//             console.log('🎯 Yearly plan card pressed');
//             handlePlanSelection('yearly');
//           }}
//           disabled={isLoading}>
//           <View style={styles.savingsBadge}>
//             <Text style={styles.savingsAmount}>💰 SAVE</Text>
//             <Text style={styles.savingsAmount}>$60!</Text>
//             <Text style={styles.savingsDescription}>2 months FREE</Text>
//           </View>
//           <View
//             style={[
//               styles.cardHeader,
//               {
//                 backgroundColor:
//                   selectedPlan === 'yearly' ? '#E8F5E8' : '#FFE4E1',
//               },
//             ]}>
//             <Text style={styles.popularBadge}>Most Popular</Text>
//           </View>
//           <View style={styles.cardContent}>
//             <Text style={styles.planTitle}>Annual Plan</Text>
//             <Text style={styles.planPrice}>
//               {getSubscriptionPrice('yearly')}
//             </Text>
//             <Text style={styles.planSubtitle}>per year</Text>
//             <Text
//               style={[
//                 styles.selectText,
//                 selectedPlan === 'yearly' && styles.selectedText,
//               ]}>
//               {isLoading && selectedPlan === 'yearly'
//                 ? 'Processing...'
//                 : selectedPlan === 'yearly'
//                 ? 'Selected'
//                 : 'Select Plan'}
//             </Text>
//           </View>
//         </TouchableOpacity>

//         <TouchableOpacity
//           style={[
//             dynamicStyles.card,
//             selectedPlan === 'monthly' && styles.selectedCard,
//           ]}
//           onPress={() => {
//             console.log('🎯 Monthly plan card pressed');
//             handlePlanSelection('monthly');
//           }}
//           disabled={isLoading}>
//           <View
//             style={[
//               styles.cardHeader,
//               {
//                 backgroundColor:
//                   selectedPlan === 'monthly' ? '#E8F5E8' : '#FFE4E1',
//               },
//             ]}>
//             <Text style={styles.planTitle}>Monthly Plan</Text>
//           </View>
//           <View style={styles.cardContent}>
//             <Text style={styles.planPrice}>
//               {getSubscriptionPrice('monthly')}
//             </Text>
//             <Text style={styles.planSubtitle}>per month</Text>
//             {getIntroductoryOfferText('monthly') && (
//               <Text style={styles.introOfferText}>
//                 {getIntroductoryOfferText('monthly')}
//               </Text>
//             )}
//             <Text style={styles.savingsText}>
//               Maximum flexibility{'\n'}cancel anytime
//             </Text>
//             <Text
//               style={[
//                 styles.selectText,
//                 selectedPlan === 'monthly' && styles.selectedText,
//               ]}>
//               {isLoading && selectedPlan === 'monthly'
//                 ? 'Processing...'
//                 : selectedPlan === 'monthly'
//                 ? 'Selected'
//                 : 'Select Plan'}
//             </Text>
//           </View>
//         </TouchableOpacity>
//       </View>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     width: '100%',
//     alignItems: 'center',
//     paddingVertical: 20,
//   },
//   title: {
//     fontSize: 24,
//     fontWeight: 'bold',
//     marginBottom: 30,
//     color: '#333',
//   },
//   cardsContainer: {
//     justifyContent: 'space-around',
//     alignItems: 'center',
//     width: '90%',
//     flexDirection: 'row',
//     flexWrap: 'wrap',
//   },
//   card: {
//     borderRadius: 16,
//     overflow: 'visible',
//     shadowColor: 'gray',
//     shadowOpacity: 0.8,
//     shadowRadius: 5,
//     shadowOffset: {width: 0, height: 8},
//     elevation: 8,
//     backgroundColor: 'white',
//     marginBottom: height * 0.02,
//     width: width * 0.28,
//     position: 'relative',
//   },
//   selectedCard: {
//     shadowColor: '#47B76F',
//     shadowOpacity: 1,
//     elevation: 12,
//   },
//   cardHeader: {
//     width: '100%',
//     borderTopLeftRadius: 16,
//     borderTopRightRadius: 16,
//     paddingVertical: 8,
//     alignItems: 'center',
//   },
//   cardContent: {
//     backgroundColor: '#FFFFFF',
//     width: '100%',
//     paddingVertical: 12,
//     paddingHorizontal: 8,
//     borderBottomLeftRadius: 16,
//     borderBottomRightRadius: 16,
//     alignItems: 'center',
//   },
//   popularBadge: {
//     color: '#8E24AA',
//     fontSize: 12,
//     fontWeight: 'bold',
//   },
//   planTitle: {
//     fontWeight: 'bold',
//     fontSize: 16,
//     textAlign: 'center',
//     color: '#000',
//     marginBottom: 8,
//   },
//   planPrice: {
//     fontWeight: 'bold',
//     fontSize: 20,
//     color: '#146CF0',
//     textAlign: 'center',
//     marginBottom: 4,
//   },
//   planSubtitle: {
//     color: '#666',
//     fontSize: 14,
//     textAlign: 'center',
//     marginBottom: 8,
//   },
//   introOfferText: {
//     color: '#FF6B35',
//     fontSize: 10,
//     textAlign: 'center',
//     marginBottom: 8,
//     fontWeight: '600',
//   },
//   selectText: {
//     color: '#666',
//     fontSize: 12,
//     fontWeight: '600',
//     textAlign: 'center',
//   },
//   selectedText: {
//     color: '#47B76F',
//     fontWeight: 'bold',
//   },
//   savingsText: {
//     color: '#FF6B35',
//     fontSize: 11,
//     textAlign: 'center',
//     marginBottom: 8,
//     fontWeight: '600',
//     lineHeight: 14,
//   },
//   savingsBadge: {
//     position: 'absolute',
//     left: -12,
//     top: 20,
//     backgroundColor: '#FF6B35',
//     borderRadius: 20,
//     paddingHorizontal: 12,
//     paddingVertical: 10,
//     minWidth: 80,
//     minHeight: 80,
//     justifyContent: 'center',
//     alignItems: 'center',
//     shadowColor: '#FF6B35',
//     shadowOffset: {width: 0, height: 4},
//     shadowOpacity: 0.4,
//     shadowRadius: 8,
//     elevation: 8,
//     zIndex: 10,
//     transform: [{rotate: '-10deg'}],
//   },
//   savingsAmount: {
//     color: '#FFFFFF',
//     fontSize: 12,
//     fontWeight: '900',
//     textAlign: 'center',
//     lineHeight: 14,
//   },
//   savingsDescription: {
//     color: '#FFFFFF',
//     fontSize: 9,
//     fontWeight: '700',
//     textAlign: 'center',
//     marginTop: 2,
//   },
// });

// export default Subscription;
