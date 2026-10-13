import React, {useState, useRef, useCallback, useEffect} from 'react';
import {View, StyleSheet} from 'react-native';
import SentenceBuilderGrid from '../Components/SentenceBuilder/SentenceBuilderGrid';
import type {SentenceBuilderGridRef} from '../Components/SentenceBuilder/SentenceBuilderGrid';
import ConvoWelcomeModal from '../Components/ConvoWelcomeModal';
import {useDatabase} from '../contexts/DatabaseContext';
import {
  personalMemoryService,
  makeMemoryEventId,
} from '../services/PersonalMemoryService';
import {useAppSettings} from '../utils/persistance';
import mixpanel from '../utils/mixpanelInstance';
import {GridConfigKey, Node} from '../types/sentenceBuilder';
import {useVerbiController} from '../features/verbi/hooks/useVerbiController';
import {iepCapture} from '../features/iep/capture/iepCapture';
import type {
  VerbiSuggestion,
  VerbiFolder,
} from '../features/verbi/state/verbiTypes';

const FALLBACK_BOARD_ID = 'default';

/** Flip to true while developing to show the welcome guide on every visit. */
const FORCE_SHOW_WELCOME = false;

const Convo = () => {
  const {addClassicEntry} = useDatabase();
  const {getItem, setItem, preferences} = useAppSettings();
  const gridRef = useRef<SentenceBuilderGridRef>(null);

  const [showWelcome, setShowWelcome] = useState(false);

  const [totalWordsAdded, setTotalWordsAdded] = useState(0);
  const [currentSentenceTokens, setCurrentSentenceTokens] = useState<string[]>(
    [],
  );
  const [currentNodes, setCurrentNodes] = useState<Node[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read synchronously by the word-add path: words can arrive faster than React
  // re-renders, and a state updater's callback has not run yet at the point we
  // need to know "was this the first word?". Nothing renders from these, so
  // they are refs rather than state.
  const sentenceTokensRef = useRef<string[]>([]);
  // Latest board nodes, readable from timers without re-creating callbacks.
  const currentNodesRef = useRef<Node[]>([]);
  const sentenceStartTimeRef = useRef<number | null>(null);

  // ─── One-time welcome guide ──────────────────────────────────────────────
  // Read straight from storage so we never flash the guide while the shared
  // preferences object is still loading its defaults.
  useEffect(() => {
    let cancelled = false;

    const checkWelcome = async () => {
      try {
        if (FORCE_SHOW_WELCOME) {
          setShowWelcome(true);
          return;
        }
        const shown = await getItem('convoWelcomeGuideShown');
        if (cancelled || shown === '1') return;
        // Persist immediately: the guide belongs to the first visit only, so it
        // must not return on a later visit even if this one is cut short.
        await setItem('convoWelcomeGuideShown', '1');
        if (cancelled) return;
        setShowWelcome(true);
        mixpanel.track('Convo Welcome Guide Shown');
      } catch (error) {
        // Fail silently - the guide is not critical
      }
    };

    checkWelcome();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWelcomeClose = useCallback(() => {
    setShowWelcome(false);
  }, []);

  // Opens the settings panel hosted by the grid on this screen
  const handleWelcomeOpenSettings = useCallback(() => {
    gridRef.current?.openSettings();
  }, []);

  // ─── Verbi: imperative word-add path ─────────────────────────────────────
  const handleAddVerbiWord = useCallback(
    (label: string, spokenText?: string) => {
      gridRef.current?.addWordByLabel(label, spokenText);
    },
    [],
  );

  // ─── Verbi Controller ─────────────────────────────────────────────────────
  const {
    verbiState,
    onWordAdded: verbiOnWordAdded,
    onWordRemoved: verbiOnWordRemoved,
    onSentenceCleared: verbiOnSentenceCleared,
    onSentenceSpoken: verbiOnSentenceSpoken,
    onSuggestionSelected,
    onFolderOpened,
    onFolderBack,
  } = useVerbiController({
    sentenceTokenIds: currentSentenceTokens,
    nodes: currentNodes,
    boardId: FALLBACK_BOARD_ID,
    locale: 'en-US',
    onAddVerbiWord: handleAddVerbiWord,
  });

  // Start timer when first word is added
  const handleFirstWordAdded = useCallback(() => {
    // Guard on the ref: two words tapped in the same frame would both still see
    // a null `sentenceStartTime` and start a second, orphaned timer.
    if (sentenceStartTimeRef.current === null) {
      const startTime = Date.now();
      sentenceStartTimeRef.current = startTime;

      // Set timeout for 4 minutes (240 seconds)
      timerRef.current = setTimeout(() => {
        // IEP session evidence: the sentence was abandoned by inactivity.
        iepCapture.sentenceEnded(
          sentenceTokensRef.current
            .map(id => {
              const node = currentNodesRef.current.find(n => n.id === id);
              return node ? (node.ttsText || node.title).trim() : '';
            })
            .filter(text => text !== ''),
          'inactivity',
        );
        // Timeout reached - reset timer
        sentenceStartTimeRef.current = null;
        sentenceTokensRef.current = [];
        setTotalWordsAdded(0);
        setCurrentSentenceTokens([]);
        verbiOnSentenceCleared();
      }, 4 * 60 * 1000); // 4 minutes in milliseconds
    }
  }, [verbiOnSentenceCleared]);

  const handleNodesChanged = useCallback((nodes: Node[]) => {
    currentNodesRef.current = nodes;
    setCurrentNodes(nodes);
  }, []);

  // Track word additions and deletions
  const handleWordAdded = useCallback(
    (nodeId: string) => {
      setTotalWordsAdded(prev => prev + 1);
      const isFirst = sentenceTokensRef.current.length === 0;
      sentenceTokensRef.current = [...sentenceTokensRef.current, nodeId];
      setCurrentSentenceTokens(sentenceTokensRef.current);
      verbiOnWordAdded(isFirst);
      handleFirstWordAdded();
    },
    [handleFirstWordAdded, verbiOnWordAdded],
  );

  const handleWordRemoved = useCallback(
    (nodeId: string, index: number) => {
      const newState = [...sentenceTokensRef.current];
      newState.splice(index, 1);
      sentenceTokensRef.current = newState;
      setCurrentSentenceTokens(newState);
      verbiOnWordRemoved(newState.length === 0);
      // Note: We don't decrease totalWordsAdded to track deleted words
    },
    [verbiOnWordRemoved],
  );

  // Handle sentence play - save to database
  const handleSentencePlayed = useCallback(
    async (sentenceTokens: string[], nodes: any[], reason: 'play' | 'clear' = 'play') => {
      // Update the nodes snapshot for Verbi context
      setCurrentNodes(nodes);

      // One entry per board token, the same shape the inactivity timer and the
      // store's own draft use, so a multi-word symbol counts the same however the
      // sentence ends.
      const tokenTexts = sentenceTokens
        .map(nodeId => {
          const node = nodes.find(n => n.id === nodeId);
          return node ? (node.ttsText || node.title).trim() : '';
        })
        .filter(text => text !== '');
      const sentenceText = tokenTexts.join(' ');

      // Notify Verbi that the sentence was spoken; the text is recorded as the
      // child's side of the conversation so predictions see the full dialogue.
      // A cleared sentence was never said: it must not become a child turn in the
      // conversation, and through that a turn in the IEP session evidence.
      if (reason === 'play') {
        verbiOnSentenceSpoken(sentenceText);
      } else {
        verbiOnSentenceCleared();
      }

      // IEP session evidence: the sentence ended with Play, or was cleared.
      currentNodesRef.current = nodes;
      iepCapture.sentenceEnded(tokenTexts, reason);

      const startedAt = sentenceStartTimeRef.current;
      if (startedAt === null) return;

      // Track play button tap
      mixpanel.track('Convo Play Tapped');

      try {
        // Calculate time taken
        const endTime = Date.now();
        const timeToBuild = Math.round((endTime - startedAt) / 1000); // Convert to seconds

        // Count words in final sentence
        const finalWordCount = sentenceText
          .split(' ')
          .filter(word => word.trim() !== '').length;

        // Save to database
        await addClassicEntry({
          sentence: sentenceText,
          wordcount: totalWordsAdded, // Include deleted words
          dateof: new Date(),
          timetobuild: timeToBuild,
        });

        // Personal Memory: completed (played) sentence
        personalMemoryService.recordCompletedCommunication({
          eventId: makeMemoryEventId(),
          kind: 'sentence',
          text: sentenceText,
          words: sentenceText.split(/\s+/).filter(Boolean),
          source: 'Convo',
          occurredAt: new Date(),
        });
      } catch (error) {
        // Don't show error to user - fail silently as requested
      } finally {
        // Reset timer and counters
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        sentenceStartTimeRef.current = null;
        sentenceTokensRef.current = [];
        setTotalWordsAdded(0);
        setCurrentSentenceTokens([]);
        verbiOnSentenceCleared();
      }
    },
    [
      totalWordsAdded,
      addClassicEntry,
      verbiOnSentenceSpoken,
      verbiOnSentenceCleared,
    ],
  );

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Track breadcrumb tap
  const handleBreadcrumbTapped = useCallback((index: number) => {
    mixpanel.track('Convo Breadcrumb Tapped', {index});
  }, []);

  // Track grid size change
  const handleGridSizeChanged = useCallback((size: GridConfigKey) => {
    mixpanel.track('Convo Grid Size Changed', {size});
  }, []);

  // Track grid size value and capture card width for Verbi column sizing
  const handleGridSizeLoaded = useCallback((size: GridConfigKey) => {
    mixpanel.track('Convo Grid Size', {size});
  }, []);

  // Track reset DB tap
  const handleResetDbPressed = useCallback(() => {
    mixpanel.track('Convo Reset DB Tapped');
  }, []);

  // Verbi suggestion handlers
  const handleVerbiSuggestionSelected = useCallback(
    (suggestion: VerbiSuggestion) => {
      onSuggestionSelected(suggestion);
    },
    [onSuggestionSelected],
  );

  const handleVerbiSentenceWillSpeak = useCallback(() => {
    verbiOnSentenceSpoken();
  }, [verbiOnSentenceSpoken]);

  const showVerbi = verbiState.enabled && verbiState.isOnline;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.gridContainer}>
          <SentenceBuilderGrid
            ref={gridRef}
            onNodesChanged={handleNodesChanged}
            onWordAdded={handleWordAdded}
            onWordRemoved={handleWordRemoved}
            onSentencePlayed={handleSentencePlayed}
            onBreadcrumbTapped={handleBreadcrumbTapped}
            onGridSizeChanged={handleGridSizeChanged}
            onGridSizeLoaded={handleGridSizeLoaded}
            onResetDbPressed={handleResetDbPressed}
            onSentenceWillSpeak={handleVerbiSentenceWillSpeak}
            showVerbiColumn={showVerbi}
            verbiState={showVerbi ? verbiState : undefined}
            onVerbiSuggestionSelected={handleVerbiSuggestionSelected}
            onVerbiFolderOpened={onFolderOpened}
            onVerbiFolderBack={onFolderBack}
          />
        </View>
      </View>

      <ConvoWelcomeModal
        visible={showWelcome}
        gender={preferences?.gender || ''}
        onClose={handleWelcomeClose}
        onOpenSettings={handleWelcomeOpenSettings}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  gridContainer: {
    flex: 1,
  },
});

export default Convo;
