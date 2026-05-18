import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import { useAppSettings } from '../utils/persistance';
import {
  parseMy8Words,
  stringifyMy8Words,
  updateCard,
  My8WordsData,
  My8WordsCard,
} from '../utils/my8wordsUtils';
import { searchWordImages, WordImageResult } from '../utils/wordImageApi';
import { downloadImageForCard, getImageSource } from '../utils/imageDownloader';
import { resolveImageSource, isPlaceholderImage } from '../utils/imageSourceResolver';

const { width, height } = Dimensions.get('window');

interface AddressDetails {
  address: string;
  address2: string;
  city: string;
  state: string;
  zipcode: string;
  country: 'USA' | 'Canada' | 'Other';
}

interface PepeItem {
  id: string;
  imageUri: string;
  name: string;
  aliases: string[];
  type?: string;
  relationship?: string;
  isFavorite?: boolean;
  addressDetails?: AddressDetails;
  isCurrentLocation?: boolean;
}

interface PepesData {
  People: PepeItem[];
  Toys: PepeItem[];
  Pets: PepeItem[];
  TVShows: PepeItem[];
  Food: PepeItem[];
  Drinks: PepeItem[];
  Places: PepeItem[];
}

interface My8WordsCustomizerProps {
  isTablet?: boolean;
}

const My8WordsCustomizer: React.FC<My8WordsCustomizerProps> = ({ isTablet }) => {
  const { getItem, setItem } = useAppSettings();
  const [my8WordsData, setMy8WordsData] = useState<My8WordsData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WordImageResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(
    null,
  );
  const [isDownloading, setIsDownloading] = useState(false);

  const [activeTab, setActiveTab] = useState<'web' | 'pepes'>('web');
  const [pepesData, setPepesData] = useState<PepesData | null>(null);
  const [selectedPepeCategory, setSelectedPepeCategory] = useState<string>('All');

  // Load current my8words data
  useEffect(() => {
    const loadMy8Words = async () => {
      try {
        const my8wordsJson = await getItem('my8words');
        const parsedData = parseMy8Words(my8wordsJson);
        setMy8WordsData(parsedData);

        // If data was migrated, save it back to preferences
        const needsMigration =
          my8wordsJson &&
          JSON.parse(my8wordsJson).cards.some(
            (card: any) =>
              card.imageUrl && card.imageUrl.includes('example.com'),
          );

        if (needsMigration) {
          await setItem('my8words', stringifyMy8Words(parsedData));
        }
      } catch (error) {

      }
    };
    loadMy8Words();
  }, [getItem, setItem]);

  // Load Pepes data when a card is selected to keep it fresh
  useEffect(() => {
    if (selectedCardIndex !== null) {
      const loadPepes = async () => {
        try {
          const pepesJson = await getItem('pepes');
          if (pepesJson) {
            const parsedData = JSON.parse(pepesJson);
            setPepesData({
              People: parsedData.People || [],
              Toys: parsedData.Toys || [],
              Pets: parsedData.Pets || [],
              TVShows: parsedData.TVShows || [],
              Food: parsedData.Food || [],
              Drinks: parsedData.Drinks || [],
              Places: parsedData.Places || [],
            });
          } else {
            setPepesData({
              People: [],
              Toys: [],
              Pets: [],
              TVShows: [],
              Food: [],
              Drinks: [],
              Places: [],
            });
          }
        } catch (error) {

        }
      };
      loadPepes();
    }
  }, [selectedCardIndex, getItem]);

  // Update card directly using Pepe local image
  const handleUpdateCardWithPepe = async (
    cardIndex: number,
    pepe: PepeItem,
  ) => {
    if (!my8WordsData) return;

    if (isPlaceholderImage(pepe.imageUri)) {
      Alert.alert(
        'Missing an image here',
        "Please add an image in the Pepes section first.",
      );
      return;
    }

    try {
      const newCard: My8WordsCard = {
        word: pepe.name,
        imageUrl: pepe.imageUri,
        id: pepe.id,
      };

      // Update the data
      const updatedData = updateCard(my8WordsData, cardIndex, newCard);
      setMy8WordsData(updatedData);

      // Save to preferences
      await setItem('my8words', stringifyMy8Words(updatedData));

      // Clear selection & search query
      setSearchQuery('');
      setSearchResults([]);
      setSelectedCardIndex(null);

      Alert.alert(
        'Success',
        `Card ${cardIndex + 1} updated with "${pepe.name}"`,
      );
    } catch (error) {

      Alert.alert('Error', 'Failed to update card. Please try again.');
    }
  };

  const getFilteredPepes = (): PepeItem[] => {
    if (!pepesData) return [];
    if (selectedPepeCategory === 'All') {
      return [
        ...(pepesData.People || []),
        ...(pepesData.Toys || []),
        ...(pepesData.Pets || []),
        ...(pepesData.TVShows || []),
        ...(pepesData.Food || []),
        ...(pepesData.Drinks || []),
        ...(pepesData.Places || []),
      ];
    }
    const key = selectedPepeCategory as keyof PepesData;
    return pepesData[key] || [];
  };

  const PEPE_CATEGORIES = [
    { key: 'All', label: 'All' },
    { key: 'People', label: 'People' },
    { key: 'Toys', label: 'Toys' },
    { key: 'Pets', label: 'Pets' },
    { key: 'TVShows', label: 'TV Shows' },
    { key: 'Food', label: 'Food' },
    { key: 'Drinks', label: 'Drinks' },
    { key: 'Places', label: 'Places' },
  ];

  // Search for words with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim().length >= 3) {
        performSearch(searchQuery.trim());
      } else if (searchQuery.trim().length === 0) {
        setSearchResults([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const results = await searchWordImages(query);
      setSearchResults(results.results);
    } catch (error) {

      Alert.alert('Error', 'Failed to search for words. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Manual search (when search button is pressed)
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    await performSearch(searchQuery.trim());
  };

  // Update a card with new word/image
  const handleUpdateCard = async (
    cardIndex: number,
    wordImage: WordImageResult,
  ) => {
    if (!my8WordsData) return;

    setIsDownloading(true);
    try {
      // Download the image
      const newCard = await downloadImageForCard({
        word: wordImage.word,
        imageUrl: wordImage.imageUrl,
        id: wordImage.id,
      });

      // Update the data
      const updatedData = updateCard(my8WordsData, cardIndex, newCard);
      setMy8WordsData(updatedData);

      // Save to preferences
      await setItem('my8words', stringifyMy8Words(updatedData));

      // Clear search
      setSearchQuery('');
      setSearchResults([]);
      setSelectedCardIndex(null);

      Alert.alert(
        'Success',
        `Card ${cardIndex + 1} updated with "${wordImage.word}"`,
      );
    } catch (error) {

      Alert.alert('Error', 'Failed to update card. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Reset to default words
  const handleResetToDefault = async () => {
    Alert.alert(
      'Reset to Default',
      'Are you sure you want to reset all cards to default words?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              const defaultData = parseMy8Words(''); // This returns default data
              setMy8WordsData(defaultData);
              await setItem('my8words', stringifyMy8Words(defaultData));
              Alert.alert('Success', 'Cards reset to default words');
            } catch (error) {

              Alert.alert('Error', 'Failed to reset cards. Please try again.');
            }
          },
        },
      ],
    );
  };

  const renderCard = ({ item, index }: { item: My8WordsCard; index: number }) => (
    <TouchableOpacity
      style={[
        styles.card,
        selectedCardIndex === index && styles.selectedCard,
        isTablet && styles.cardTablet,
      ]}
      onPress={() =>
        setSelectedCardIndex(selectedCardIndex === index ? null : index)
      }>
      <FastImage
        source={getImageSource(item)}
        style={[styles.cardImage, isTablet && styles.cardImageTablet]}
        resizeMode={FastImage.resizeMode.cover}
      />
      <Text style={[styles.cardText, isTablet && styles.cardTextTablet]}>
        {item.word}
      </Text>
      <Text style={[styles.cardNumber, isTablet && styles.cardNumberTablet]}>
        {index + 1}
      </Text>
    </TouchableOpacity>
  );

  const renderSearchResult = ({ item }: { item: WordImageResult }) => (
    <TouchableOpacity
      style={[styles.searchResult, isTablet && styles.searchResultTablet]}
      onPress={() => {
        if (selectedCardIndex !== null) {
          handleUpdateCard(selectedCardIndex, item);
        }
      }}
      disabled={selectedCardIndex === null || isDownloading}>
      <FastImage
        source={{ uri: item.imageUrl }}
        style={[
          styles.searchResultImage,
          isTablet && styles.searchResultImageTablet,
        ]}
        resizeMode={FastImage.resizeMode.cover}
      />
      <Text
        style={[
          styles.searchResultText,
          isTablet && styles.searchResultTextTablet,
        ]}>
        {item.word}
      </Text>
    </TouchableOpacity>
  );

  if (!my8WordsData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8E24AA" />
        <Text style={styles.loadingText}>Loading cards...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, isTablet && styles.titleTablet]}>
          Customize Your 8 Words
        </Text>
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleResetToDefault}>
          <Text style={styles.resetButtonText}>Reset to Default</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.instruction, isTablet && styles.instructionTablet]}>
        Tap a card below to select it, then search for a word to replace it
        with.
      </Text>

      {/* Current Cards */}
      <View style={styles.cardsContainer}>
        <View style={styles.cardsList}>
          {/* First Row - Cards 1-4 */}
          <View style={[styles.cardRow, isTablet && styles.cardRowTablet]}>
            {my8WordsData.cards.slice(0, 4).map((item, index) => (
              <View
                key={`card-${index}`}
                style={[
                  styles.cardWrapper,
                  isTablet && styles.cardWrapperTablet,
                ]}>
                {renderCard({ item, index })}
              </View>
            ))}
          </View>
          {/* Second Row - Cards 5-8 */}
          <View style={[styles.cardRow, isTablet && styles.cardRowTablet]}>
            {my8WordsData.cards.slice(4, 8).map((item, index) => (
              <View
                key={`card-${index + 4}`}
                style={[
                  styles.cardWrapper,
                  isTablet && styles.cardWrapperTablet,
                ]}>
                {renderCard({ item, index: index + 4 })}
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Search Section */}
      {selectedCardIndex !== null && (
        <View style={styles.searchSection}>
          <Text
            style={[styles.searchTitle, isTablet && styles.searchTitleTablet]}>
            Replace Card {selectedCardIndex + 1} with:
          </Text>

          {/* Segmented Tab Bar */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'web' && styles.activeTab]}
              onPress={() => setActiveTab('web')}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'web' && styles.activeTabText,
                  isTablet && styles.tabTextTablet,
                ]}>
                Verbali Library
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'pepes' && styles.activeTab]}
              onPress={() => setActiveTab('pepes')}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'pepes' && styles.activeTabText,
                  isTablet && styles.tabTextTablet,
                ]}>
                Personal images (People and Stuff)
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'web' ? (
            <View>
              <View style={styles.searchInputContainer}>
                <TextInput
                  style={[styles.searchInput, isTablet && styles.searchInputTablet]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search for a word..."
                  placeholderTextColor="#999"
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                />
                <TouchableOpacity
                  style={[
                    styles.searchButton,
                    isTablet && styles.searchButtonTablet,
                    (isSearching || searchQuery.trim().length < 3) &&
                    styles.disabledButton,
                  ]}
                  onPress={handleSearch}
                  disabled={isSearching || searchQuery.trim().length < 3}>
                  {isSearching ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.searchButtonText}>Search</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Search Results */}
              {searchQuery.trim().length > 0 && searchQuery.trim().length < 3 && (
                <View style={styles.hintContainer}>
                  <Text style={styles.hintText}>
                    Type at least 3 characters to search
                  </Text>
                </View>
              )}

              {searchResults.length > 0 && (
                <View style={styles.resultsContainer}>
                  <Text
                    style={[
                      styles.resultsTitle,
                      isTablet && styles.resultsTitleTablet,
                    ]}>
                    Search Results:
                  </Text>
                  <ScrollView
                    style={[
                      styles.resultsListContainer,
                      isTablet && styles.resultsListContainerTablet,
                    ]}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}>
                    <View style={styles.resultsList}>
                      {searchResults.map((item) => (
                        <View
                          key={item.id}
                          style={[
                            styles.searchResultWrapper,
                            isTablet && styles.searchResultWrapperTablet,
                          ]}>
                          {renderSearchResult({ item })}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {isDownloading && (
                <View style={styles.downloadingContainer}>
                  <ActivityIndicator size="small" color="#8E24AA" />
                  <Text style={styles.downloadingText}>Downloading image...</Text>
                </View>
              )}
            </View>
          ) : (
            <View>
              {/* Category pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryPillsContainer}
                contentContainerStyle={styles.categoryPillsContent}>
                {PEPE_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      styles.categoryPill,
                      selectedPepeCategory === cat.key && styles.activeCategoryPill,
                    ]}
                    onPress={() => setSelectedPepeCategory(cat.key)}>
                    <Text
                      style={[
                        styles.categoryPillText,
                        selectedPepeCategory === cat.key &&
                        styles.activeCategoryPillText,
                      ]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Pepes Grid */}
              <ScrollView
                style={[
                  styles.resultsListContainer,
                  isTablet && styles.resultsListContainerTablet,
                ]}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}>
                {getFilteredPepes().length > 0 ? (
                  <View style={styles.resultsList}>
                    {getFilteredPepes().map((pepe) => (
                      <View
                        key={pepe.id}
                        style={[
                          styles.pepeItemWrapper,
                          isTablet && styles.pepeItemWrapperTablet,
                        ]}>
                        <TouchableOpacity
                          style={[
                            styles.pepeItem,
                            isTablet && styles.pepeItemTablet,
                          ]}
                          onPress={() => {
                            if (selectedCardIndex !== null) {
                              handleUpdateCardWithPepe(selectedCardIndex, pepe);
                            }
                          }}>
                          <FastImage
                            source={resolveImageSource(pepe.imageUri) || require('../assets/taptoAdd.png')}
                            style={[
                              styles.pepeItemImage,
                              isTablet && styles.pepeItemImageTablet,
                            ]}
                            resizeMode={FastImage.resizeMode.cover}
                          />
                          <Text
                            style={[
                              styles.pepeItemText,
                              isTablet && styles.pepeItemTextTablet,
                            ]}
                            numberOfLines={1}>
                            {pepe.name}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyPepesContainer}>
                    <Text style={styles.emptyPepesText}>
                      No custom tiles found in this category. You can add them in the "My People & Stuff" section above!
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  titleTablet: {
    fontSize: 22,
  },
  resetButton: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  instruction: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  instructionTablet: {
    fontSize: 16,
  },
  cardsContainer: {
    marginBottom: 20,
  },
  cardsList: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardWrapper: {
    width: (width - 80) / 4,
    margin: 4,
  },
  cardWrapperTablet: {
    width: (width - 120) / 4,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardRowTablet: {
    marginBottom: 12,
  },
  card: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardTablet: {
    padding: 8,
  },
  selectedCard: {
    borderColor: '#8E24AA',
    shadowOpacity: 0.2,
    elevation: 5,
  },
  cardImage: {
    width: '70%',
    height: '50%',
    borderRadius: 6,
    marginBottom: 4,
  },
  cardImageTablet: {
    width: '75%',
    height: '55%',
  },
  cardText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  cardTextTablet: {
    fontSize: 12,
  },
  cardNumber: {
    position: 'absolute',
    top: 4,
    right: 4,
    fontSize: 8,
    color: '#8E24AA',
    fontWeight: 'bold',
  },
  cardNumberTablet: {
    fontSize: 10,
  },
  searchSection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
  },
  searchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  searchTitleTablet: {
    fontSize: 18,
  },
  searchInputContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
  },
  searchInputTablet: {
    height: 44,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#8E24AA',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  searchButtonTablet: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  hintContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  resultsContainer: {
    marginTop: 8,
  },
  resultsListContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    maxHeight: height * 0.3,
    padding: 8,
  },
  resultsListContainerTablet: {
    maxHeight: height * 0.4,
    padding: 12,
  },
  resultsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  resultsTitleTablet: {
    fontSize: 16,
  },
  resultsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  searchResultWrapper: {
    width: ((width - 120) / 3) * 0.6,
    margin: 2,
  },
  searchResultWrapperTablet: {
    width: ((width - 160) / 3) * 0.6,
  },
  searchResult: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 5,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 0.5 },
    elevation: 1,
  },
  searchResultTablet: {
    padding: 5,
  },
  searchResultImage: {
    width: '60%',
    height: '45%',
    borderRadius: 2,
    marginBottom: 2,
  },
  searchResultImageTablet: {
    width: '65%',
    height: '50%',
  },
  searchResultText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  searchResultTextTablet: {
    fontSize: 10,
  },
  downloadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  downloadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#eee',
    borderRadius: 8,
    padding: 3,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  activeTab: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  tabTextTablet: {
    fontSize: 14,
  },
  activeTabText: {
    color: '#8E24AA',
  },
  // Category pills styles
  categoryPillsContainer: {
    marginBottom: 12,
  },
  categoryPillsContent: {
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#eee',
    marginRight: 8,
  },
  activeCategoryPill: {
    backgroundColor: '#8E24AA',
  },
  categoryPillText: {
    fontSize: 11,
    color: '#555',
    fontWeight: '600',
  },
  activeCategoryPillText: {
    color: '#fff',
  },
  // Pepe item styles
  pepeItemWrapper: {
    width: (width - 120) / 4,
    margin: 4,
  },
  pepeItemWrapperTablet: {
    width: (width - 160) / 6,
  },
  pepeItem: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 0.5 },
    elevation: 1,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  pepeItemTablet: {
    padding: 6,
  },
  pepeItemImage: {
    width: '65%',
    height: '50%',
    borderRadius: 4,
    marginBottom: 4,
  },
  pepeItemImageTablet: {
    width: '70%',
    height: '55%',
  },
  pepeItemText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    width: '100%',
  },
  pepeItemTextTablet: {
    fontSize: 11,
  },
  emptyPepesContainer: {
    paddingVertical: 30,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPepesText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
  },
});

export default My8WordsCustomizer;
