import {Platform} from 'react-native';
import _ from 'lodash';
import fetchHelper from './fetcher';
import {initConnection, getReceiptIOS} from 'react-native-iap';

const validateSubscription = async (receipt: string) => {
  if (Platform.OS === 'android') {
    return true;
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
    console.error('Receipt validation failed', e);
    return false;
  }
};

const validateReceiptOnLaunch = async () => {
  if (Platform.OS === 'android') {
    return true;
  }

  try {
    const connected = await initConnection();
    if (!connected) {
      console.warn('IAP connection failed');
      return null;
    }

    const receipt = await getReceiptIOS({forceRefresh: true});
    if (!receipt) {
      console.warn('⚠️ No receipt found');
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
    console.error('Receipt validation failed', e);
    return false;
  }
};

export {validateSubscription, validateReceiptOnLaunch};
