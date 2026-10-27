import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export interface OptionPickerModalProps {
  visible: boolean;
  title: string;
  options: string[];
  /** Currently chosen option; its row is highlighted. */
  selected?: string;
  onSelect: (option: string) => void;
  onClose: () => void;
  /** Row text size. Defaults to large print for older adults. */
  fontSize?: number;
}

/**
 * Scrollable list picker presented as a modal.
 *
 * Use this instead of an Alert.alert built from an option array: Android
 * alerts render at most three buttons and silently drop the rest, so any
 * list longer than that must be a real view. Rows use large text.
 */
const OptionPickerModal: React.FC<OptionPickerModalProps> = ({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  fontSize = 20,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={onClose}>
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        testID="option-picker-backdrop">
        {/* Inner Pressable swallows taps so touching the card does not close it */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={[styles.title, { fontSize: fontSize + 2 }]}>{title}</Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {options.map(option => {
              const isSelected = option === selected;
              return (
                <TouchableOpacity
                  key={option}
                  testID={`option-picker-item-${option}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={[styles.row, isSelected && styles.rowSelected]}
                  onPress={() => onSelect(option)}>
                  <Text
                    style={[
                      styles.rowText,
                      { fontSize },
                      isSelected && styles.rowTextSelected,
                    ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              testID="option-picker-cancel">
              <Text style={[styles.cancelText, { fontSize }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '90%',
    maxWidth: 440,
    maxHeight: '85%',
    paddingTop: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
  },
  row: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowSelected: {
    backgroundColor: '#f0f8ff',
  },
  rowText: {
    color: '#333',
  },
  rowTextSelected: {
    color: '#8E24AA',
    fontWeight: '600',
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelText: {
    color: '#333',
    fontWeight: '600',
  },
});

export default OptionPickerModal;
