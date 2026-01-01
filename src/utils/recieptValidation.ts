import {Platform} from 'react-native';
import _ from 'lodash';
import fetchHelper from './fetcher';
import {
  initConnection,
  getReceiptIOS,
  getAvailablePurchases,
} from 'react-native-iap';

const validateSubscription = async (receipt: string) => {
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

      const latestPurchase = sorted[0];
      const latestReceipt = latestPurchase.transactionReceipt;

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

    const receipt = await getReceiptIOS({forceRefresh: true});
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

export {validateSubscription, validateReceiptOnLaunch};
