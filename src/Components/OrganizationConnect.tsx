import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import fetchHelper from '../utils/fetcher';
import { sessionManager } from '../utils/sessionManager';
import { useAppSettings } from '../utils/persistance';

const { width } = Dimensions.get('window');

interface OrganizationConnectProps {
  onSuccess: (orgName: string) => void;
  isTablet: boolean;
}

const OrganizationConnect: React.FC<OrganizationConnectProps> = ({
  onSuccess,
  isTablet,
}) => {
  const { setItem } = useAppSettings();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [tempOrg, setTempOrg] = useState<{ id: string; name: string } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleValidateCode = async () => {
    if (code.length < 6) {
      setError('Code must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetchHelper('validateCode', {}, { code });

      // res is now already the parsed JSON object (or raw response if parsing failed)
      if (res.success && res.organization) {
        setTempOrg(res.organization);
        setShowConfirmModal(true);
      } else {
        // Use the error field from the parsed JSON if available
        setError(mapErrorMessage(res.error || 'invalid_code'));
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!tempOrg) return;

    setIsLoading(true);
    setError('');

    try {
      const deviceId = await sessionManager.ensureDeviceId();
      const response = await fetchHelper('enrollDevice', {}, {
        deviceIdentifier: deviceId,
        code: code,
        platform: Platform.OS,
        appVersion: '1.0.0', // Should ideally come from DeviceInfo
      });

      if (response.success) {
        await setItem('isEnrolled', '1');
        await setItem('orgName', response.organization?.name || tempOrg.name);
        await setItem('deviceId', deviceId);

        setShowConfirmModal(false);
        onSuccess(response.organization?.name || tempOrg.name);
      } else {
        setError(mapErrorMessage(response.error || 'enrollment_failed'));
        setShowConfirmModal(false);
      }
    } catch (err) {
      setError('Enrollment failed. Please try again.');
      setShowConfirmModal(false);
    } finally {
      setIsLoading(false);
    }
  };

  const mapErrorMessage = (error: string) => {
    const errorMap: Record<string, string> = {
      invalid_code: 'Invalid code',
      code_expired: 'Code expired',
      code_disabled: 'Code not active',
      code_limit_reached: 'Code usage limit reached',
      device_limit_reached: 'Organization device limit reached',
      organization_inactive: 'Organization inactive',
      device_revoked: 'Device access revoked',
    };
    return errorMap[error] || 'An unexpected error occurred';
  };

  const isCodeValid = code.length >= 6 && code.length <= 8;

  return (
    <View style={styles.container}>
      <FastImage
        source={require('../assets/matalk.png')}
        style={styles.logo}
        resizeMode={FastImage.resizeMode.contain}
      />

      <Text style={[styles.title, isTablet && styles.titleTablet]}>
        Connect your organization
      </Text>
      <Text style={[styles.subtitle, isTablet && styles.subtitleTablet]}>
        Enter your clinic or school code
      </Text>

      <View style={styles.inputWrapper}>
        <TextInput
          ref={inputRef}
          style={[styles.input, isTablet && styles.inputTablet]}
          placeholder="Enter code"
          placeholderTextColor="#A0A0A0"
          keyboardType="default"
          autoCapitalize="none"
          maxLength={8}
          value={code}
          onChangeText={(text) => {
            const alphanumericText = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            setCode(alphanumericText);
            setError('');
          }}
          editable={!isLoading}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          (!isCodeValid || isLoading) && styles.buttonDisabled,
          isTablet && styles.buttonTablet
        ]}
        onPress={handleValidateCode}
        disabled={!isCodeValid || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Connect</Text>
        )}
      </TouchableOpacity>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="fade"
        supportedOrientations={['landscape-left', 'landscape-right']}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isTablet && styles.modalContentTablet]}>
            <Text style={styles.modalTitle}>Organization Found</Text>
            <Text style={styles.modalText}>
              Do you want to connect to:
            </Text>
            <Text style={styles.orgNameHighlight}>
              {tempOrg?.name}
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowConfirmModal(false)}
                disabled={isLoading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleEnroll}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>Yes, Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  logo: {
    width: 120,
    height: 60,
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  titleTablet: {
    fontSize: 32,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
  },
  subtitleTablet: {
    fontSize: 20,
  },
  inputWrapper: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 32,
  },
  input: {
    width: '100%',
    height: 60,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 20,
    fontSize: 20,
    color: '#333',
    borderWidth: 2,
    borderColor: 'transparent',
    textAlign: 'center',
    fontWeight: '600',
  },
  inputTablet: {
    height: 80,
    fontSize: 28,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    maxWidth: 400,
    height: 60,
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonTablet: {
    height: 80,
  },
  buttonDisabled: {
    backgroundColor: '#C4B5FD',
    shadowOpacity: 0,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width * 0.85,
    maxWidth: 450,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
  },
  modalContentTablet: {
    width: width * 0.6,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  modalText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  orgNameHighlight: {
    fontSize: 24,
    fontWeight: '800',
    color: '#8B5CF6',
    marginBottom: 30,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 0.48,
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  confirmButton: {
    backgroundColor: '#8B5CF6',
  },
  cancelButtonText: {
    color: '#6B7280',
    fontWeight: '600',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export default OrganizationConnect;
