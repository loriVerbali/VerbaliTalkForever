import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import {FolderStackItem} from '../../types/sentenceBuilder';
import {useAdmin} from '../../contexts/adminContext';

const {height} = Dimensions.get('window');

interface BreadcrumbProps {
  folderStack: FolderStackItem[];
  onFolderPress: (index: number) => void;
  onBackPress?: () => void;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({
  folderStack,
  onFolderPress,
  onBackPress,
}) => {
  const {isTablet} = useAdmin();
  return (
    <View style={isTablet ? styles.containerTablet : styles.container}>
      <View
        style={[
          styles.breadcrumbRow,
          !isTablet && {paddingLeft: height * 0.1}, // Only apply left padding on mobile
        ]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.breadcrumbScroll}
          contentContainerStyle={styles.scrollContent}>
          {/* Always show Mainboard as the first breadcrumb */}
          <View style={styles.breadcrumbItem}>
            <TouchableOpacity
              style={styles.folderButton}
              onPress={() => onFolderPress(-1)}
              activeOpacity={0.7}>
              <Text
                style={isTablet ? styles.folderIconTablet : styles.folderIcon}>
                🏠
              </Text>
              <Text
                style={isTablet ? styles.folderNameTablet : styles.folderName}
                numberOfLines={1}>
                Mainboard
              </Text>
            </TouchableOpacity>
            {folderStack.length > 0 && (
              <Text
                style={isTablet ? styles.separatorTablet : styles.separator}>
                ›
              </Text>
            )}
          </View>

          {/* Show folder stack */}
          {folderStack.map((folder, index) => (
            <View key={folder.nodeId} style={styles.breadcrumbItem}>
              <TouchableOpacity
                style={styles.folderButton}
                onPress={() => onFolderPress(index)}
                activeOpacity={0.7}>
                <Text
                  style={
                    isTablet ? styles.folderIconTablet : styles.folderIcon
                  }>
                  📁
                </Text>
                <Text
                  style={isTablet ? styles.folderNameTablet : styles.folderName}
                  numberOfLines={1}>
                  {folder.title}
                </Text>
              </TouchableOpacity>
              {index < folderStack.length - 1 && (
                <Text
                  style={isTablet ? styles.separatorTablet : styles.separator}>
                  ›
                </Text>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Back button - positioned on the far right */}
        {folderStack.length > 0 && onBackPress && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBackPress}
            activeOpacity={0.7}>
            <Text
              style={
                isTablet ? styles.backButtonTextTablet : styles.backButtonText
              }>
              ←
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    paddingVertical: 4,
  },
  containerTablet: {
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    paddingVertical: 8,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  breadcrumbScroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  folderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: {width: 0, height: 1},
    elevation: 2,
    maxWidth: 150,
  },
  folderIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  folderIconTablet: {
    fontSize: 16,
    marginRight: 6,
  },
  folderName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  folderNameTablet: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  separator: {
    fontSize: 14,
    color: '#6c757d',
    marginHorizontal: 6,
    fontWeight: 'bold',
  },
  separatorTablet: {
    fontSize: 18,
    color: '#6c757d',
    marginHorizontal: 8,
    fontWeight: 'bold',
  },
  backButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: {width: 0, height: 1},
    elevation: 2,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    marginRight: height * 0.08,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  backButtonTextTablet: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
});

export default Breadcrumb;
