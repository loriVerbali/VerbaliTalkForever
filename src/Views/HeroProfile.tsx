import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {useAppSettings} from '../utils/persistance';
import {AboutTheUserContent} from './AboutTheUser';
import {LearnedCommunicationContent} from './LearnedCommunication';

const statusBarHeight = StatusBar.currentHeight || 40;

type ProfileTab = 'about' | 'communication';

/**
 * Single caregiver-facing entry point for Personal Memory: one profile screen
 * with two tabs over the two underlying stores (knowledge_items vs
 * memory_items). Presentation merge only — the data layers stay separate.
 */
const HeroProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const {getItem} = useAppSettings();
  const [heroName, setHeroName] = useState('Hero');
  const [tab, setTab] = useState<ProfileTab>('about');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const saved = (await getItem('heroName'))?.trim();
          setHeroName(saved && saved !== 'Name' ? saved : 'Hero');
        } catch (e) {}
      })();
    }, [getItem]),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{heroName}'s Profile</Text>
      </View>

      <Text style={styles.caption}>What we learned about {heroName}</Text>
      <Text style={styles.privacyNote}>
        The full picture stays on this device. Only small, selected parts are
        sent with AI requests — purely to improve answers and suggestions.
      </Text>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'about' && styles.tabActive]}
          onPress={() => setTab('about')}>
          <Text
            style={[styles.tabText, tab === 'about' && styles.tabTextActive]}>
            About {heroName}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'communication' && styles.tabActive]}
          onPress={() => setTab('communication')}>
          <Text
            style={[
              styles.tabText,
              tab === 'communication' && styles.tabTextActive,
            ]}>
            Communication
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {tab === 'about' ? (
          <AboutTheUserContent />
        ) : (
          <LearnedCommunicationContent />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fe',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: statusBarHeight - 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    padding: 10,
  },
  backButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  caption: {
    fontSize: 15,
    fontWeight: '600',
    color: '#444',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },
  privacyNote: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 6,
    paddingHorizontal: 24,
  },
  tabBar: {
    flexDirection: 'row',
    marginTop: 14,
    marginHorizontal: 16,
    backgroundColor: '#e8eaf2',
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#777',
  },
  tabTextActive: {
    color: '#333',
  },
  content: {
    flex: 1,
  },
});

export default HeroProfileScreen;
