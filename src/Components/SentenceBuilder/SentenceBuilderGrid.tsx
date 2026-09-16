import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
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
  Switch,
  Image,
} from 'react-native';
import type {
  LayoutChangeEvent,
  PanResponderGestureState,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect} from '@react-navigation/native';

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
  WordType,
} from '../../types/sentenceBuilder';
import {
  resolveImageSource,
  isPlaceholderImage,
} from '../../utils/imageSourceResolver';
import {resolvePepesImage} from '../../utils/pepesUtils';
import {views} from '../../utils/constants';
import NavigationBar from './NavigationBar';
import EditModal from './EditModal';
import VerbiColumn from '../../features/verbi/components/VerbiColumn';
import type {
  VerbiClientState,
  VerbiSuggestion,
  VerbiFolder,
} from '../../features/verbi/state/verbiTypes';
import {
  VERBI_SUGGESTION_LIMITS,
  parseVerbiSuggestionLimit,
} from '../../features/verbi/state/verbiTypes';
import {useDatabase} from '../../contexts/DatabaseContext';
import {iepCapture} from '../../features/iep/capture/iepCapture';
import {
  personalMemoryService,
  makeMemoryEventId,
} from '../../services/PersonalMemoryService';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';

const {width, height} = Dimensions.get('window');

// Breathing room between the Verbi column and the right screen edge, so the column
// isn't clipped by the bezel / rounded corners. The device's right safe-area inset
// is added on top of this at runtime.
const VERBI_COLUMN_GUTTER = 12;

// Window in which a repeat tap on the *same* card is treated as an accidental
// double-tap. Taps on a different card are never swallowed, however fast they
// arrive — building a sentence quickly must not lose words.
const SAME_CARD_TAP_WINDOW_MS = 400;

// Long-press delay for cards outside edit mode, i.e. effectively "never".
//
// Cards only need a long press in edit mode (it starts a drag). Outside it the
// value must still be large, NOT 0: React Native clamps delayLongPress to a
// 10ms minimum, and once a long press fires, Pressability throws the press away
// (`isPressCanceledByLongPress`) because DraggableGrid always supplies an
// onLongPress. With 0 the grid silently dropped any tap held longer than 10ms —
// which taps are dropped depends on how busy the JS thread is, so words went
// missing at random. Kept well under setTimeout's 32-bit ceiling.
const LONG_PRESS_DISABLED_MS = 60 * 60 * 1000;

type RootStackParamList = {
  HOME: {stateof?: string};
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Ref type exposed to parent for imperative word injection (e.g. Verbi suggestions)
export type SentenceBuilderGridRef = {
  addWordByLabel: (label: string, spokenText?: string) => void;
  /** Opens the in-page settings panel (admin-code gated, same as the edit button). */
  openSettings: () => void;
};

interface SentenceBuilderGridProps {
  isTablet?: boolean;
  onNodesChanged?: (nodes: Node[]) => void;
  onWordAdded?: (nodeId: string) => void;
  onWordRemoved?: (nodeId: string, index: number) => void;
  /** The sentence bar emptied: 'play' after the Play button, 'clear' for Trash or a reset. */
  onSentencePlayed?: (sentenceTokens: string[], nodes: Node[], reason: 'play' | 'clear') => void;
  onBreadcrumbTapped?: (index: number) => void;
  onGridSizeChanged?: (size: GridConfigKey) => void;
  onGridSizeLoaded?: (size: GridConfigKey) => void;
  onResetDbPressed?: () => void;
  onSentenceWillSpeak?: () => void;
  /**
   * Whether the Verbi column is shown. When true the grid reserves one extra column
   * (plus a right-edge gutter) so the column always fits on screen — its exact width
   * is derived here rather than passed in.
   */
  showVerbiColumn?: boolean;

  // Verbi Props
  verbiState?: VerbiClientState;
  onVerbiSuggestionSelected?: (suggestion: VerbiSuggestion) => void;
  onVerbiFolderOpened?: (folder: VerbiFolder) => void;
  onVerbiFolderBack?: () => void;
}

const SentenceBuilderGrid = forwardRef<
  SentenceBuilderGridRef,
  SentenceBuilderGridProps
>(
  (
    {
      isTablet,
      onNodesChanged,
      onWordAdded,
      onWordRemoved,
      onSentencePlayed,
      onBreadcrumbTapped,
      onGridSizeChanged,
      onGridSizeLoaded,
      onResetDbPressed,
      onSentenceWillSpeak,
      showVerbiColumn = false,
      verbiState,
      onVerbiSuggestionSelected,
      onVerbiFolderOpened,
      onVerbiFolderBack,
    },
    ref,
  ) => {
    const {addUtterance} = useDatabase();
    const {getItem, setItem, preferences} = useAppSettings();
    const navigation = useNavigation<NavigationProp>();

    // While Verbi's partner listening owns the microphone, TTS must not hand it
    // back to the wake-word engine when playback ends — the listener reopens the
    // mic itself the moment speaking stops.
    const verbiOwnsMicRef = useRef(false);
    verbiOwnsMicRef.current =
      verbiState?.listeningState === 'listening' ||
      verbiState?.listeningState === 'paused_for_tts';

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
    const [forgotPinDigits, setForgotPinDigits] = useState([
      '',
      '',
      '',
      '',
      '',
    ]);
    const [forgotPinError, setForgotPinError] = useState('');
    const forgotPinInputRef = useRef<TextInput | null>(null);
    // Manual drag-and-drop state: the tile being dragged, the last finger
    // position (window coordinates), and the board's measured window rect.
    const dragSourceRef = useRef<Node | null>(null);
    const lastDragPosRef = useRef<{x: number; y: number} | null>(null);
    const boardRectRef = useRef<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>(null);
    const boardViewRef = useRef<View | null>(null);
    const [showPlaceholderModal, setShowPlaceholderModal] = useState(false);
    const [placeholderWord, setPlaceholderWord] = useState('');
    // Last card tapped, used only to swallow same-card double-taps.
    const lastPressRef = useRef<{nodeId: string; at: number}>({
      nodeId: '',
      at: 0,
    });
    // Presses are serialized rather than dropped: a press that lands while the
    // previous one is still speaking / writing waits its turn instead of being
    // ignored, so no word is lost when tapping quickly.
    const pressChainRef = useRef<Promise<void>>(Promise.resolve());
    // Mirror of sentenceTokenIds that is correct between renders, so a queued
    // press sees the words the presses before it just added.
    const sentenceTokenIdsRef = useRef<string[]>([]);

    // Verbi settings inline panel
    const [showVerbiInfo, setShowVerbiInfo] = useState(false);
    const [showMicInfo, setShowMicInfo] = useState(false);
    const [showPredictionCountInfo, setShowPredictionCountInfo] =
      useState(false);

    const verbiEnabledPref = preferences.verbiEnabled !== '0';
    const verbiMicEnabledPref = preferences.verbiMicrophoneEnabled !== '0';
    const verbiSuggestionLimitPref = parseVerbiSuggestionLimit(
      preferences.verbiSuggestionLimit,
    );

    const handleVerbiToggle = async (value: boolean) => {
      await setItem('verbiEnabled', value ? '1' : '0');
    };

    const handleVerbiSuggestionLimitChange = async (limit: number) => {
      await setItem('verbiSuggestionLimit', String(limit));
    };

    const handleVerbiMicToggle = async (value: boolean) => {
      await setItem('verbiMicrophoneEnabled', value ? '1' : '0');
    };

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

    // Keep the token mirror in step with removals / resets / reloads. The add
    // paths update it eagerly, before their state update has committed.
    useEffect(() => {
      sentenceTokenIdsRef.current = sentenceTokenIds;
    }, [sentenceTokenIds]);

    // Reset sentence whenever the screen is focused
    useFocusEffect(
      useCallback(() => {
        handleResetSentence('clear');
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

        // Normalize every board against the current grid size: pulls tiles
        // orphaned by past grid shrinks back into free cells and resolves
        // duplicate cell positions. Overfull boards are left as-is.
        const gridSettings = await sentenceBuilderSqlite.getGridSettings();
        await sentenceBuilderSqlite.repairBoardsForCapacity(
          gridSettings.gridRows * gridSettings.gridCols,
          'lenient',
        );

        const [allNodes, sentenceState, allFoldersData] = await Promise.all([
          sentenceBuilderSqlite.getNodes(),
          sentenceBuilderSqlite.getSentenceState(),
          sentenceBuilderSqlite.getAllFolders(),
        ]);

        setNodes(allNodes);
        onNodesChanged?.(allNodes);
        setSentenceTokenIds(sentenceState.tokenIds);
        setAllFolders(allFoldersData);

        // Reset sentence on initial load
        await handleResetSentence('clear');

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
      } catch (error) {}
    };

    const {width, height} = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // Real height of the scrollable grid area, measured on layout. Used in place of
    // the estimate below so rows fill the space exactly in both edit and normal mode.
    const [gridAreaHeight, setGridAreaHeight] = useState(0);
    const handleGridAreaLayout = useCallback((e: LayoutChangeEvent) => {
      const measured = e.nativeEvent.layout.height;
      // itemHeight derived from this value is part of every DraggableGrid key,
      // so accepting a measurement remounts the whole board. Real changes
      // (rotation, the 48px edit-mode selector) are tens of pixels; anything
      // smaller is jitter from surrounding content reflowing — e.g. the nav
      // bar shifting when the sentence goes empty↔non-empty — and remounting
      // the board mid-tap over it reads as a flicker.
      setGridAreaHeight(prev =>
        Math.abs(prev - measured) > 6 ? measured : prev,
      );
    }, []);

    const getGridConfig = useCallback(() => {
      return GRID_CONFIGS[selectedGridSize];
    }, [selectedGridSize]);

    const getCardDimensions = useCallback(() => {
      const gridConfig = getGridConfig();

      // Verbi column: laid out as one extra column of exactly one card width, plus a
      // right-edge gutter so the column isn't clipped by the screen boundary / rounded
      // corners. Solving cardWidth for (cols + 1) columns keeps grid + column + gutter
      // exactly equal to the screen width, whatever the grid size is.
      const verbiGutter = showVerbiColumn
        ? VERBI_COLUMN_GUTTER + insets.right
        : 0;
      const totalCols = gridConfig.cols + (showVerbiColumn ? 1 : 0);

      // In landscape mode: width is the longer dimension (screen width), height is the shorter dimension (screen height)
      const availableWidth = width - 8 - verbiGutter; // Reduced padding for more width (4px on each side), minus the Verbi gutter

      // Responsive breakpoints for different device types
      // Use prop if available, otherwise fallback to height check. Inclusive of 1024 for iPad Pro 12.9"
      const isTabletDevice = isTablet !== undefined ? isTablet : height >= 768;
      const isSmallMobile = height < 480;

      // Calculate UI elements height dynamically
      // Calculate UI elements height dynamically
      // Navigation bar height is approx 11-12% on mobile (9.5% token + padding)
      const navBarRatio = isTabletDevice ? 0.1 : 0.12;
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
      const insetsToSubtract = isTabletDevice
        ? insets.top + insets.bottom
        : insets.bottom;

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
        (availableWidth - (totalCols - 1) * cardSpacing) / totalCols;

      // Preferred: use the grid area's real measured height. The estimate above
      // (nav bar ratio + safety buffer + insets) is deliberately conservative and
      // leaves dead space at the bottom on tablets — and because the edit-mode
      // selector is subtracted twice over, the grid visibly grows downward when
      // entering edit mode. A measurement removes both problems.
      // Each row occupies cardHeight + cardSpacing (DraggableGrid's itemHeight).
      if (gridAreaHeight > 0) {
        const measured =
          Math.floor(gridAreaHeight / gridConfig.rows) - cardSpacing;
        const finalWidth = isTabletDevice
          ? Math.min(cardWidth, 220)
          : Math.floor(cardWidth);
        return {width: finalWidth, height: Math.max(measured, 40), verbiGutter};
      }

      // Fallback for the first frame, before the grid area has been laid out.
      const rawCardHeight =
        (availableHeight - (gridConfig.rows - 1) * cardSpacing) /
        gridConfig.rows;

      const cardHeight = Math.floor(rawCardHeight);

      if (!isTabletDevice) {
        // Mobile devices (both small and regular)
        return {width: Math.floor(cardWidth), height: cardHeight, verbiGutter};
      } else {
        // Tablets
        const finalWidth = Math.min(cardWidth, 220);
        // Ensure we don't accidentally make cards taller than calculated available space per row
        const finalHeight = Math.min(cardHeight, 200);
        return {width: finalWidth, height: finalHeight, verbiGutter};
      }
    }, [
      getGridConfig,
      isEditing,
      width,
      height,
      insets,
      isTablet,
      showVerbiColumn,
      gridAreaHeight,
    ]);

    const getColorForNode = useCallback((node: Node): string => {
      if (node.kind === 'folder') {
        return '#673AB7'; // Deep Purple
      }
      return DEFAULT_COLOR_MAP[node.type || 'other'];
    }, []);

    // Generate full grid with empty cells.
    //
    // Slot-stable board: orderIndex is a literal cell number in
    // [0, rows*cols). Every cell renders exactly once — a tile if a node
    // occupies it, an empty placeholder otherwise — so the layout is
    // identical in and out of edit mode and a moved tile leaves a gap
    // behind instead of the board compacting.
    //
    // Every cell also gets disabledReSorted: the DraggableGrid must never
    // re-sort (its insertion-shift semantics moved whole rows of tiles);
    // the drop outcome is computed manually in handleDragRelease instead.
    const getFullGridData = useCallback(() => {
      const gridConfig = getGridConfig();
      const totalCells = gridConfig.rows * gridConfig.cols;

      const makeEmptyCell = (id: string, slot: number): Node => ({
        id,
        parentId: null,
        kind: 'word' as const,
        title: '',
        type: 'other' as const,
        orderIndex: slot,
        isSeed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        key: id,
        disabledDrag: true, // an empty cell cannot be picked up
        disabledReSorted: true,
      });

      const slots: (Node | null)[] = new Array(totalCells).fill(null);
      const overflow: Node[] = [];

      // Active tiles claim their cells before soft-deleted placeholders so
      // a placeholder colliding with a real tile never displaces it.
      const sorted = [...currentNodes].sort(
        (a, b) => a.orderIndex - b.orderIndex,
      );
      const placementOrder = [
        ...sorted.filter(n => !n.deleted),
        ...sorted.filter(n => n.deleted),
      ];
      for (const node of placementOrder) {
        const idx = node.orderIndex;
        if (idx >= 0 && idx < totalCells && slots[idx] === null) {
          slots[idx] = node;
        } else {
          // Collision or out-of-range index (rare after load-time repair):
          // spill to the next free cell, else to the overflow rows.
          const free = slots.indexOf(null);
          if (free !== -1) {
            slots[free] = node;
          } else if (!node.deleted) {
            overflow.push(node);
          }
        }
      }

      const cells: Node[] = slots.map((node, slot) => {
        if (node === null) {
          return makeEmptyCell(`empty-${slot}`, slot);
        }
        if (node.deleted) {
          // Soft-deleted node: renders as an empty cell holding its slot.
          return makeEmptyCell(`empty-deleted-${node.id}`, slot);
        }
        return {
          ...node,
          orderIndex: slot,
          disabledDrag: !isEditing || node.disabledDrag,
          disabledReSorted: true,
        };
      });

      // Overfull board (legacy state): extra rows keep the tiles reachable
      // in edit mode; they stay static until cells free up and the load-time
      // repair pulls them onto the board.
      overflow.forEach((node, index) => {
        cells.push({
          ...node,
          orderIndex: totalCells + index,
          disabledDrag: true,
          disabledReSorted: true,
        });
      });

      return cells;
    }, [currentNodes, getGridConfig, isEditing]);

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

    // IEP session evidence: the board page the child is on, by folder title.
    const iepCurrentPageId = () =>
      folderStack.length > 0 ? folderStack[folderStack.length - 1].title : 'Mainboard';

    const handleBackPress = () => {
      if (folderStack.length > 0) {
        const to = folderStack.length > 1 ? folderStack[folderStack.length - 2].title : 'Mainboard';
        iepCapture.pageOpened(iepCurrentPageId(), to);
        setFolderStack(prev => prev.slice(0, -1));
      }
    };

    // Function to go back to root of sentence builder (not navigate away)
    const handleBackToRoot = () => {
      if (folderStack.length > 0) {
        iepCapture.pageOpened(iepCurrentPageId(), 'Mainboard');
      }
      setFolderStack([]);
    };

    // Function to log word selection to database
    const logWordSelection = async (word: string, partOfSpeech?: WordType) => {
      // IEP session evidence: a word added to the sentence in progress. The board's own
      // word type is the SLP-configured part of speech; the store only guesses without it.
      iepCapture.wordSelected(word.trim(), iepCurrentPageId(), partOfSpeech ?? null);
      try {
        await addUtterance({
          word: word.trim(),
          dateof: new Date(),
          source: 'Convo',
        });
      } catch (error) {
        // Fail silently as requested
      }
      // Personal Memory: completed word selection (fire-and-forget)
      personalMemoryService.recordCompletedCommunication({
        eventId: makeMemoryEventId(),
        kind: 'word',
        text: word.trim(),
        words: [word.trim()],
        source: 'Convo',
        occurredAt: new Date(),
      });
    };

    // Card handlers
    // Runs one press to completion. Never call directly — go through
    // handleCardPress so presses stay serialized.
    const processCardPress = async (node: Node) => {
      try {
        // Handle empty cells from deleted nodes (add new item) - only when in editing mode
        if (node.id.startsWith('empty-deleted-') && isEditing) {
          handleAddCardPress(node.orderIndex);
          return;
        }

        // Handle regular empty cells (add new item) - only when in editing mode
        if (node.id.startsWith('empty-') && isEditing) {
          handleAddCardPress(node.orderIndex);
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
            const originalNode = currentNodes.find(
              n => n.id === originalNodeId,
            );
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
          iepCapture.pageOpened(iepCurrentPageId(), node.title);
          setFolderStack(prev => [
            ...prev,
            {nodeId: node.id, title: node.title},
          ]);
        } else {
          // Check for placeholder image
          if (isPlaceholderImage(node.imageUri)) {
            setPlaceholderWord(node.title);
            setShowPlaceholderModal(true);
            return;
          }

          // Speak the word using TTS (always speak, even if it's a consecutive duplicate)
          const textToSpeak = node.ttsText || node.title;
          await TTSService.speak(
            textToSpeak,
            true,
            undefined,
            !verbiOwnsMicRef.current,
          );

          // Logic for adding to sentence: block consecutive duplicates.
          // Read the mirror, not state: an earlier press in this same burst may
          // not have re-rendered yet.
          const currentTokens = sentenceTokenIdsRef.current;
          const isConsecutiveDuplicate =
            currentTokens.length > 0 &&
            currentTokens[currentTokens.length - 1] === node.id;

          if (!isConsecutiveDuplicate) {
            // Add word to sentence database
            await sentenceBuilderSqlite.addWordToSentence(node.id);

            // Update local state
            const nextTokens = [...sentenceTokenIdsRef.current, node.id];
            sentenceTokenIdsRef.current = nextTokens;
            setSentenceTokenIds(nextTokens);

            // Notify parent component about word addition
            onWordAdded?.(node.id);

            // Log word selection to database (analytics/history)
            await logWordSelection(textToSpeak, node.type);
          }
        }
      } catch (error) {
        if (node.kind !== 'folder') {
          Alert.alert('Error', 'Failed to add word to sentence');
        }
      }
    };

    const handleCardPress = (node: Node) => {
      const now = Date.now();
      const last = lastPressRef.current;
      if (last.nodeId === node.id && now - last.at < SAME_CARD_TAP_WINDOW_MS) {
        return;
      }
      lastPressRef.current = {nodeId: node.id, at: now};

      // Queue behind whatever press is still in flight so nothing is dropped.
      pressChainRef.current = pressChainRef.current
        .then(() => processCardPress(node))
        .catch(() => {});
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

      // Use the tapped cell, or the first free cell. Never place beyond the
      // board's capacity — that is how tiles used to get orphaned.
      const nextPosition =
        position !== undefined
          ? position
          : getFullGridData().find(cell => cell.id.startsWith('empty-'))
              ?.orderIndex;
      if (nextPosition === undefined) {
        Alert.alert(
          'Board Full',
          'Every cell is taken. Remove a card first, or switch to a bigger grid size.',
        );
        return;
      }

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
        const config = GRID_CONFIGS[newSize];

        // Tiles outside the new bounds are moved into free cells of their
        // board. A board with more tiles than the new size has cells cannot
        // shrink — repair refuses without writing, and the size stays put.
        const repair = await sentenceBuilderSqlite.repairBoardsForCapacity(
          config.rows * config.cols,
          'strict',
        );
        if (!repair.ok) {
          const cellCount = config.rows * config.cols;
          const excess = repair.cardCount - cellCount;
          Alert.alert(
            'Cannot Change Grid Size',
            `"${repair.fullBoardTitle}" has ${repair.cardCount} cards, but a ${newSize} grid only fits ${cellCount}. Delete at least ${excess} card${excess === 1 ? '' : 's'} from "${repair.fullBoardTitle}", then try again.`,
          );
          return;
        }

        setSelectedGridSize(newSize);
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
        // IEP session evidence: a word removed before the sentence ended. Recorded only
        // once the removal has actually happened.
        const removed = nodes.find(n => n.id === nodeId);
        if (removed) {
          iepCapture.wordRemoved((removed.ttsText || removed.title).trim(), iepCurrentPageId());
        }
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

    const handleResetSentence = async (reason: 'play' | 'clear') => {
      try {
        // Prevent errors if DB is not yet initialized
        if (!sentenceBuilderSqlite.isInitialized()) {
          setSentenceTokenIds([]);
          return;
        }

        // Notify parent component about the sentence ending before clearing
        if (sentenceTokenIds.length > 0) {
          onSentencePlayed?.(sentenceTokenIds, nodes, reason);
        }

        await sentenceBuilderSqlite.clearSentence();
        setSentenceTokenIds([]);
      } catch (error) {
        Alert.alert('Error', 'Failed to clear sentence');
      }
    };

    // Imperative handle: lets Convo.tsx inject Verbi suggestion words
    useImperativeHandle(
      ref,
      () => ({
        openSettings: () => {
          handleEditPress();
        },
        addWordByLabel: (label: string, spokenText?: string) => {
          const normalizedLabel = label.trim().toLowerCase();
          const existingNode = nodes.find(
            n =>
              n.kind === 'word' &&
              n.title.trim().toLowerCase() === normalizedLabel,
          );

          // Speak the word using TTS when selected from prediction area
          const textToSpeak = spokenText || existingNode?.ttsText || label;
          TTSService.speak(
            textToSpeak,
            true,
            undefined,
            !verbiOwnsMicRef.current,
          );

          if (existingNode) {
            // Reuse existing board node — avoids DB writes for duplicates
            const currentTokens = sentenceTokenIdsRef.current;
            const isConsecutiveDuplicate =
              currentTokens.length > 0 &&
              currentTokens[currentTokens.length - 1] === existingNode.id;

            if (!isConsecutiveDuplicate) {
              sentenceBuilderSqlite
                .addWordToSentence(existingNode.id)
                .then(() => {
                  const nextTokens = [
                    ...sentenceTokenIdsRef.current,
                    existingNode.id,
                  ];
                  sentenceTokenIdsRef.current = nextTokens;
                  setSentenceTokenIds(nextTokens);
                  onWordAdded?.(existingNode.id);
                  // Log word selection to database (analytics/history)
                  logWordSelection(textToSpeak, existingNode.type);
                })
                .catch(() => {});
            }
          } else {
            // Create a synthetic in-session node (not persisted to DB)
            const syntheticId = `verbi_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 8)}`;
            const pepesImageUri = resolvePepesImage(label, preferences.pepes);
            const syntheticNode: Node = {
              id: syntheticId,
              key: syntheticId,
              parentId: null,
              kind: 'word',
              title: label,
              imageUri: pepesImageUri || undefined,
              ttsText: spokenText ?? label,
              orderIndex: 9999,
              isSeed: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              disabledDrag: true,
              disabledReSorted: true,
              deleted: false,
            };
            setNodes(prev => {
              const next = [...prev, syntheticNode];
              onNodesChanged?.(next);
              return next;
            });
            const nextTokens = [...sentenceTokenIdsRef.current, syntheticId];
            sentenceTokenIdsRef.current = nextTokens;
            setSentenceTokenIds(nextTokens);
            onWordAdded?.(syntheticId);
            // Log word selection to database (analytics/history)
            logWordSelection(textToSpeak);
          }
        },
      }),
      [nodes, sentenceTokenIds, preferences.pepes, onWordAdded, onNodesChanged],
    );

    // New handler functions for NavigationBar
    const handleMicrophonePress = () => {
      navigation.navigate('HOME', {
        stateof: 'Attention',
      });
    };

    const handleTrashPress = () => {
      handleResetSentence('clear');
    };

    // Handle breadcrumb folder navigation
    const handleBreadcrumbFolderPress = (index: number) => {
      onBreadcrumbTapped?.(index);
      {
        const to = index === -1 ? 'Mainboard' : folderStack[index]?.title ?? 'Mainboard';
        if (to !== iepCurrentPageId()) {
          iepCapture.pageOpened(iepCurrentPageId(), to);
        }
      }
      if (index === -1) {
        // Go to root (Mainboard)
        setFolderStack([]);
      } else {
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
          if (nodeData.kind === 'folder' && (nodeData as any).sourceFolderId) {
            // Converting an existing card into a copy of an existing folder:
            // replace the card outright so the copy brings the folder's
            // image and children along, instead of just renaming the card.
            await sentenceBuilderSqlite.permanentlyDeleteNode(editModal.nodeId);
            await sentenceBuilderSqlite.copyFolder(
              (nodeData as any).sourceFolderId,
              editModal.parentId || null,
              editModal.position || 0,
            );
          } else {
            // Update existing node (normal edit mode)
            await sentenceBuilderSqlite.updateNode(editModal.nodeId, nodeData);
          }
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

          // If the new card landed on a cell held by a soft-deleted
          // placeholder, purge the placeholder so the cell isn't claimed by
          // both rows.
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
        }

        // Reload data
        await initializeAndLoadData();
        setEditModal({isVisible: false});
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

    // Drag and drop handlers.
    //
    // The DraggableGrid is reduced to "long-press + tile follows finger":
    // every cell carries disabledReSorted, so the library never re-sorts and
    // always snaps the tile home on release, reporting the unchanged order.
    // The real outcome — move to an empty cell, or swap with the tile that
    // is dropped on — is computed here from the finger position and applied
    // by remounting the board (gridRefreshKey).
    const handleDragStart = (item: Node) => {
      dragSourceRef.current = item;
      lastDragPosRef.current = null;
      boardRectRef.current = null;
      boardViewRef.current?.measureInWindow((x, y, w, h) => {
        boardRectRef.current = {x, y, width: w, height: h};
      });
    };

    // moveX/moveY are absolute window coordinates; together with the board's
    // measured window rect they identify the cell under the finger.
    const handleDragging = (gestureState: PanResponderGestureState) => {
      lastDragPosRef.current = {x: gestureState.moveX, y: gestureState.moveY};
    };

    const handleDragRelease = async () => {
      const source = dragSourceRef.current;
      const pos = lastDragPosRef.current;
      const rect = boardRectRef.current;
      dragSourceRef.current = null;

      // No gesture data (never moved) or no measurement: nothing to do —
      // the library has already snapped the tile back to its cell.
      if (!isEditing || !source || !pos || !rect || rect.width <= 0) {
        return;
      }

      const gridConfig = getGridConfig();
      // Same cell geometry the library uses: width / numColumns, itemHeight.
      const cellWidth = rect.width / gridConfig.cols;
      const cellHeight = getCardDimensions().height + 4;
      const col = Math.floor((pos.x - rect.x) / cellWidth);
      const row = Math.floor((pos.y - rect.y) / cellHeight);
      if (
        col < 0 ||
        col >= gridConfig.cols ||
        row < 0 ||
        row >= gridConfig.rows
      ) {
        return; // dropped outside the board
      }

      const targetSlot = row * gridConfig.cols + col;
      const sourceSlot = source.orderIndex;
      if (targetSlot === sourceSlot) {
        return;
      }

      try {
        const currentParentId =
          folderStack.length > 0
            ? folderStack[folderStack.length - 1].nodeId
            : null;

        const target = getFullGridData()[targetSlot];
        const ids: string[] = [source.id];
        const orderIndexes: number[] = [targetSlot];
        if (target.id.startsWith('empty-deleted-')) {
          // The target cell is held by a soft-deleted row: swap slots so the
          // empty cell moves to where the tile came from.
          ids.push(target.id.replace('empty-deleted-', ''));
          orderIndexes.push(sourceSlot);
        } else if (!target.id.startsWith('empty-')) {
          // Occupied cell: swap the two tiles.
          ids.push(target.id);
          orderIndexes.push(sourceSlot);
        }
        // Plain empty cell: the tile just moves; its old cell becomes a gap.

        await sentenceBuilderSqlite.reorderNodesWithPositions(
          currentParentId,
          ids,
          orderIndexes,
        );

        // Remount the board: discards the library's snap-back animation and
        // renders the final arrangement.
        setGridRefreshKey(prev => prev + 1);
        await updateCurrentNodes();
      } catch (error) {
        Alert.alert('Error', 'Failed to move the card');
        await initializeAndLoadData();
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
                borderWidth: node.kind === 'folder' ? 4 : 3,
                borderColor:
                  isEmptyCell || isDeletedCard
                    ? '#BDBDBD'
                    : node.kind === 'folder'
                    ? '#222222'
                    : color,
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
                  // Above the folder strips (zIndex 11/12) so it stays tappable
                  zIndex: 20,
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

            {/* Top semi-transparent strip for folders */}
            {node.kind === 'folder' && !isEmptyCell && !isDeletedCard && (
              <View
                pointerEvents="none"
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
                pointerEvents="none"
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
                  {isEditing && (
                    <Text
                      style={{
                        fontSize: cardDimensions.width * 0.2,
                        color: '#757575',
                      }}>
                      +
                    </Text>
                  )}
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
                    backgroundColor:
                      node.kind === 'folder'
                        ? '#FFF8E7'
                        : 'rgba(255, 255, 255, 0.7)',
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
                      fontSize:
                        node.kind === 'folder'
                          ? Math.max(10, cardDimensions.width * 0.07)
                          : Math.max(8, cardDimensions.width * 0.06),
                      fontWeight: node.kind === 'folder' ? '800' : '600',
                      color: '#000',
                      textAlign: 'center',
                      textShadowColor:
                        node.kind === 'folder'
                          ? undefined
                          : 'rgba(0, 0, 0, 0.8)',
                      textShadowOffset:
                        node.kind === 'folder'
                          ? undefined
                          : {width: 1, height: 1},
                      textShadowRadius: node.kind === 'folder' ? undefined : 2,
                    }}
                    numberOfLines={2}>
                    {node.kind === 'folder'
                      ? node.title.toUpperCase()
                      : node.title}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      );
    };

    // Wait for the grid area measurement before building the board — the
    // DraggableGrid captures itemHeight once on mount, so mounting against
    // the fallback estimate would lock in the wrong row height.
    const gridChunks = gridAreaHeight > 0 ? getGridDataChunks() : [];
    // Chunks beyond the first are legacy overflow rows (more tiles than the
    // grid has cells); they are the only reason the board ever scrolls.
    const hasOverflowRows = gridChunks.length > 1;

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
          isListening={verbiState?.listeningState === 'listening'}
          onTrashPress={handleTrashPress}
          onPlayPress={() => handleResetSentence('play')}
          nodes={nodes}
          sentenceTokenIds={sentenceTokenIds}
          onRemoveToken={handleRemoveToken}
          folderStack={folderStack}
          onFolderPress={handleBreadcrumbFolderPress}
          onBackPress={handleBackPress}
          onSentenceWillSpeak={onSentenceWillSpeak}
        />

        {/* Main Content Area (Grid + Verbi predictions side-by-side) */}
        <View style={styles.mainContentRow}>
          {/* Grid */}
          <View key={gridRefreshKey} style={styles.gridContainer}>
            {/* Grid Size Selection Buttons and Reset DB - Only visible in edit mode */}
            {isEditing && (
              <View style={styles.gridSizeContainer}>
                {/* ── 1. Prediction Settings (First in line) ── */}
                <View style={styles.predictionSettingsRow}>
                  {/* Verbi AI Suggestions */}
                  <View style={styles.predictionSettingItem}>
                    <Image
                      source={require('../../assets/movie/recording.gif')}
                      style={styles.predictionIcon}
                      resizeMode="contain"
                    />
                    <Switch
                      trackColor={{false: '#767577', true: '#8E24AA'}}
                      thumbColor={verbiEnabledPref ? '#fff' : '#f4f3f4'}
                      ios_backgroundColor="#3e3e3e"
                      onValueChange={handleVerbiToggle}
                      value={verbiEnabledPref}
                      style={styles.predictionSwitch}
                    />
                    <TouchableOpacity
                      onPress={() => setShowVerbiInfo(true)}
                      style={styles.predictionInfoBtn}
                      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                      <Text style={styles.predictionInfoBtnText}>?</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Divider */}
                  <View style={styles.predictionDivider} />

                  {/* Microphone for Suggestions */}
                  <View
                    style={[
                      styles.predictionSettingItem,
                      !verbiEnabledPref && {opacity: 0.4},
                    ]}>
                    <Image
                      source={require('../../assets/michrophone.gif')}
                      style={styles.predictionIcon}
                      resizeMode="contain"
                    />
                    <Switch
                      trackColor={{false: '#767577', true: '#8E24AA'}}
                      thumbColor={verbiMicEnabledPref ? '#fff' : '#f4f3f4'}
                      ios_backgroundColor="#3e3e3e"
                      onValueChange={handleVerbiMicToggle}
                      value={verbiMicEnabledPref}
                      disabled={!verbiEnabledPref}
                      style={styles.predictionSwitch}
                    />
                    <TouchableOpacity
                      onPress={() => setShowMicInfo(true)}
                      style={styles.predictionInfoBtn}
                      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                      <Text style={styles.predictionInfoBtnText}>?</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ── 2. Verbi Prediction Count ── */}
                <View
                  style={[
                    styles.gridSizeGroup,
                    !verbiEnabledPref && {opacity: 0.4},
                  ]}>
                  <Text style={styles.gridSizeLabel}>AI suggestions:</Text>
                  <View style={styles.gridSizeButtons}>
                    {VERBI_SUGGESTION_LIMITS.map(limit => (
                      <TouchableOpacity
                        key={limit}
                        disabled={!verbiEnabledPref}
                        style={[
                          styles.gridSizeButton,
                          verbiSuggestionLimitPref === limit &&
                            styles.gridSizeButtonActive,
                        ]}
                        onPress={() => handleVerbiSuggestionLimitChange(limit)}>
                        <Text
                          style={[
                            styles.gridSizeButtonText,
                            verbiSuggestionLimitPref === limit &&
                              styles.gridSizeButtonTextActive,
                          ]}>
                          {limit}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowPredictionCountInfo(true)}
                    style={styles.predictionInfoBtn}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Text style={styles.predictionInfoBtnText}>?</Text>
                  </TouchableOpacity>
                </View>

                {/* ── 3. Grid Size Section ── */}
                <View style={styles.gridSizeGroup}>
                  <Text style={styles.gridSizeLabel}>Grid Size:</Text>
                  <View style={styles.gridSizeButtons}>
                    {Object.keys(GRID_CONFIGS).map(size => (
                      <TouchableOpacity
                        key={size}
                        style={[
                          styles.gridSizeButton,
                          selectedGridSize === size &&
                            styles.gridSizeButtonActive,
                        ]}
                        onPress={() =>
                          handleGridSizeChange(size as GridConfigKey)
                        }>
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
                </View>

                {/* ── 4. Reset DB ── */}
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={resetDatabase}>
                  <Text style={styles.resetButtonText}>Reset DB</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView
              style={styles.gridScrollContainer}
              onLayout={handleGridAreaLayout}
              contentContainerStyle={styles.gridScrollContent}
              showsVerticalScrollIndicator={true}
              // The board is sized to fill the viewport exactly, so scrolling
              // only exists to reach legacy overflow rows (a board holding
              // more tiles than the grid has cells) while editing.
              bounces={hasOverflowRows}
              scrollEventThrottle={16} // Smooth scrolling
              nestedScrollEnabled={true} // Enable nested scrolling for mobile
              scrollEnabled={isEditing && hasOverflowRows}>
              {gridChunks.map((chunk, chunkIndex) => {
                  // Always use full grid data to show empty cells in both editing and non-editing modes
                  const dataToUse = chunk;
                  const itemHeight = getCardDimensions().height + 4; // card height + margin (2px on each side)

                  return (
                    <View
                      key={`${chunkIndex}-${gridRefreshKey}`}
                      // Chunk 0 is the board proper; its window rect maps the
                      // finger position to a cell on drag release.
                      ref={chunkIndex === 0 ? boardViewRef : undefined}
                      style={[
                        styles.gridChunk,
                        chunkIndex > 0 && styles.overflowChunk,
                      ]}>
                      <DraggableGrid
                        // itemHeight is in the key on purpose: it is read once per
                        // mount, so rotation / edit-mode / grid-size changes need a
                        // fresh mount to pick up the new row height.
                        key={`draggable-${chunkIndex}-${gridRefreshKey}-${itemHeight}`}
                        numColumns={getGridConfig().cols}
                        data={dataToUse}
                        renderItem={renderCard}
                        style={styles.draggableGrid}
                        itemHeight={itemHeight}
                        onDragRelease={
                          isEditing ? handleDragRelease : undefined
                        }
                        onItemPress={handleCardPress}
                        onDragStart={isEditing ? handleDragStart : undefined}
                        onDragging={isEditing ? handleDragging : undefined}
                        delayLongPress={
                          isEditing ? 300 : LONG_PRESS_DISABLED_MS
                        }
                      />
                    </View>
                  );
                })}
            </ScrollView>
          </View>

          {/* Verbi predictions column */}
          {verbiState && (
            <VerbiColumn
              state={verbiState}
              cardWidth={getCardDimensions().width}
              cardHeight={getCardDimensions().height}
              gutter={getCardDimensions().verbiGutter}
              onSuggestionSelected={onVerbiSuggestionSelected!}
              onFolderOpened={onVerbiFolderOpened!}
              onFolderBack={onVerbiFolderBack!}
            />
          )}
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
                          style={{
                            position: 'absolute',
                            width: 0,
                            height: 0,
                            opacity: 0,
                          }}
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
                                {showAdminCode ? digit : digit ? '●' : ''}
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
                            adminCodeInput.length !== 4 &&
                              styles.disabledButton,
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
                          setTimeout(
                            () => forgotPinInputRef.current?.focus(),
                            200,
                          );
                        }}>
                        <Text style={styles.forgotCodeText}>
                          <Text style={styles.forgotCodeLabel}>
                            Forgot password?
                          </Text>
                        </Text>
                        <Text style={[styles.forgotCodeText, {marginTop: 4}]}>
                          Open a browser and go to{' '}
                          <Text style={{fontWeight: 'bold'}}>
                            verbali.io/forgotadminpassword
                          </Text>
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : isForgotPassword ? (
                    <>
                      <Text style={styles.modalTitle}>Master Override</Text>
                      <Text style={styles.modalDescription}>
                        Enter your 5-digit master override code to reset your
                        admin PIN.
                      </Text>
                      <Text
                        style={[
                          styles.modalDescription,
                          {
                            fontSize: 13,
                            color: '#888',
                            fontStyle: 'italic',
                            marginBottom: 15,
                          },
                        ]}>
                        you need to go to
                        https://www.verbali.io/forgotadminpassword to get the
                        code
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
                          style={{
                            position: 'absolute',
                            width: 0,
                            height: 0,
                            opacity: 0,
                          }}
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
                        <Text
                          style={{
                            color: '#E54848',
                            fontSize: 14,
                            marginTop: 8,
                            textAlign: 'center',
                          }}>
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
                          <Text style={styles.buttonText}>
                            I remember my code
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.modalButton,
                            styles.submitButton,
                            forgotPinInput.length !== 5 &&
                              styles.disabledButton,
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
                          style={{
                            position: 'absolute',
                            width: 0,
                            height: 0,
                            opacity: 0,
                          }}
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
                                  {fontSize: 36, lineHeight: pinBoxSize},
                                ]}>
                                {digit ? '●' : ''}
                              </Text>
                            </View>
                          );
                        })}
                      </Pressable>

                      {/* Error message */}
                      {newPinError !== '' && (
                        <Text
                          style={{
                            color: '#E54848',
                            fontSize: 14,
                            marginTop: 8,
                            textAlign: 'center',
                          }}>
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
          <TouchableWithoutFeedback
            onPress={() => setShowPlaceholderModal(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View
                  style={[
                    styles.modalContent,
                    {borderColor: '#ff3b30', borderWidth: 2},
                  ]}>
                  <Text style={styles.warningIcon}>⚠️</Text>
                  <Text style={[styles.modalTitle, {color: '#ff3b30'}]}>
                    Missing Image
                  </Text>
                  <Text style={styles.placeholderWarningText}>
                    No image is attached to "{placeholderWord}", please go to
                    settings and add an image to this word.
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
                    style={[
                      styles.modalButton,
                      styles.cancelButton,
                      {marginTop: 15, width: '100%'},
                    ]}
                    onPress={() => setShowPlaceholderModal(false)}>
                    <Text style={styles.buttonText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Verbi AI Suggestions info popup */}
        <Modal
          visible={showVerbiInfo}
          transparent={true}
          animationType="fade"
          supportedOrientations={['landscape-left', 'landscape-right']}
          onRequestClose={() => setShowVerbiInfo(false)}>
          <TouchableWithoutFeedback onPress={() => setShowVerbiInfo(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={[styles.modalContent, {alignItems: 'flex-start'}]}>
                  <Text style={[styles.modalTitle, {marginBottom: 12}]}>
                    Verbi AI Suggestions
                  </Text>
                  <Text style={styles.modalDescription}>
                    Shows AI-powered word suggestions while you build sentences.
                    Verbi learns from your conversation context to offer the
                    most relevant next words, helping you communicate faster.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.submitButton,
                      {marginTop: 16, width: '100%'},
                    ]}
                    onPress={() => setShowVerbiInfo(false)}>
                    <Text style={styles.buttonText}>Got it</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Microphone for Suggestions info popup */}
        <Modal
          visible={showMicInfo}
          transparent={true}
          animationType="fade"
          supportedOrientations={['landscape-left', 'landscape-right']}
          onRequestClose={() => setShowMicInfo(false)}>
          <TouchableWithoutFeedback onPress={() => setShowMicInfo(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={[styles.modalContent, {alignItems: 'flex-start'}]}>
                  <Text style={[styles.modalTitle, {marginBottom: 12}]}>
                    Microphone for Suggestions
                  </Text>
                  <Text style={styles.modalDescription}>
                    Listens for your conversation partner after your first word.
                    Listening starts only after you begin a sentence. Raw audio
                    is never stored — it's used only to improve Verbi's word
                    predictions in the moment.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.submitButton,
                      {marginTop: 16, width: '100%'},
                    ]}
                    onPress={() => setShowMicInfo(false)}>
                    <Text style={styles.buttonText}>Got it</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Verbi prediction count info popup */}
        <Modal
          visible={showPredictionCountInfo}
          transparent={true}
          animationType="fade"
          supportedOrientations={['landscape-left', 'landscape-right']}
          onRequestClose={() => setShowPredictionCountInfo(false)}>
          <TouchableWithoutFeedback
            onPress={() => setShowPredictionCountInfo(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={[styles.modalContent, {alignItems: 'flex-start'}]}>
                  <Text style={[styles.modalTitle, {marginBottom: 12}]}>
                    Verbi Predictions
                  </Text>
                  <Text style={styles.modalDescription}>
                    Choose how many word suggestions Verbi offers: 10, 15 or 20.
                    {'\n\n'}
                    10 — fewer words, but they show up faster.
                    {'\n'}
                    15 or 20 — more words to choose from, though they take a
                    moment longer to appear.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.submitButton,
                      {marginTop: 16, width: '100%'},
                    ]}
                    onPress={() => setShowPredictionCountInfo(false)}>
                    <Text style={styles.buttonText}>Got it</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    );
  },
);

SentenceBuilderGrid.displayName = 'SentenceBuilderGrid';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  mainContentRow: {
    flex: 1,
    flexDirection: 'row',
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
  gridSizeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridSizeLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginRight: 4,
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
    flexGrow: 1, // Ensure content can grow
  },
  // The board fills its viewport exactly (row height = measured area / rows),
  // so chunks carry no extra spacing — any padding here would force the
  // ScrollView to scroll in edit mode.
  gridChunk: {},
  overflowChunk: {
    marginTop: 12,
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
    shadowOffset: {width: 0, height: 1},
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
  // Prediction settings inside isEditing toolbar
  predictionSettingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  predictionSettingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  predictionIcon: {
    width: 28,
    height: 28,
    borderRadius: 4,
  },
  predictionSwitch: {
    transform: [{scaleX: 0.8}, {scaleY: 0.8}],
  },
  predictionDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#dee2e6',
    marginHorizontal: 4,
  },
  predictionInfoBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#8E24AA',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  predictionInfoBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E24AA',
    lineHeight: 12,
  },
});

export default SentenceBuilderGrid;
