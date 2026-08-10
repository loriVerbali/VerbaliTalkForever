import {Platform} from 'react-native';
import _ from 'lodash';
import fetchHelper from './fetcher';
import {
  initConnection,
  getReceiptDataIOS,
  getAvailablePurchases,
} from 'react-native-iap';

// The backend JSON.parses receiptData and reads purchaseToken/productId from
// it. dataAndroid (Play's originalJson) already has that shape, but it can be
// null on some purchase events — a raw purchaseToken string would fail the
// backend parse, so build the JSON explicitly as fallback.
const buildAndroidReceipt = (purchase: any): string => {
  if (purchase?.dataAndroid) {
    return purchase.dataAndroid;
  }
  const purchaseToken =
    purchase?.purchaseToken ?? purchase?.purchaseTokenAndroid;
  if (!purchaseToken) {
    return '';
  }
  return JSON.stringify({
    purchaseToken,
    productId: purchase?.productId ?? purchase?.ids?.[0],
    packageName: purchase?.packageNameAndroid,
  });
};

const validateSubscription = async (receipt: string) => {
  if (__DEV__) {
    return true;
  }
  if (Platform.OS === 'android') {
    // For Android, validate using Google Play receipt validation
    try {
      const res = await fetchHelper(
        'validateGoogleReceipt',
        {},
        {
          receiptData: receipt,
        },
      );

      if (res?.active) {
        return true;
      } else {
        return false;
      }
    } catch (e) {
      
      return false;
    }
  }

  try {
    const res = await fetchHelper(
      'validateReceipt',
      {},
      {
        receiptData: receipt,
      },
    );

    if (res?.active) {
      return true;
    } else {
      return false;
    }
  } catch (e) {
    
    return false;
  }
};

const validateReceiptOnLaunch = async () => {
  if (__DEV__) {
    return true;
  }
  if (Platform.OS === 'android') {
    // For Android, get existing purchases and validate the latest one
    try {
      const connected = await initConnection();
      if (!connected) {
        
        return null;
      }

      const purchases = await getAvailablePurchases();
      if (!purchases || purchases.length === 0) {
        
        return false;
      }

      // Sort by transactionDate and get the latest purchase
      const sorted = purchases.sort(
        (a, b) =>
          parseInt(String(b.transactionDate)) -
          parseInt(String(a.transactionDate)),
      );

      const latestPurchase = sorted[0] as any;
      const latestReceipt = buildAndroidReceipt(latestPurchase);

      if (!latestReceipt) {
        
        return false;
      }

      const res = await fetchHelper(
        'validateGoogleReceipt',
        {},
        {
          receiptData: latestReceipt,
        },
      );

      if (res?.active) {
        return true;
      } else {
        return false;
      }
    } catch (e) {
      
      return false;
    }
  }

  try {
    const connected = await initConnection();
    if (!connected) {
      
      return null;
    }

    // Launch validation must not prompt StoreKit to refresh a receipt. A
    // forced refresh can outlive the app's foreground window and leave
    // SKReceiptRefreshRequest holding an iOS background task.
    // getReceiptDataIOS never forces a refresh (that is a separate
    // requestReceiptRefreshIOS call), so this stays refresh-free.
    const receipt = await getReceiptDataIOS();
    if (!receipt) {
      return null;
    }
    const res = await fetchHelper(
      'validateReceipt',
      {},
      {
        receiptData: receipt,
      },
    );
    if (res?.active) {
      return true;
    } else {
      return false;
    }
  } catch (e) {
    
    return false;
  }
};

export {validateSubscription, validateReceiptOnLaunch, buildAndroidReceipt};
