import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import mixpanel from '../utils/mixpanelInstance';
import { sessionManager } from '../utils/sessionManager';

const { width } = Dimensions.get('window');

interface DeviceStatusScreenProps {
  status: 'revoked' | 'inactive';
  onContactSupport?: () => void;
}

const DeviceStatusScreen: React.FC<DeviceStatusScreenProps> = ({
  status,
  onContactSupport,
}) => {


  useEffect(() => {
    const trackStatus = async () => {
      const deviceId = await sessionManager.getDeviceId();
      mixpanel.track('Device Status Blocked', {
        status: status,
        device_id: deviceId || 'unknown',
      });
    };
    trackStatus();
  }, [status]);

  const content = {
    revoked: {
      title: 'Access Revoked',
      description: 'Your device access has been revoked by your organization. Please contact your administrator for assistance.',
      icon: '🚫',
    },
    inactive: {
      title: 'Organization Inactive',
      description: 'The organization associated with this device is currently inactive. Please contact your administrator.',
      icon: '⚠️',
    },
  };

  const activeContent = content[status];

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>{activeContent.icon}</Text>
        <Text style={styles.title}>{activeContent.title}</Text>
        <Text style={styles.description}>{activeContent.description}</Text>

        <Text
          style={styles.button}
          onPress={onContactSupport}
        >
          <Text style={styles.buttonText}>Contact Support info@verbali.io</Text>
        </Text>

        <FastImage
          source={require('../assets/matalk.png')}
          style={styles.logo}
          resizeMode={FastImage.resizeMode.contain}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  icon: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 40,
  },
  button: {
    width: '100%',
    height: 60,
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 60,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  logo: {
    width: 120,
    height: 50,
    opacity: 0.5,
  },
});

export default DeviceStatusScreen;
