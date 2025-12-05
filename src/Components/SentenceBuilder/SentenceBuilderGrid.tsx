import React, {useState, useEffect, useCallback, useRef} from 'react';
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
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import FastImage from 'react-native-fast-image';
import {DraggableGrid} from 'react-native-draggable-grid';
import {useAppSettings} from '../../utils/persistance';
import {sentenceBuilderSqlite} from '../../utils/sentenceBuilderSqlite';
import AppConfig from '../../utils/config';
import TTSService from '../../utils/TTSService';
import {
  Node,
  FolderStackItem,
  EditModalState,
  DEFAULT_COLOR_MAP,
  GRID_CONFIGS,
  GridConfigKey,
} from '../../types/sentenceBuilder';
import {resolveImageSource} from '../../utils/imageSourceResolver';
import {views} from '../../utils/constants';
import NavigationBar from './NavigationBar';
import EditModal from './EditModal';
import {useDatabase} from '../../contexts/DatabaseContext';
import {Mixpanel} from 'mixpanel-react-native';

const {width, height} = Dimensions.get('window');

interface SentenceBuilderGridProps {
  isTablet?: boolean;
  onWordAdded?: (nodeId: string) => void;
  onWordRemoved?: (nodeId: string) => void;
  onSentencePlayed?: (sentenceTokens: string[], nodes: Node[]) => void;
}

const SentenceBuilderGrid: React.FC<SentenceBuilderGridProps> = ({
  isTablet,
  onWordAdded,
  onWordRemoved,
  onSentencePlayed,
}) => {
  const {addUtterance} = useDatabase();
  const {getItem} = useAppSettings();
  const navigation = useNavigation();
  const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', true);

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
  const [isDragging, setIsDragging] = useState(false);
  const [lastPressTime, setLastPressTime] = useState<number>(0);
  const [lastPressedNodeId, setLastPressedNodeId] = useState<string>('');

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
      }
    } catch (error) {
      console.error('Error initializing or loading data:', error);
      Alert.alert('Error', 'Failed to initialize sentence builder database');
    } finally {
      setIsLoading(false);
    }
  };

  const resetDatabase = async () => {
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
      console.error('Error resetting database:', error);
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
    } catch (error) {
      console.error('Error updating current nodes:', error);
    }
  };

  const getGridConfig = useCallback(() => {
    return GRID_CONFIGS[selectedGridSize];
  }, [selectedGridSize]);

  const getCardDimensions = useCallback(() => {
    const gridConfig = getGridConfig();
    // In landscape mode: width is the longer dimension (screen width), height is the shorter dimension (screen height)
    const availableWidth = width - 8; // Reduced padding for more width (4px on each side)

    // Responsive breakpoints for different device types - using height as the reference for mobile detection
    const isSmallMobile = height < 480; // Very small phones (height is shorter dimension in landscape)
    const isMobile = height < 768; // Regular phones
    const isTabletDevice = height >= 768 && height < 1024; // Tablets

    // Calculate UI elements height dynamically
    const navigationBarHeight = height * 0.055; // Navigation bar minHeight
    const breadcrumbHeight = isTabletDevice ? 40 : 32; // Breadcrumb height (8px padding + content)
    const gridSizeSelectorHeight = isEditing ? 48 : 0; // Grid size selector (only in edit mode)
    const gridPadding = 8; // Grid container padding
    const totalUIHeight =
      navigationBarHeight +
      breadcrumbHeight +
      gridSizeSelectorHeight +
      gridPadding +
      20; // Extra buffer to ensure 5th row fits

    const availableHeight = height - totalUIHeight;
    const cardMargin = 2; // Much bigger gap between cards for visibility
    const cardSpacing = cardMargin * 2; // Total spacing between cards
    const cardWidth =
      (availableWidth - (gridConfig.cols - 1) * cardSpacing) / gridConfig.cols;
    const cardHeight =
      (availableHeight - (gridConfig.rows - 1) * cardSpacing) / gridConfig.rows;

    if (isSmallMobile) {
      // Very small mobile devices - make cards 1.25x height and narrower
      const finalWidth = Math.min(cardWidth, 100); // Much narrower width
      const finalHeight = Math.min(cardHeight * 1.25, 400); // 1.25x height with max of 400px
      return {width: finalWidth, height: finalHeight};
    } else if (isMobile) {
      // Regular mobile devices - make cards 1.25x height and narrower
      const finalWidth = Math.min(cardWidth, 120); // Much narrower width
      const finalHeight = Math.min(cardHeight * 1.25, 450); // 1.25x height with max of 450px
      return {width: finalWidth, height: finalHeight};
    } else if (isTabletDevice) {
      // Tablets - use slightly rectangular cards but not too wide
      const finalWidth = Math.min(cardWidth, 220); // Increased from 200px to 220px
      const finalHeight = Math.min(cardHeight, 200); // Increased from 180px to 200px
      return {width: finalWidth, height: finalHeight};
    } else {
      // Desktop - use the original logic but with better proportions
      const finalWidth = Math.min(cardWidth, 240); // Increased from 220px to 240px
      const finalHeight = Math.min(cardHeight, 220); // Increased from 200px to 220px
      return {width: finalWidth, height: finalHeight};
    }
  }, [getGridConfig, isEditing]);

  const getColorForNode = useCallback((node: Node): string => {
    if (node.kind === 'folder') {
      return '#673AB7'; // Deep Purple
    }
    return DEFAULT_COLOR_MAP[node.type || 'other'];
  }, []);

  const needsScrolling = useCallback(() => {
    const gridConfig = getGridConfig();
    return gridConfig.rows > 6; // 7x7 and 8x8 need scrolling
  }, [getGridConfig]);

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
      ? Array.from({length: additionalEmptyCellsNeeded}, (_, index) => ({
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

  // Calculate if we need multiple grids
  const needsMultipleGrids = useCallback(() => {
    const totalItems = getFullGridData().length;
    const gridCapacity = getGridConfig().rows * getGridConfig().cols;
    return totalItems > gridCapacity;
  }, [getFullGridData, getGridConfig]);

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

  // Split drag and drop data into multiple grids
  const getDragDropDataChunks = useCallback(() => {
    const dragDropData = getDragDropData();
    const gridCapacity = getGridConfig().rows * getGridConfig().cols;
    const chunks = [];

    for (let i = 0; i < dragDropData.length; i += gridCapacity) {
      chunks.push(dragDropData.slice(i, i + gridCapacity));
    }

    return chunks;
  }, [getDragDropData, getGridConfig]);

  // Navigation handlers
  const handleHomePress = () => {
    // Navigate to Open.tsx (main home screen)
    navigation.navigate(views.OPEN as never);
  };

  const handleBackPress = () => {
    if (folderStack.length > 0) {
      // Track screen switching (back navigation)
      const previousFolder = folderStack[folderStack.length - 1];
      mixpanel.track('Convo Screen - Screen Switched', {
        screen: 'Convo',
        action: 'screen_switched',
        navigation_type: 'back',
        from_folder_id: previousFolder.nodeId,
        from_folder_title: previousFolder.title,
        folder_stack_depth: folderStack.length - 1,
      });
      setFolderStack(prev => prev.slice(0, -1));
    }
  };

  // Function to go back to root of sentence builder (not navigate away)
  const handleBackToRoot = () => {
    // Track screen switching (back to root)
    mixpanel.track('Convo Screen - Screen Switched', {
      screen: 'Convo',
      action: 'screen_switched',
      navigation_type: 'back_to_root',
      folder_stack_depth: 0,
    });
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
      console.error('Error logging word selection:', error);
      // Fail silently as requested
    }
  };

  // Card handlers
  const handleCardPress = async (node: Node) => {
    // Debounce logic to prevent double-tap issues (especially on first tap after launch)
    const currentTime = Date.now();
    const DEBOUNCE_DELAY = 300; // 300ms debounce delay

    if (
      lastPressedNodeId === node.id &&
      currentTime - lastPressTime < DEBOUNCE_DELAY
    ) {
      return;
    }

    setLastPressTime(currentTime);
    setLastPressedNodeId(node.id);

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
      (node.id.startsWith('empty-') || node.id.startsWith('empty-deleted-')) &&
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

    if (isEditing) return;

    if (node.kind === 'folder') {
      // Track screen switching (folder navigation)
      mixpanel.track('Convo Screen - Screen Switched', {
        screen: 'Convo',
        action: 'screen_switched',
        folder_id: node.id,
        folder_title: node.title,
        folder_stack_depth: folderStack.length + 1,
      });
      // Navigate to folder - this should navigate, not add to sentence
      setFolderStack(prev => [...prev, {nodeId: node.id, title: node.title}]);
    } else {
      // Track tile click
      mixpanel.track('Convo Screen - Tile Clicked', {
        screen: 'Convo',
        action: 'tile_clicked',
        node_id: node.id,
        node_title: node.title,
        node_kind: node.kind,
        node_type: node.type || 'other',
      });
      // Add word to sentence
      try {
        await sentenceBuilderSqlite.addWordToSentence(node.id);
        setSentenceTokenIds(prev => [...prev, node.id]);

        // Notify parent component about word addition
        onWordAdded?.(node.id);

        // Log word selection to database
        const wordToLog = node.ttsText || node.title;
        await logWordSelection(wordToLog);

        // Speak the word using TTS
        const textToSpeak = node.ttsText || node.title;
        TTSService.speak(textToSpeak, true); // Use immediate=true to prioritize this speech
      } catch (error) {
        console.error('Error adding word to sentence:', error);
        Alert.alert('Error', 'Failed to add word to sentence');
      }
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
      setIsAdminCodeError(false);
    } catch (error) {
      console.error('Error checking admin code:', error);
      Alert.alert('Error', 'Failed to verify admin access');
    }
  };

  const handleCancelEditPress = () => {
    setIsEditing(false);
  };

  // Admin code modal handlers
  const closeAdminCodeModal = () => {
    setShowAdminCodeModal(false);
    setAdminCodeInput('');
    setIsAdminCodeError(false);
  };

  const handleAdminCodeSubmit = async () => {
    try {
      const storedAdminCode = await getItem('adminCode');
      if (
        adminCodeInput === storedAdminCode ||
        adminCodeInput === AppConfig.masterAdminCode
      ) {
        // Track board settings (edit mode) entry
        mixpanel.track('Convo Screen - Board Settings Clicked', {
          screen: 'Convo',
          action: 'board_settings_entered',
        });
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
      console.error('Error verifying admin code:', error);
      setIsAdminCodeError(true);
    }
  };

  // Grid size change handler
  const handleGridSizeChange = async (newSize: GridConfigKey) => {
    try {
      // Track grid size change (board settings)
      mixpanel.track('Convo Screen - Board Settings Changed', {
        screen: 'Convo',
        action: 'board_settings_changed',
        setting_type: 'grid_size',
        old_size: selectedGridSize,
        new_size: newSize,
      });

      setSelectedGridSize(newSize);
      const config = GRID_CONFIGS[newSize];
      await sentenceBuilderSqlite.updateGridSize(config.rows, config.cols);

      // Force a complete refresh by incrementing the refresh key
      setGridRefreshKey(prev => prev + 1);

      // Also refresh current nodes to ensure data is up to date
      await updateCurrentNodes();
    } catch (error) {
      console.error('Error saving grid size:', error);
      Alert.alert('Error', 'Failed to save grid size setting');
    }
  };

  // Sentence bar handlers
  const handleRemoveToken = async (nodeId: string) => {
    try {
      // Track word deletion by clicking on image
      const node = nodes.find(n => n.id === nodeId);
      mixpanel.track('Convo Screen - Word Deleted', {
        screen: 'Convo',
        action: 'word_deleted',
        deletion_method: 'image_click',
        node_id: nodeId,
        node_title: node?.title || 'unknown',
      });

      await sentenceBuilderSqlite.removeWordFromSentence(nodeId);
      setSentenceTokenIds(prev => prev.filter(id => id !== nodeId));

      // Notify parent component about word removal
      onWordRemoved?.(nodeId);
    } catch (error) {
      console.error('Error removing token:', error);
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
      // Notify parent component about sentence being played before clearing
      if (sentenceTokenIds.length > 0) {
        onSentencePlayed?.(sentenceTokenIds, nodes);
      }

      await sentenceBuilderSqlite.clearSentence();
      setSentenceTokenIds([]);
    } catch (error) {
      console.error('Error clearing sentence:', error);
      Alert.alert('Error', 'Failed to clear sentence');
    }
  };

  // New handler functions for NavigationBar
  const handleMicrophonePress = () => {
    // TODO: Implement microphone functionality
  };

  const handleTrashPress = () => {
    // Track word deletion by clicking trash icon
    mixpanel.track('Convo Screen - Word Deleted', {
      screen: 'Convo',
      action: 'word_deleted',
      deletion_method: 'trash_icon',
      sentence_length: sentenceTokenIds.length,
    });
    handleResetSentence();
  };

  // Handle breadcrumb folder navigation
  const handleBreadcrumbFolderPress = (index: number) => {
    if (index === -1) {
      // Track screen switching (breadcrumb to root)
      mixpanel.track('Convo Screen - Screen Switched', {
        screen: 'Convo',
        action: 'screen_switched',
        navigation_type: 'breadcrumb_to_root',
        folder_stack_depth: 0,
      });
      // Go to root (Mainboard)
      setFolderStack([]);
    } else {
      // Track screen switching (breadcrumb navigation)
      const targetFolder = folderStack[index];
      mixpanel.track('Convo Screen - Screen Switched', {
        screen: 'Convo',
        action: 'screen_switched',
        navigation_type: 'breadcrumb',
        folder_id: targetFolder?.nodeId,
        folder_title: targetFolder?.title,
        folder_stack_depth: index + 1,
      });
      setFolderStack(prev => prev.slice(0, index + 1));
    }
  };

  // Edit modal handlers
  const handleEditModalClose = () => {
    setEditModal({isVisible: false});
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
            console.error('Error in copyFolder:', copyError);
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
      setEditModal({isVisible: false});
    } catch (error) {
      console.error('Error saving node:', error);
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
      console.error('Error deleting node:', error);
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
      const nodeUpdates: Array<{id: string; orderIndex: number}> = [];

      newSortedData.forEach((node, index) => {
        // Check if it's an empty cell from a deleted node FIRST (before checking for 'empty-')
        if (node.id.startsWith('empty-deleted-')) {
          // Extract the original node ID
          const originalNodeId = node.id.replace('empty-deleted-', '');
          nodeUpdates.push({id: originalNodeId, orderIndex: index});
        } else if (!node.id.startsWith('empty-')) {
          // Regular node (not an empty placeholder)
          nodeUpdates.push({id: node.id, orderIndex: index});
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
      console.error('Error reordering nodes:', error);
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
          {margin: 2},
          {width: cardDimensions.width, height: cardDimensions.height},
          {backgroundColor: 'transparent'}, // Ensure outer container is transparent
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
              shadowOffset: {width: 0, height: 6},
              elevation: 12,
              borderWidth: 3,
              borderColor: isEmptyCell || isDeletedCard ? '#BDBDBD' : color,
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
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Text style={{color: '#fff', fontSize: 12, fontWeight: 'bold'}}>
                ✏️
              </Text>
            </TouchableOpacity>
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
                    <Text style={{fontSize: cardDimensions.width * 0.2}}>
                      📁
                    </Text>
                  </View>
                )}
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
                  backgroundColor: 'rgba(255, 255, 255, 0.7)',
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 8,
                  paddingVertical: 2, // Reduced padding for smaller text overlay
                  paddingHorizontal: 2,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                <Text
                  style={{
                    fontSize: Math.max(8, cardDimensions.width * 0.06),
                    fontWeight: '600',
                    color: '#000',
                    textAlign: 'center',
                    textShadowColor: 'rgba(0, 0, 0, 0.8)',
                    textShadowOffset: {width: 1, height: 1},
                    textShadowRadius: 2,
                  }}
                  numberOfLines={2}>
                  {node.kind === 'folder' && (
                    <Text
                      style={{
                        fontSize: Math.max(10, cardDimensions.width * 0.08),
                      }}>
                      📁{' '}
                    </Text>
                  )}
                  {node.title}
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
        <Text style={{marginTop: 10, color: '#666'}}>
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
        onEditToken={handleEditToken}
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
          scrollEnabled={
            !isDragging &&
            ((isEditing &&
              (selectedGridSize === '5x6' ||
                selectedGridSize === '6x6' ||
                selectedGridSize === '7x7' ||
                selectedGridSize === '8x8')) ||
              (!isEditing &&
                (selectedGridSize === '7x7' || selectedGridSize === '8x8')) ||
              // Enable scrolling for all grid sizes when there are words in the input
              sentenceTokenIds.length > 0)
          }>
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
                <Text style={styles.modalTitle}>Enter Admin Code</Text>
                <TextInput
                  style={[
                    styles.codeInput,
                    isAdminCodeError && styles.errorInput,
                  ]}
                  value={adminCodeInput}
                  onChangeText={text => {
                    const numericText = text.replace(/[^0-9]/g, '');
                    if (numericText.length <= 4) {
                      setAdminCodeInput(numericText);
                      setIsAdminCodeError(false);
                    }
                  }}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry={true}
                  autoFocus={true}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (adminCodeInput.length === 4) {
                      handleAdminCodeSubmit();
                    }
                  }}
                  onBlur={() => {
                    // Auto-cancel when user dismisses keyboard by tapping away
                    setTimeout(() => {
                      if (showAdminCodeModal && adminCodeInput.length !== 4) {
                        closeAdminCodeModal();
                      }
                    }, 100);
                  }}
                  blurOnSubmit={true}
                />

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
                    onPress={handleAdminCodeSubmit}
                    disabled={adminCodeInput.length !== 4}>
                    <Text style={styles.buttonText}>Submit</Text>
                  </TouchableOpacity>
                </View>
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
    paddingTop: height * 0.2,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: width * 0.05,
    width: width * 0.8,
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: height * 0.03,
    fontWeight: 'bold',
    marginBottom: height * 0.02,
    textAlign: 'center',
  },
  forgotCodeText: {
    fontSize: height * 0.018,
    color: '#666',
    textAlign: 'center',
    marginBottom: height * 0.02,
    lineHeight: height * 0.025,
    paddingHorizontal: 16,
    fontStyle: 'italic',
  },
  forgotCodeLabel: {
    fontWeight: 'bold',
    color: '#007bff',
  },
  emailLink: {
    color: '#007bff',
    textDecorationLine: 'underline',
  },
  codeInput: {
    width: '100%',
    height: height * 0.08,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: height * 0.025,
    textAlign: 'center',
    marginBottom: height * 0.02,
  },
  errorInput: {
    borderColor: '#ff3b30',
    backgroundColor: '#fff0f0',
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
});

export default SentenceBuilderGrid;
