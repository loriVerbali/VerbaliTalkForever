import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Modal,
  TextInput,
  Linking,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

import FastImage from 'react-native-fast-image';
import { DraggableGrid } from 'react-native-draggable-grid';
import { useAppSettings } from '../../utils/persistance';
import { sentenceBuilderSqlite } from '../../utils/sentenceBuilderSqlite';
import AppConfig from '../../utils/config';
import TTSService from '../../utils/TTSService';
import AudioSessionManager from '../../utils/AudioSessionManager';
import {
  Node,
  FolderStackItem,
  EditModalState,
  DEFAULT_COLOR_MAP,
  GRID_CONFIGS,
  GridConfigKey,
} from '../../types/sentenceBuilder';
import { resolveImageSource, isPlaceholderImage } from '../../utils/imageSourceResolver';
import { views } from '../../utils/constants';
import NavigationBar from './NavigationBar';
import EditModal from './EditModal';
import { useDatabase } from '../../contexts/DatabaseContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

const { width, height } = Dimensions.get('window');

type RootStackParamList = {
  HOME: { stateof?: string };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;


interface SentenceBuilderGridProps {
  isTablet?: boolean;
  onWordAdded?: (nodeId: string) => void;
  onWordRemoved?: (nodeId: string, index: number) => void;
  onSentencePlayed?: (sentenceTokens: string[], nodes: Node[]) => void;
  onBreadcrumbTapped?: (index: number) => void;
  onGridSizeChanged?: (size: GridConfigKey) => void;
  onGridSizeLoaded?: (size: GridConfigKey) => void;
  onResetDbPressed?: () => void;
}

const SentenceBuilderGrid: React.FC<SentenceBuilderGridProps> = ({
  isTablet,
  onWordAdded,
  onWordRemoved,
  onSentencePlayed,
  onBreadcrumbTapped,
  onGridSizeChanged,
  onGridSizeLoaded,
  onResetDbPressed,
}) => {
  const { addUtterance } = useDatabase();
  const { getItem, setItem } = useAppSettings();
  const navigation = useNavigation<NavigationProp>();

  // State
  const [nodes, setNodes] = useState<Node[]>([]);
  const [currentNodes, setCurrentNodes] = useState<Node[]>([]);
  const [folderStack, setFolderStack] = useState<FolderStackItem[]>([]);
  const [sentenceTokenIds, setSentenceTokenIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGridSize, setSelectedGridSize] =
    useState<GridConfigKey>('6x6');
  const [gridRefreshKey, setGridRefreshKey] = useState(0);
  const [allFolders, setAllFolders] = useState<Node[]>([]);
  const [editModal, setEditModal] = useState<EditModalState>({
    isVisible: false,
  });
  const [showAdminCodeModal, setShowAdminCodeModal] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [isAdminCodeError, setIsAdminCodeError] = useState(false);
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [showAdminCode, setShowAdminCode] = useState(false);
  const pinInputRef = useRef<TextInput | null>(null);
  // Set New Password flow state
  const [isSettingNewPassword, setIsSettingNewPassword] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [newPinDigits, setNewPinDigits] = useState(['', '', '', '']);
  const [newPinError, setNewPinError] = useState('');
  const newPinInputRef = useRef<TextInput | null>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotPinInput, setForgotPinInput] = useState('');
  const [forgotPinDigits, setForgotPinDigits] = useState(['', '', '', '', '']);
  const [forgotPinError, setForgotPinError] = useState('');
  const forgotPinInputRef = useRef<TextInput | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPlaceholderModal, setShowPlaceholderModal] = useState(false);
  const [placeholderWord, setPlaceholderWord] = useState('');
  const isProcessingPressRef = useRef<boolean>(false);
  const isDebouncing = useRef(false);

  // Load initial data
  useEffect(() => {
    initializeAndLoadData();

    // Initialize TTS service
    TTSService.initialize();

    return () => {
      TTSService.stop();
      // Close database connection
      sentenceBuilderSqlite.close();
    };
  }, []);

  // Update current nodes when folder stack changes
  useEffect(() => {
    updateCurrentNodes();
  }, [nodes, folderStack]);

  // Reset sentence whenever the screen is focused
  useFocusEffect(
    useCallback(() => {
      handleResetSentence();
    }, []),
  );

  // Force re-render when grid size changes
  useEffect(() => {
    // This effect will trigger when selectedGridSize changes, ensuring all grid calculations are updated
    updateCurrentNodes();
  }, [selectedGridSize]);

  const initializeAndLoadData = async () => {
    try {
      setIsLoading(true);
      // Initialize the database
      await sentenceBuilderSqlite.init();
      const [allNodes, sentenceState, gridSettings, allFoldersData] =
        await Promise.all([
          sentenceBuilderSqlite.getNodes(),
          sentenceBuilderSqlite.getSentenceState(),
          sentenceBuilderSqlite.getGridSettings(),
          sentenceBuilderSqlite.getAllFolders(),
        ]);

      setNodes(allNodes);
      setSentenceTokenIds(sentenceState.tokenIds);
      setAllFolders(allFoldersData);

      // Reset sentence on initial load
      await handleResetSentence();

      // Load grid size from settings
      const gridConfigKey = Object.keys(GRID_CONFIGS).find(key => {
        const config = GRID_CONFIGS[key as GridConfigKey];
        return (
          config.rows === gridSettings.gridRows &&
          config.cols === gridSettings.gridCols
        );
      }) as GridConfigKey;

      if (gridConfigKey) {
        setSelectedGridSize(gridConfigKey);
        onGridSizeLoaded?.(gridConfigKey);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to initialize sentence builder database');
    } finally {
      setIsLoading(false);
    }
  };

  const resetDatabase = async () => {
    onResetDbPressed?.();
    try {
      setIsLoading(true);

      // Clear and re-seed the database
      await sentenceBuilderSqlite.clearAndReseed();

      // Reload the data
      await initializeAndLoadData();

      Alert.alert(
        'Success',
        'Database has been reset with new comprehensive word set!',
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to reset database');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCurrentNodes = async () => {
    try {
      // Check if database is initialized
      if (!sentenceBuilderSqlite.isInitialized()) {
        return;
      }

      const currentParentId =
        folderStack.length > 0
          ? folderStack[folderStack.length - 1].nodeId
          : null;
      // Get all nodes including deleted ones to preserve grid positions
      const allParentNodes = await sentenceBuilderSqlite.getAllNodesByParent(
        currentParentId,
      );

      setCurrentNodes(allParentNodes);
    } catch (error) { }
  };


  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const getGridConfig = useCallback(() => {
    return GRID_CONFIGS[selectedGridSize];
  }, [selectedGridSize]);

  const getCardDimensions = useCallback(() => {
    const gridConfig = getGridConfig();
    // In landscape mode: width is the longer dimension (screen width), height is the shorter dimension (screen height)
    const availableWidth = width - 8; // Reduced padding for more width (4px on each side)

    // Responsive breakpoints for different device types
    // Use prop if available, otherwise fallback to height check. Inclusive of 1024 for iPad Pro 12.9"
    const isTabletDevice = isTablet !== undefined ? isTablet : (height >= 768);
    const isSmallMobile = height < 480;

    // Calculate UI elements height dynamically
    // Calculate UI elements height dynamically
    // Navigation bar height is approx 11-12% on mobile (9.5% token + padding)
    const navBarRatio = isTabletDevice ? 0.10 : 0.12;
    const navigationBarHeight = height * navBarRatio;
    const gridSizeSelectorHeight = isEditing ? 48 : 0; // Grid size selector (only in edit mode)

    // Adaptive padding and buffer
    const gridPadding = isTabletDevice ? 8 : 2;
    // Increased safety buffer to account for potential accumulation of small pixel differences or other UI elements
    // Mobile: reduced from 10 back to 2 to reclaim space per user feedback ("insets are to much")
    const safetyBuffer = isTabletDevice ? 40 : 2;

    // Calculate insets to subtract
    // On tablet: subtract both top and bottom safe areas
    // On mobile: only subtract bottom safe area (home indicator) to maximize vertical space
    // We ignore top inset on mobile assuming landscape/immersive mode where we want to use that space
    const insetsToSubtract = isTabletDevice ? (insets.top + insets.bottom) : insets.bottom;

    const totalUIHeight =
      navigationBarHeight +
      gridSizeSelectorHeight +
      gridPadding +
      safetyBuffer +
      insetsToSubtract; // ACCOUNT FOR SAFE AREA INSETS (Optimized)

    const availableHeight = height - totalUIHeight;
    const cardMargin = 2; // Much bigger gap between cards for visibility
    const cardSpacing = cardMargin * 2; // Total spacing between cards
    const cardWidth =
      (availableWidth - (gridConfig.cols - 1) * cardSpacing) / gridConfig.cols;

    // Calculate card height based on available height, ensuring we don't exceed it
    const rawCardHeight =
      (availableHeight - (gridConfig.rows - 1) * cardSpacing) / gridConfig.rows;

    const cardHeight = Math.floor(rawCardHeight);

    if (!isTabletDevice) {
      // Mobile devices (both small and regular)
      return { width: Math.floor(cardWidth), height: cardHeight };
    } else {
      // Tablets
      const finalWidth = Math.min(cardWidth, 220);
      // Ensure we don't accidentally make cards taller than calculated available space per row
      const finalHeight = Math.min(cardHeight, 200);
      return { width: finalWidth, height: finalHeight };
    }

  }, [getGridConfig, isEditing]);

  const getColorForNode = useCallback((node: Node): string => {
    if (node.kind === 'folder') {
      return '#673AB7'; // Deep Purple
    }
    return DEFAULT_COLOR_MAP[node.type || 'other'];
  }, []);

  // Generate full grid with empty cells
  const getFullGridData = useCallback(() => {
    const gridConfig = getGridConfig();
    const totalCells = gridConfig.rows * gridConfig.cols;

    // Separate active and deleted nodes
    const activeNodes = currentNodes.filter(node => !node.deleted);
    const deletedNodes = currentNodes.filter(node => node.deleted);

    // Process active nodes (disable dragging when not in editing mode)
    const processedActiveNodes = activeNodes.map(node => ({
      ...node,
      disabledDrag: !isEditing || node.disabledDrag,
      disabledReSorted: !isEditing || node.disabledReSorted,
    }));

    // Convert deleted nodes to empty cells (always show them, but only tappable in edit mode)
    const emptyCellsFromDeleted: Node[] = deletedNodes.map((node, index) => {
      return {
        id: `empty-deleted-${node.id}`,
        parentId: node.parentId,
        kind: 'word' as const,
        title: '',
        type: 'other' as const,
        orderIndex: node.orderIndex, // Keep the same position
        isSeed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        key: `empty-deleted-${node.id}`,
        disabledDrag: !isEditing, // Allow dragging in edit mode so cards can swap with empty spaces
        disabledReSorted: false, // Allow rearranging so cards can be moved into empty spaces
      };
    });

    // Calculate additional empty cells needed
    const filledCells =
      processedActiveNodes.length + emptyCellsFromDeleted.length;
    const additionalEmptyCellsNeeded = Math.max(0, totalCells - filledCells);

    // Only show additional empty cells when in editing mode
    const additionalEmptyCells: Node[] = isEditing
      ? Array.from({ length: additionalEmptyCellsNeeded }, (_, index) => ({
        id: `empty-${index}`,
        parentId: null,
        kind: 'word' as const,
        title: '',
        type: 'other' as const,
        orderIndex: filledCells + index,
        isSeed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        key: `empty-${index}`,
        disabledDrag: false, // Allow dragging in edit mode so cards can swap with empty spaces
        disabledReSorted: false, // Allow rearranging so cards can be moved into empty spaces
      }))
      : [];

    // Combine all nodes and sort by orderIndex
    const allNodes = [
      ...processedActiveNodes,
      ...emptyCellsFromDeleted,
      ...additionalEmptyCells,
    ];
    const sortedNodes = allNodes.sort((a, b) => a.orderIndex - b.orderIndex);

    return sortedNodes;
  }, [currentNodes, getGridConfig, isEditing]);

  // Generate clean data for drag and drop (only real nodes)
  const getDragDropData = useCallback(() => {
    // Only return real nodes for drag and drop operations
    const activeNodes = currentNodes.filter(node => !node.deleted);

    // Process active nodes (disable dragging when not in editing mode)
    const processedActiveNodes = activeNodes.map(node => ({
      ...node,
      disabledDrag: !isEditing || node.disabledDrag,
      disabledReSorted: !isEditing || node.disabledReSorted,
    }));

    // Sort by orderIndex to maintain proper order
    return processedActiveNodes.sort((a, b) => a.orderIndex - b.orderIndex);
  }, [currentNodes, isEditing]);

  // Split data into multiple grids
  const getGridDataChunks = useCallback(() => {
    const allData = getFullGridData();
    const gridCapacity = getGridConfig().rows * getGridConfig().cols;
    const chunks = [];

    for (let i = 0; i < allData.length; i += gridCapacity) {
      chunks.push(allData.slice(i, i + gridCapacity));
    }

    return chunks;
  }, [getFullGridData, getGridConfig]);

  // Navigation handlers
  const handleHomePress = () => {
    // Navigate to Open.tsx (main home screen)
    navigation.navigate(views.OPEN as never);
  };

  const handleBackPress = () => {
    if (folderStack.length > 0) {
      setFolderStack(prev => prev.slice(0, -1));
    }
  };

  // Function to go back to root of sentence builder (not navigate away)
  const handleBackToRoot = () => {
    setFolderStack([]);
  };

  // Function to log word selection to database
  const logWordSelection = async (word: string) => {
    try {
      await addUtterance({
        word: word.trim(),
        dateof: new Date(),
        source: 'Convo',
      });
    } catch (error) {
      // Fail silently as requested
    }
  };

  // Card handlers
  const handleCardPress = async (node: Node) => {
    if (isDebouncing.current) return;
    isDebouncing.current = true;
    setTimeout(() => {
      isDebouncing.current = false;
    }, 1000);

    // Prevent concurrent processing - if already processing a press, ignore this one
    if (isProcessingPressRef.current) {
      return;
    }

    // Mark as processing immediately
    isProcessingPressRef.current = true;

    try {
      // Handle empty cells from deleted nodes (add new item) - only when in editing mode
      if (node.id.startsWith('empty-deleted-') && isEditing) {
        handleAddCardPress(node.orderIndex);
        return;
      }

      // Handle regular empty cells (add new item) - only when in editing mode
      if (node.id.startsWith('empty-') && isEditing) {
        handleAddCardPress();
        return;
      }

      // If not in editing mode and it's an empty cell, do nothing
      if (
        (node.id.startsWith('empty-') ||
          node.id.startsWith('empty-deleted-')) &&
        !isEditing
      ) {
        return;
      }

      // Handle deleted cards (legacy - should not happen with new logic)
      if (node.id.startsWith('deleted-')) {
        if (isEditing) {
          // In editing mode, open edit modal for the original card
          const originalNodeId = node.id.replace('deleted-', '');
          // Look in currentNodes (which includes deleted nodes) instead of nodes (which excludes them)
          const originalNode = currentNodes.find(n => n.id === originalNodeId);
          if (originalNode) {
            handleEditCardPress(originalNode);
          }
        }
        return;
      }

      if (isEditing) {
        return;
      }

      if (node.kind === 'folder') {
        // Navigate to folder - this should navigate, not add to sentence
        setFolderStack(prev => [...prev, { nodeId: node.id, title: node.title }]);
      } else {
        // Check for placeholder image
        if (isPlaceholderImage(node.imageUri)) {
          setPlaceholderWord(node.title);
          setShowPlaceholderModal(true);
          isProcessingPressRef.current = false;
          return;
        }

        // Speak the word using TTS (always speak, even if it's a consecutive duplicate)
        const textToSpeak = node.ttsText || node.title;
        const onPlaybackComplete = async () => {
          AudioSessionManager.setTTSActive(false);
        };
        await AudioSessionManager.prepareForTTS();
        await TTSService.speak(textToSpeak, true, onPlaybackComplete);

        // Logic for adding to sentence: block consecutive duplicates
        const isConsecutiveDuplicate =
          sentenceTokenIds.length > 0 &&
          sentenceTokenIds[sentenceTokenIds.length - 1] === node.id;

        if (!isConsecutiveDuplicate) {
          // Add word to sentence database
          await sentenceBuilderSqlite.addWordToSentence(node.id);

          // Update local state
          setSentenceTokenIds(prev => [...prev, node.id]);

          // Notify parent component about word addition
          onWordAdded?.(node.id);

          // Log word selection to database (analytics/history)
          await logWordSelection(textToSpeak);
        }
      }
    } catch (error) {
      if (node.kind !== 'folder') {
        Alert.alert('Error', 'Failed to add word to sentence');
      }
    } finally {
      // Always reset processing flag, even if there was an error or early return
      isProcessingPressRef.current = false;
    }
  };

  const handleEditCardPress = (node: Node) => {
    setEditModal({
      isVisible: true,
      nodeId: node.id,
      parentId: node.parentId,
      position: node.orderIndex,
    });
  };

  const handleAddCardPress = (position?: number) => {
    // Only allow adding new items when in editing mode
    if (!isEditing) {
      return;
    }

    const currentParentId =
      folderStack.length > 0
        ? folderStack[folderStack.length - 1].nodeId
        : null;

    // Use provided position or find the next available position
    const nextPosition =
      position !== undefined ? position : currentNodes.length;

    setEditModal({
      isVisible: true,
      parentId: currentParentId,
      position: nextPosition,
    });
  };

  // Edit mode handlers
  const handleEditPress = async () => {
    try {
      const adminCode = await getItem('adminCode');
      if (!adminCode || adminCode.trim() === '') {
        Alert.alert(
          'Admin Code Required',
          'Please set an admin code in settings first',
        );
        return;
      }

      // Show admin code prompt modal
      setShowAdminCodeModal(true);
      setAdminCodeInput('');
      setPinDigits(['', '', '', '']);
      setIsAdminCodeError(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to verify admin access');
    }
  };

  const handleCancelEditPress = async () => {
    setIsEditing(false);
    // Fully reload data to reset the view (prevents UI glitches after editing)
    await initializeAndLoadData();
  };

  // Admin code modal handlers
  const closeAdminCodeModal = () => {
    setShowAdminCodeModal(false);
    setAdminCodeInput('');
    setPinDigits(['', '', '', '']);
    setShowAdminCode(false);
    setIsAdminCodeError(false);
    // Reset new password flow state
    setIsSettingNewPassword(false);
    setNewPinInput('');
    setNewPinDigits(['', '', '', '']);
    setNewPinError('');
    // Reset forgot password state
    setIsForgotPassword(false);
    setForgotPinInput('');
    setForgotPinDigits(['', '', '', '', '']);
    setForgotPinError('');
  };

  const handleAdminCodeSubmit = async (overrideCode?: string) => {
    try {
      const codeToSubmit = overrideCode || adminCodeInput;
      const storedAdminCode = await getItem('adminCode');

      if (codeToSubmit === storedAdminCode) {
        closeAdminCodeModal();
        setIsEditing(true);
      } else {
        setIsAdminCodeError(true);
        setTimeout(() => {
          setIsAdminCodeError(false);
          setAdminCodeInput('');
        }, 1000);
      }
    } catch (error) {
      setIsAdminCodeError(true);
    }
  };

  const handleForgotCodeSubmit = async (overrideCode?: string) => {
    const codeToSubmit = overrideCode || forgotPinInput;

    if (codeToSubmit === AppConfig.masterAdminCode) {
      setIsForgotPassword(false);
      setForgotPinInput('');
      setForgotPinDigits(['', '', '', '', '']);
      setForgotPinError('');

      setIsSettingNewPassword(true);
      setNewPinInput('');
      setNewPinDigits(['', '', '', '']);
      setNewPinError('');
      setTimeout(() => newPinInputRef.current?.focus(), 200);
    } else {
      setForgotPinError('Incorrect master code.');
      // Clear error after 2 seconds
      setTimeout(() => setForgotPinError(''), 2000);
    }
  };

  const handleNewPinSave = async () => {
    if (newPinInput.length !== 4) {
      setNewPinError('Please enter a 4-digit code.');
      return;
    }
    await setItem('adminCode', newPinInput);
    closeAdminCodeModal();
  };

  // Grid size change handler
  const handleGridSizeChange = async (newSize: GridConfigKey) => {
    onGridSizeChanged?.(newSize);
    try {
      setSelectedGridSize(newSize);
      const config = GRID_CONFIGS[newSize];
      await sentenceBuilderSqlite.updateGridSize(config.rows, config.cols);

      // Force a complete refresh by incrementing the refresh key
      setGridRefreshKey(prev => prev + 1);

      // Also refresh current nodes to ensure data is up to date
      await updateCurrentNodes();
    } catch (error) {
      Alert.alert('Error', 'Failed to save grid size setting');
    }
  };

  // Sentence bar handlers
  const handleRemoveToken = async (nodeId: string, index: number) => {
    try {
      await sentenceBuilderSqlite.removeWordFromSentence(index);
      setSentenceTokenIds(prev => {
        const newState = [...prev];
        newState.splice(index, 1);
        return newState;
      });

      // Notify parent component about word removal
      onWordRemoved?.(nodeId, index);
    } catch (error) {
      Alert.alert('Error', 'Failed to remove word from sentence');
    }
  };

  const handleEditToken = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      handleEditCardPress(node);
    }
  };

  const handleResetSentence = async () => {
    try {
      // Prevent errors if DB is not yet initialized
      if (!sentenceBuilderSqlite.isInitialized()) {
        setSentenceTokenIds([]);
        return;
      }

      // Notify parent component about sentence being played before clearing
      if (sentenceTokenIds.length > 0) {
        onSentencePlayed?.(sentenceTokenIds, nodes);
      }

      await sentenceBuilderSqlite.clearSentence();
      setSentenceTokenIds([]);
    } catch (error) {
      Alert.alert('Error', 'Failed to clear sentence');
    }
  };

  // New handler functions for NavigationBar
  const handleMicrophonePress = () => {

    navigation.navigate("HOME", {
      stateof: 'Attention',
    });

  };

  const handleTrashPress = () => {
    handleResetSentence();
  };

  // Handle breadcrumb folder navigation
  const handleBreadcrumbFolderPress = (index: number) => {
    onBreadcrumbTapped?.(index);
    if (index === -1) {
      // Go to root (Mainboard)
      setFolderStack([]);
    } else {
      setFolderStack(prev => prev.slice(0, index + 1));
    }
  };

  // Edit modal handlers
  const handleEditModalClose = () => {
    setEditModal({ isVisible: false });
  };

  const handleEditModalSave = async (nodeData: Partial<Node>) => {
    try {
      if (editModal.nodeId) {
        // Update existing node (normal edit mode)
        await sentenceBuilderSqlite.updateNode(editModal.nodeId, nodeData);
      } else {
        // Check if this is copying an existing folder
        if (nodeData.kind === 'folder' && (nodeData as any).sourceFolderId) {
          try {
            // Copy existing folder
            const copiedFolder = await sentenceBuilderSqlite.copyFolder(
              (nodeData as any).sourceFolderId,
              editModal.parentId || null,
              editModal.position || 0,
            );

            // If we copied to a specific position, check if there's a deleted node at that position
            // and remove it to avoid having both the new folder and an empty cell
            if (editModal.position !== undefined) {
              const deletedNodeAtPosition = currentNodes.find(
                node => node.deleted && node.orderIndex === editModal.position,
              );

              if (deletedNodeAtPosition) {
                await sentenceBuilderSqlite.permanentlyDeleteNode(
                  deletedNodeAtPosition.id,
                );
              }
            }
          } catch (copyError) {
            throw copyError; // Re-throw to be caught by outer try-catch
          }
        } else {
          // Add new node - use the kind from nodeData (folder or word)
          await sentenceBuilderSqlite.addNode({
            ...nodeData,
            kind: nodeData.kind || 'word', // Use provided kind, default to word if not specified
          } as any);
        }
      }

      // Reload data
      await initializeAndLoadData();
      setEditModal({ isVisible: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert('Error', `Failed to save changes: ${errorMessage}`);
    }
  };

  const handleEditModalDelete = async (nodeId: string) => {
    try {
      await sentenceBuilderSqlite.deleteNode(nodeId);
      await initializeAndLoadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to delete item');
    }
  };

  // Drag and drop handlers
  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Handle drag and drop reordering
  const handleDragRelease = async (newSortedData: Node[]) => {
    // Only allow reordering in editing mode
    if (!isEditing) {
      return;
    }

    try {
      const currentParentId =
        folderStack.length > 0
          ? folderStack[folderStack.length - 1].nodeId
          : null;

      // Track the actual position in the grid for each node (including empty cells)
      const nodeUpdates: Array<{ id: string; orderIndex: number }> = [];

      newSortedData.forEach((node, index) => {
        // Check if it's an empty cell from a deleted node FIRST (before checking for 'empty-')
        if (node.id.startsWith('empty-deleted-')) {
          // Extract the original node ID
          const originalNodeId = node.id.replace('empty-deleted-', '');
          nodeUpdates.push({ id: originalNodeId, orderIndex: index });
        } else if (!node.id.startsWith('empty-')) {
          // Regular node (not an empty placeholder)
          nodeUpdates.push({ id: node.id, orderIndex: index });
        }
      });

      // Update in database - use the new method that accepts {id, orderIndex} pairs
      const nodeIds = nodeUpdates.map(update => update.id);
      const orderIndexes = nodeUpdates.map(update => update.orderIndex);

      await sentenceBuilderSqlite.reorderNodesWithPositions(
        currentParentId,
        nodeIds,
        orderIndexes,
      );

      // Force a complete refresh by incrementing the refresh key
      setGridRefreshKey(prev => prev + 1);

      // Reload data to ensure consistency with database
      await updateCurrentNodes();
    } catch (error) {
      Alert.alert('Error', 'Failed to reorder items');
      // Reload data on error to ensure consistency
      await initializeAndLoadData();
    } finally {
      // Always end dragging state
      handleDragEnd();
    }
  };

  const renderCard = (node: Node, order: number) => {
    const cardDimensions = getCardDimensions();
    const isEmptyCell = node.id.startsWith('empty-');
    const isDeletedCard = node.id.startsWith('deleted-');
    const color =
      isEmptyCell || isDeletedCard ? '#E0E0E0' : getColorForNode(node);

    // Check if this is a mobile device - use height for landscape mode detection
    const isMobile = height < 768;

    // Create a card matching ImageCard.tsx design
    return (
      <View
        style={[
          { margin: 2 },
          { width: cardDimensions.width, height: cardDimensions.height },
          { backgroundColor: 'transparent' }, // Ensure outer container is transparent
        ]}>
        <View
          style={[
            {
              width: cardDimensions.width,
              height: cardDimensions.height,
              backgroundColor: 'transparent', // Always transparent background
              borderRadius: 8,
              flexDirection: 'column',
              overflow: 'hidden',
              // shadowColor: isEmptyCell || isDeletedCard ? 'red' : color,
              // shadowOpacity: 0.9,
              //shadowRadius: 10,
              shadowOffset: { width: 0, height: 6 },
              elevation: 12,
              borderWidth: node.kind === 'folder' ? 4 : 3,
              borderColor: isEmptyCell || isDeletedCard ? '#BDBDBD' : (node.kind === 'folder' ? '#222222' : color),
              borderStyle: isEmptyCell || isDeletedCard ? 'dashed' : 'solid',
            },
          ]}>
          {/* Edit button - only visible in editing mode and not for empty or deleted cells */}
          {isEditing && !isEmptyCell && !isDeletedCard && (
            <TouchableOpacity
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                backgroundColor: 'rgba(0,0,0,0.6)',
                borderRadius: 10,
                width: 20,
                height: 20,
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 10,
              }}
              onPress={e => {
                e.stopPropagation();
                handleEditCardPress(node);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
                ✏️
              </Text>
            </TouchableOpacity>
          )}

          {/* Top semi-transparent strip for folders */}
          {node.kind === 'folder' && !isEmptyCell && !isDeletedCard && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: cardDimensions.width * 0.6,
                height: cardDimensions.height * 0.12,
                backgroundColor: 'rgba(140, 137, 129, 0.8)',
                borderTopLeftRadius: 0,
                borderTopRightRadius: cardDimensions.height * 0.02,
                borderBottomRightRadius: cardDimensions.height * 0.2,
                borderBottomLeftRadius: 0,

                borderBottomWidth: 5,
                borderTopWidth: 2,
                borderLeftWidth: 0,
                borderRightWidth: 5,
                borderColor: '#4d4d4a',
                zIndex: 12,
              }}
            />
          )}

          {/* Full-width transparent strip for folders */}
          {node.kind === 'folder' && !isEmptyCell && !isDeletedCard && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: cardDimensions.height * 0.12,
                backgroundColor: 'rgba(255, 248, 231, 0.8)',
                zIndex: 11,
              }}
            />
          )}



          {/* Image section - full height on mobile, partial on desktop */}
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative', // For text overlay on mobile
            }}>
            {isEmptyCell || isDeletedCard ? (
              // Empty cell with plus sign or deleted card
              <View
                style={{
                  width: cardDimensions.width,
                  height: isMobile
                    ? cardDimensions.height
                    : cardDimensions.height * 0.82,
                  backgroundColor: '#f0f0f0',
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: isMobile ? 8 : 0,
                  borderBottomRightRadius: isMobile ? 8 : 0,
                }}>
                <Text
                  style={{
                    fontSize: cardDimensions.width * 0.2,
                    color: '#757575',
                  }}>
                  +
                </Text>
              </View>
            ) : node.kind === 'word' ? (
              <>
                {node.imageUri ? (
                  <FastImage
                    source={
                      resolveImageSource(node.imageUri) ||
                      require('../../assets/welcome.png')
                    }
                    style={{
                      width: cardDimensions.width,
                      height: isMobile
                        ? cardDimensions.height
                        : cardDimensions.height * 0.82,
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                      borderBottomLeftRadius: isMobile ? 8 : 0,
                      borderBottomRightRadius: isMobile ? 8 : 0,
                    }}
                    resizeMode={FastImage.resizeMode.cover}
                  />
                ) : (
                  <View
                    style={{
                      width: cardDimensions.width,
                      height: isMobile
                        ? cardDimensions.height
                        : cardDimensions.height * 0.82,
                      backgroundColor: color,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                      borderBottomLeftRadius: isMobile ? 8 : 0,
                      borderBottomRightRadius: isMobile ? 8 : 0,
                    }}>
                    <Text
                      style={{
                        fontSize: cardDimensions.width * 0.15,
                        color: '#fff',
                      }}>
                      {node.title.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              // Folder - show image if available, otherwise folder icon
              <>
                {node.imageUri ? (
                  <FastImage
                    source={
                      resolveImageSource(node.imageUri) ||
                      require('../../assets/welcome.png')
                    }
                    style={{
                      width: cardDimensions.width,
                      height: isMobile
                        ? cardDimensions.height
                        : cardDimensions.height * 0.82,
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                      borderBottomLeftRadius: isMobile ? 8 : 0,
                      borderBottomRightRadius: isMobile ? 8 : 0,
                    }}
                    resizeMode={FastImage.resizeMode.cover}
                  />
                ) : null}
              </>
            )}

            {/* Text overlay for all devices */}
            {!isEmptyCell && !isDeletedCard && (
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: node.kind === 'folder' ? '#FFF8E7' : 'rgba(255, 255, 255, 0.7)',
                  borderBottomLeftRadius: 4,
                  borderBottomRightRadius: 4,
                  paddingVertical: node.kind === 'folder' ? 4 : 2,
                  paddingHorizontal: 2,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderTopWidth: node.kind === 'folder' ? 2 : 0,
                  borderColor: node.kind === 'folder' ? '#222222' : color,
                }}>
                <Text
                  style={{
                    fontSize: node.kind === 'folder' ? Math.max(10, cardDimensions.width * 0.07) : Math.max(8, cardDimensions.width * 0.06),
                    fontWeight: node.kind === 'folder' ? '800' : '600',
                    color: '#000',
                    textAlign: 'center',
                    textShadowColor: node.kind === 'folder' ? undefined : 'rgba(0, 0, 0, 0.8)',
                    textShadowOffset: node.kind === 'folder' ? undefined : { width: 1, height: 1 },
                    textShadowRadius: node.kind === 'folder' ? undefined : 2,
                  }}
                  numberOfLines={2}>
                  {node.kind === 'folder' ? node.title.toUpperCase() : node.title}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={{ marginTop: 10, color: '#666' }}>
          Loading Sentence Builder...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Navigation Bar */}
      <NavigationBar
        isEditing={isEditing}
        onEditPress={handleEditPress}
        onCancelEditPress={handleCancelEditPress}
        onMicrophonePress={handleMicrophonePress}
        onTrashPress={handleTrashPress}
        onPlayPress={handleResetSentence}
        nodes={nodes}
        sentenceTokenIds={sentenceTokenIds}
        onRemoveToken={handleRemoveToken}
        folderStack={folderStack}
        onFolderPress={handleBreadcrumbFolderPress}
        onBackPress={handleBackPress}
      />

      {/* Grid */}
      <View key={gridRefreshKey} style={styles.gridContainer}>
        {/* Grid Size Selection Buttons and Reset DB - Only visible in edit mode */}
        {isEditing && (
          <View style={styles.gridSizeContainer}>
            <Text style={styles.gridSizeLabel}>Grid Size:</Text>
            <View style={styles.gridSizeButtons}>
              {Object.keys(GRID_CONFIGS).map(size => (
                <TouchableOpacity
                  key={size}
                  style={[
                    styles.gridSizeButton,
                    selectedGridSize === size && styles.gridSizeButtonActive,
                  ]}
                  onPress={() => handleGridSizeChange(size as GridConfigKey)}>
                  <Text
                    style={[
                      styles.gridSizeButtonText,
                      selectedGridSize === size &&
                      styles.gridSizeButtonTextActive,
                    ]}>
                    {size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={resetDatabase}>
              <Text style={styles.resetButtonText}>Reset DB</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView
          style={styles.gridScrollContainer}
          contentContainerStyle={styles.gridScrollContent}
          showsVerticalScrollIndicator={true}
          bounces={true} // Enable bouncing for better mobile experience
          scrollEventThrottle={16} // Smooth scrolling
          nestedScrollEnabled={true} // Enable nested scrolling for mobile
          scrollEnabled={isEditing}>
          {getGridDataChunks().map((chunk, chunkIndex) => {
            // Always use full grid data to show empty cells in both editing and non-editing modes
            const dataToUse = chunk;

            return (
              <View
                key={`${chunkIndex}-${gridRefreshKey}`}
                style={styles.gridChunk}>
                <DraggableGrid
                  key={`draggable-${chunkIndex}-${gridRefreshKey}`}
                  numColumns={getGridConfig().cols}
                  data={dataToUse}
                  renderItem={renderCard}
                  style={styles.draggableGrid}
                  itemHeight={getCardDimensions().height + 4} // card height + margin (2px on each side)
                  onDragRelease={isEditing ? handleDragRelease : undefined}
                  onItemPress={handleCardPress}
                  onDragStart={isEditing ? handleDragStart : undefined}
                  onDragging={undefined}
                  delayLongPress={isEditing ? 300 : 0}
                />
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Edit Modal */}
      <EditModal
        isVisible={editModal.isVisible}
        node={
          editModal.nodeId
            ? nodes.find(n => n.id === editModal.nodeId)
            : undefined
        }
        parentId={editModal.parentId || null}
        position={editModal.position || 0}
        onClose={handleEditModalClose}
        onSave={handleEditModalSave}
        onDelete={handleEditModalDelete}
        currentFolders={currentNodes.filter(n => n.kind === 'folder')}
        allFolders={allFolders}
      />

      {/* Admin Code Modal */}
      <Modal
        visible={showAdminCodeModal}
        transparent={true}
        animationType="fade"
        supportedOrientations={['landscape-left', 'landscape-right']}
        onRequestClose={closeAdminCodeModal}>
        <TouchableWithoutFeedback onPress={closeAdminCodeModal}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
              <View style={styles.modalContent}>
                {/* Lock Icon */}
                <Text style={styles.lockIcon}>🔒</Text>

                {!isSettingNewPassword && !isForgotPassword ? (
                  <>
                    <Text style={styles.modalTitle}>Enter Admin Code</Text>
                    <Text style={styles.modalDescription}>
                      Enter your 4-digit parent code to continue.
                    </Text>

                    {/* PIN Input Row */}
                    <Pressable
                      style={styles.pinRow}
                      onPress={() => {
                        if (pinInputRef.current) {
                          pinInputRef.current.blur();
                          setTimeout(() => {
                            pinInputRef.current?.focus();
                          }, 100);
                        }
                      }}>
                      <TextInput
                        ref={pinInputRef}
                        value={adminCodeInput}
                        onChangeText={text => {
                          const numericText = text.replace(/[^0-9]/g, '');
                          if (numericText.length <= 4) {
                            setAdminCodeInput(numericText);
                            const newDigits = ['', '', '', ''];
                            for (let i = 0; i < numericText.length; i++) {
                              newDigits[i] = numericText[i];
                            }
                            setPinDigits(newDigits);
                            setIsAdminCodeError(false);

                            // Auto-submit when all 4 digits entered
                            if (numericText.length === 4) {
                              setTimeout(() => {
                                handleAdminCodeSubmit(numericText);
                              }, 100);
                            }
                          }
                        }}
                        keyboardType="number-pad"
                        maxLength={4}
                        style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
                        autoFocus={true}
                        caretHidden={true}
                      />
                      {pinDigits.map((digit, index) => {
                        const pinBoxSize = Math.min(width * 0.12, 80);
                        return (
                          <View
                            key={index}
                            style={[
                              styles.pinBox,
                              {
                                width: pinBoxSize,
                                height: pinBoxSize,
                                borderRadius: pinBoxSize * 0.18,
                                marginHorizontal: 6,
                              },
                              digit !== '' && styles.pinBoxFilled,
                              isAdminCodeError && styles.pinBoxError,
                            ]}>
                            <Text
                              style={[
                                styles.pinInput,
                                {
                                  fontSize: showAdminCode ? 24 : 36,
                                  lineHeight: pinBoxSize,
                                },
                              ]}>
                              {showAdminCode ? digit : (digit ? '●' : '')}
                            </Text>
                          </View>
                        );
                      })}
                    </Pressable>

                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.cancelButton]}
                        onPress={closeAdminCodeModal}>
                        <Text style={styles.buttonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.modalButton,
                          styles.submitButton,
                          adminCodeInput.length !== 4 && styles.disabledButton,
                        ]}
                        onPress={() => handleAdminCodeSubmit()}
                        disabled={adminCodeInput.length !== 4}>
                        <Text style={styles.buttonText}>Submit</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Forgot Password */}
                    <TouchableOpacity
                      onPress={() => {
                        setIsForgotPassword(true);
                        setAdminCodeInput('');
                        setPinDigits(['', '', '', '']);
                        setIsAdminCodeError(false);
                        setTimeout(() => forgotPinInputRef.current?.focus(), 200);
                      }}>
                      <Text style={styles.forgotCodeText}>
                        <Text style={styles.forgotCodeLabel}>Forgot password?</Text>
                      </Text>
                      <Text style={[styles.forgotCodeText, { marginTop: 4 }]}>
                        Open a browser and go to <Text style={{ fontWeight: 'bold' }}>verbali.io/forgotadminpassword</Text>
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : isForgotPassword ? (
                  <>
                    <Text style={styles.modalTitle}>Master Override</Text>
                    <Text style={styles.modalDescription}>
                      Enter your 5-digit master override code to reset your admin PIN.
                    </Text>
                    <Text style={[styles.modalDescription, { fontSize: 13, color: '#888', fontStyle: 'italic', marginBottom: 15 }]}>
                      you need to go to https://www.verbali.io/forgotadminpassword to get the code
                    </Text>

                    {/* 5-Digit PIN Input Row */}
                    <Pressable
                      style={styles.pinRow}
                      onPress={() => {
                        if (forgotPinInputRef.current) {
                          forgotPinInputRef.current.blur();
                          setTimeout(() => {
                            forgotPinInputRef.current?.focus();
                          }, 100);
                        }
                      }}>
                      <TextInput
                        ref={forgotPinInputRef}
                        value={forgotPinInput}
                        onChangeText={text => {
                          const numericText = text.replace(/[^0-9]/g, '');
                          if (numericText.length <= 5) {
                            setForgotPinInput(numericText);
                            const newDigits = ['', '', '', '', ''];
                            for (let i = 0; i < numericText.length; i++) {
                              newDigits[i] = numericText[i];
                            }
                            setForgotPinDigits(newDigits);
                            setForgotPinError('');

                            // Auto-submit when all 5 digits entered
                            if (numericText.length === 5) {
                              setTimeout(() => {
                                handleForgotCodeSubmit(numericText);
                              }, 100);
                            }
                          }
                        }}
                        keyboardType="number-pad"
                        maxLength={5}
                        style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
                        autoFocus={true}
                        caretHidden={true}
                      />
                      {forgotPinDigits.map((digit, index) => {
                        const pinBoxSize = Math.min(width * 0.1, 70);
                        return (
                          <View
                            key={index}
                            style={[
                              styles.pinBox,
                              {
                                width: pinBoxSize,
                                height: pinBoxSize,
                                borderRadius: pinBoxSize * 0.18,
                                marginHorizontal: 6,
                              },
                              digit !== '' && styles.pinBoxFilled,
                              forgotPinError !== '' && styles.pinBoxError,
                            ]}>
                            <Text
                              style={[
                                styles.pinInput,
                                {
                                  fontSize: 36,
                                  lineHeight: pinBoxSize,
                                },
                              ]}>
                              {digit ? '●' : ''}
                            </Text>
                          </View>
                        );
                      })}
                    </Pressable>

                    {/* Error message */}
                    {forgotPinError !== '' && (
                      <Text style={{ color: '#E54848', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
                        {forgotPinError}
                      </Text>
                    )}

                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.cancelButton]}
                        onPress={() => {
                          setIsForgotPassword(false);
                          setForgotPinInput('');
                          setForgotPinDigits(['', '', '', '', '']);
                          setForgotPinError('');
                          setTimeout(() => pinInputRef.current?.focus(), 200);
                        }}>
                        <Text style={styles.buttonText}>I remember my code</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.modalButton,
                          styles.submitButton,
                          forgotPinInput.length !== 5 && styles.disabledButton,
                        ]}
                        onPress={() => handleForgotCodeSubmit()}
                        disabled={forgotPinInput.length !== 5}>
                        <Text style={styles.buttonText}>Submit</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.modalTitle}>Set New Password</Text>
                    <Text style={styles.modalDescription}>
                      Enter a new 4-digit admin code.
                    </Text>

                    {/* New PIN Entry */}
                    <Pressable
                      style={styles.pinRow}
                      onPress={() => {
                        if (newPinInputRef.current) {
                          newPinInputRef.current.blur();
                          setTimeout(() => {
                            newPinInputRef.current?.focus();
                          }, 100);
                        }
                      }}>
                      <TextInput
                        ref={newPinInputRef}
                        value={newPinInput}
                        onChangeText={text => {
                          const numericText = text.replace(/[^0-9]/g, '');
                          if (numericText.length <= 4) {
                            setNewPinInput(numericText);
                            const digits = ['', '', '', ''];
                            for (let i = 0; i < numericText.length; i++) {
                              digits[i] = numericText[i];
                            }
                            setNewPinDigits(digits);
                            setNewPinError('');
                          }
                        }}
                        keyboardType="number-pad"
                        maxLength={4}
                        style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
                        autoFocus={true}
                        caretHidden={true}
                      />
                      {newPinDigits.map((digit, index) => {
                        const pinBoxSize = Math.min(width * 0.12, 80);
                        return (
                          <View
                            key={`new-${index}`}
                            style={[
                              styles.pinBox,
                              {
                                width: pinBoxSize,
                                height: pinBoxSize,
                                borderRadius: pinBoxSize * 0.18,
                                marginHorizontal: 6,
                              },
                              digit !== '' && styles.pinBoxFilled,
                            ]}>
                            <Text
                              style={[
                                styles.pinInput,
                                { fontSize: 36, lineHeight: pinBoxSize },
                              ]}>
                              {digit ? '●' : ''}
                            </Text>
                          </View>
                        );
                      })}
                    </Pressable>

                    {/* Error message */}
                    {newPinError !== '' && (
                      <Text style={{ color: '#E54848', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
                        {newPinError}
                      </Text>
                    )}

                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.cancelButton]}
                        onPress={closeAdminCodeModal}>
                        <Text style={styles.buttonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.modalButton,
                          styles.submitButton,
                          newPinInput.length !== 4 && styles.disabledButton,
                        ]}
                        onPress={handleNewPinSave}
                        disabled={newPinInput.length !== 4}>
                        <Text style={styles.buttonText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Placeholder Image Warning Modal */}
      <Modal
        visible={showPlaceholderModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPlaceholderModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowPlaceholderModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { borderColor: '#ff3b30', borderWidth: 2 }]}>
                <Text style={styles.warningIcon}>⚠️</Text>
                <Text style={[styles.modalTitle, { color: '#ff3b30' }]}>Missing Image</Text>
                <Text style={styles.placeholderWarningText}>
                  No image is attached to "{placeholderWord}", please go to settings and add an image to this word.
                </Text>

                <TouchableOpacity
                  style={styles.settingsLinkButton}
                  onPress={() => {
                    setShowPlaceholderModal(false);
                    navigation.navigate(views.SETTINGS as never);
                  }}>
                  <Text style={styles.settingsLinkText}>Go to Settings</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton, { marginTop: 15, width: '100%' }]}
                  onPress={() => setShowPlaceholderModal(false)}>
                  <Text style={styles.buttonText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    flex: 1,
    padding: 4, // Reduced from 8 to 4 for even more space on mobile
  },
  gridSizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  gridSizeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 12,
  },
  gridSizeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  gridSizeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#e9ecef',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  gridSizeButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  gridSizeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
  },
  gridSizeButtonTextActive: {
    color: '#fff',
  },
  resetButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 16,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  draggableGrid: {
    flex: 1,
  },
  scrollableGrid: {
    flex: 1,
  },
  scrollableGridContent: {
    flexGrow: 1,
  },
  gridScrollContainer: {
    flex: 1,
  },
  gridScrollContent: {
    paddingBottom: 40, // Increased padding for double-height cards
    flexGrow: 1, // Ensure content can grow
  },
  gridChunk: {
    marginBottom: 40, // Increased margin for double-height cards
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  // Admin Code Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: height * 0.15,
  },
  modalContent: {
    backgroundColor: '#f5f0e8',
    borderRadius: 20,
    padding: width * 0.05,
    width: width * 0.8,
    maxWidth: 450,
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: height * 0.03,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
    color: '#333',
  },
  modalDescription: {
    fontSize: height * 0.018,
    color: '#666',
    textAlign: 'center',
    marginBottom: height * 0.02,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: height * 0.025,
    width: '100%',
  },
  pinBox: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  pinBoxFilled: {
    borderColor: '#007bff',
  },
  pinBoxError: {
    borderColor: '#ff3b30',
    backgroundColor: '#fff0f0',
  },
  pinInput: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    color: '#333',
    fontWeight: 'bold',
  },
  eyeButton: {
    padding: 8,
    marginLeft: 4,
  },
  eyeIcon: {
    fontSize: 22,
  },
  forgotCodeText: {
    fontSize: height * 0.016,
    color: '#888',
    textAlign: 'center',
    marginTop: height * 0.015,
    lineHeight: height * 0.022,
    paddingHorizontal: 16,
    fontStyle: 'italic',
  },
  forgotCodeLabel: {
    fontWeight: 'bold',
    color: '#007bff',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: height * 0.02,
    borderRadius: 10,
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#ff3b30',
  },
  submitButton: {
    backgroundColor: '#34c759',
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: height * 0.02,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.5,
  },
  warningIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  placeholderWarningText: {
    fontSize: 18,
    color: '#ff3b30',
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
    lineHeight: 24,
  },
  settingsLinkButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#007bff',
    width: '100%',
    alignItems: 'center',
  },
  settingsLinkText: {
    color: '#007bff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default SentenceBuilderGrid;
