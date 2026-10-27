/**
 * Settings → On-Device AI. Adult fork only (MERGING_FROM_MATALKFOREVER.md §3).
 *
 * Lets a caregiver download one of the bundled GGUF models, pick which one
 * answers, and switch answer generation between the online service and the
 * model on this device. Loading and unloading is driven by AssistantProvider
 * from the two preferences this screen writes.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {useAppSettings} from '../utils/persistance';
import mixpanel from '../utils/mixpanelInstance';
import {
  LOCAL_MODEL_KEYS,
  LocalModelKey,
  getLocalModel,
  resolveLocalModelKey,
} from '../services/localLlm/localLlmModels';
import {
  DownloadCancelledError,
  LocalModelStatus,
  formatBytes,
  localModelStore,
} from '../services/localLlm/localModelStore';
import {
  LocalLlmRunStats,
  LocalLlmState,
  localLlmEngine,
} from '../services/localLlm/localLlmEngine';

const PURPLE = '#8E24AA';
const RED = '#f44336';

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * One line a caregiver can read out when answers feel slow: how long the
 * last question took and where the time went. "Reading" is the prompt
 * evaluation (new tokens only; the rest came from the cache), "writing" the
 * answer tokens.
 */
export function describeRun(run: LocalLlmRunStats, gpu: boolean): string {
  const parts = [
    `Last answer took ${seconds(run.ms)}`,
    `reading ${run.promptTokens} tokens ${seconds(run.promptMs)} (${run.cachedTokens} cached)`,
    `writing ${run.genTokens} tokens ${seconds(run.genMs)}`,
    gpu ? 'GPU' : 'CPU',
  ];
  if (run.prefills > 0) {
    parts.push(`${run.prefillTokens} tokens read while the partner was still talking`);
  }
  if (run.timedOut) parts.push('timed out');
  if (run.fallback) parts.push('built-in answers shown');
  return `${parts.join(' · ')}.`;
}

const LocalLlmSettings: React.FC = () => {
  const {preferences, setItem} = useAppSettings();
  const enabled = preferences.localLlmEnabled === '1';
  const selectedKey = resolveLocalModelKey(preferences.localLlmModel);

  const [statuses, setStatuses] = useState<LocalModelStatus[]>([]);
  const [engine, setEngine] = useState<LocalLlmState>(localLlmEngine.getState());
  const [downloadingKey, setDownloadingKey] = useState<LocalModelKey | null>(null);
  const [progress, setProgress] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    setStatuses(await localModelStore.statuses());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => localLlmEngine.subscribe(setEngine), []);

  // Cancel an in-flight download only when the screen really goes away; the
  // ref keeps re-renders from touching a multi-GB transfer.
  useEffect(
    () => () => {
      cancelRef.current?.();
    },
    [],
  );

  const isDownloaded = (key: LocalModelKey) =>
    statuses.find(s => s.key === key)?.isDownloaded ?? false;
  const totalBytes = statuses.reduce((sum, s) => sum + s.bytes, 0);
  const busy = downloadingKey !== null || engine.status === 'loading';

  const enableWith = async (key: LocalModelKey) => {
    if (key !== selectedKey) await setItem('localLlmModel', key);
    mixpanel.track('local_llm_enabled_changed', {enabled: true, model: key});
    await setItem('localLlmEnabled', '1');
  };

  const handleToggle = async (value: boolean) => {
    if (!value) {
      mixpanel.track('local_llm_enabled_changed', {enabled: false});
      await setItem('localLlmEnabled', '0');
      return;
    }
    const key = await localModelStore.firstDownloaded(selectedKey);
    if (!key) {
      Alert.alert(
        'Download a model first',
        'Pick one of the models below and tap Download. Answers keep using the online service until a model is on this device.',
      );
      return;
    }
    await enableWith(key);
  };

  const runDownload = async (key: LocalModelKey) => {
    const model = getLocalModel(key);
    mixpanel.track('local_llm_model_download_started', {model: key});
    setDownloadingKey(key);
    setProgress(0);
    const job = localModelStore.download(key, setProgress);
    cancelRef.current = job.cancel;
    try {
      await job.promise;
      await refresh();
      mixpanel.track('local_llm_model_downloaded', {model: key});
      if (!enabled) {
        Alert.alert(
          'Model ready',
          `${model.name} is on this device. Turn on "Answer on this device" now?`,
          [
            {text: 'Not now', style: 'cancel', onPress: () => setItem('localLlmModel', key)},
            {text: 'Turn on', onPress: () => enableWith(key)},
          ],
        );
      } else if (key !== selectedKey) {
        Alert.alert('Model ready', `Switch answers to ${model.name} now?`, [
          {text: 'Keep current', style: 'cancel'},
          {text: 'Switch', onPress: () => selectModel(key)},
        ]);
      }
    } catch (error) {
      const cancelled =
        error instanceof DownloadCancelledError || String(error).includes('cancelled');
      if (!cancelled) {
        console.error('[LocalLLM] download failed:', error);
        mixpanel.track('local_llm_model_download_failed', {
          model: key,
          error: error instanceof Error ? error.message : String(error),
        });
        Alert.alert(
          'Download failed',
          `Could not download ${model.name}. Check the connection and free space, then try again.`,
        );
      }
      await refresh();
    } finally {
      cancelRef.current = null;
      setDownloadingKey(null);
      setProgress(0);
    }
  };

  const startDownload = async (key: LocalModelKey) => {
    if (cancelRef.current) return;
    const model = getLocalModel(key);
    const net = await NetInfo.fetch().catch(() => null);
    if (net?.type === 'cellular') {
      Alert.alert(
        'Use mobile data?',
        `${model.name} is ${model.sizeLabel}. Downloading over mobile data may cost money; Wi-Fi is recommended.`,
        [
          {text: 'Wait for Wi-Fi', style: 'cancel'},
          {text: 'Download anyway', onPress: () => runDownload(key)},
        ],
      );
      return;
    }
    runDownload(key);
  };

  const cancelDownload = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setDownloadingKey(null);
    setProgress(0);
  };

  const selectModel = async (key: LocalModelKey) => {
    mixpanel.track('local_llm_model_selected', {model: key});
    await setItem('localLlmModel', key);
  };

  const confirmDelete = (key: LocalModelKey) => {
    const model = getLocalModel(key);
    const inUse = enabled && key === selectedKey;
    Alert.alert(
      'Delete model',
      `Remove ${model.name} (${model.sizeLabel}) from this device?` +
        (inUse ? ' It is the model in use, so answers go back to the online service.' : '') +
        ' You can download it again later.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (inUse) {
                await setItem('localLlmEnabled', '0');
                // Unload before unlinking the file it is mapped from.
                await localLlmEngine.release();
              }
              await localModelStore.remove(key);
              await refresh();
              mixpanel.track('local_llm_model_deleted', {model: key});
            } catch (error) {
              console.error('[LocalLLM] delete failed:', error);
              Alert.alert('Delete failed', 'Could not remove the model file.');
            }
          },
        },
      ],
    );
  };

  const selectedName = getLocalModel(selectedKey).name;
  const statusText = (() => {
    if (!enabled) return 'Off. Answers come from the online service.';
    switch (engine.status) {
      case 'loading':
        return `Loading ${selectedName}…`;
      case 'ready':
        return `Ready. ${selectedName} answers on this device (${engine.gpu ? 'GPU' : 'CPU'}).`;
      case 'generating':
        return `Answering with ${selectedName}…`;
      case 'error':
        return `Could not load ${selectedName}: ${engine.error}. Simple built-in answers are shown instead; nothing is sent online.`;
      default:
        return 'Starting…';
    }
  })();

  return (
    <View>
      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={styles.label}>Answer on this device</Text>
          <Text style={styles.description}>
            Builds the answer cards with an AI model stored on this device. It
            works without internet, and the conversation never leaves the
            device. Download a model below first.
          </Text>
        </View>
        <Switch
          trackColor={{false: '#767577', true: PURPLE}}
          thumbColor={enabled ? '#fff' : '#f4f3f4'}
          ios_backgroundColor="#3e3e3e"
          onValueChange={handleToggle}
          value={enabled}
          accessibilityLabel="Answer on this device"
        />
      </View>

      <View style={styles.statusRow}>
        {enabled && (engine.status === 'loading' || engine.status === 'generating') && (
          <ActivityIndicator size="small" color={PURPLE} style={styles.spinner} />
        )}
        <Text
          style={[
            styles.status,
            enabled && engine.status === 'error' && styles.statusError,
            enabled && engine.status === 'ready' && styles.statusReady,
          ]}>
          {statusText}
        </Text>
      </View>
      {enabled && engine.lastRun && (
        <Text style={styles.diagnostics}>{describeRun(engine.lastRun, engine.gpu)}</Text>
      )}

      <Text style={styles.subheading}>Models</Text>

      {LOCAL_MODEL_KEYS.map(key => {
        const model = getLocalModel(key);
        const downloaded = isDownloaded(key);
        const selected = key === selectedKey;
        const downloadingThis = downloadingKey === key;
        const badge = enabled && selected && downloaded ? 'IN USE' : selected && downloaded ? 'SELECTED' : null;

        return (
          <View key={key} style={[styles.card, selected && downloaded && styles.cardSelected]}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{model.name}</Text>
              {model.recommended && (
                <View style={[styles.badge, styles.badgeMuted]}>
                  <Text style={styles.badgeText}>RECOMMENDED</Text>
                </View>
              )}
              {badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
            </View>
            <Text style={styles.description}>{model.description}</Text>
            <Text style={styles.specs}>
              {model.sizeLabel} download
              {downloaded ? ' · on this device' : ''}
            </Text>

            {downloadingThis ? (
              <View style={styles.downloadBlock}>
                <View style={styles.track}>
                  <View style={[styles.fill, {width: `${Math.min(100, progress)}%`}]} />
                </View>
                <View style={styles.downloadRow}>
                  <Text style={styles.progressText}>{progress.toFixed(0)}%</Text>
                  <TouchableOpacity onPress={cancelDownload} hitSlop={8}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.actions}>
                {!downloaded && (
                  <TouchableOpacity
                    style={[styles.primaryButton, busy && styles.disabled]}
                    onPress={() => startDownload(key)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Download ${model.name}`}>
                    <Text style={styles.primaryButtonText}>Download</Text>
                  </TouchableOpacity>
                )}
                {downloaded && !selected && (
                  <TouchableOpacity
                    style={[styles.primaryButton, busy && styles.disabled]}
                    onPress={() => selectModel(key)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${model.name}`}>
                    <Text style={styles.primaryButtonText}>Use this model</Text>
                  </TouchableOpacity>
                )}
                {downloaded && (
                  <TouchableOpacity
                    style={[styles.ghostButton, busy && styles.disabled]}
                    onPress={() => confirmDelete(key)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${model.name}`}>
                    <Text style={styles.ghostButtonText}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}

      <Text style={styles.footnote}>
        Models are stored inside the app ({formatBytes(totalBytes)} used). Only
        one runs at a time; switching unloads the current one first. While this
        is on, no question is ever sent to the online service: if the model
        cannot load, simple built-in answers are shown until it is fixed.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  switchText: {flex: 1, paddingRight: 10},
  spinner: {marginRight: 8},
  label: {
    fontSize: 18,
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
    lineHeight: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  status: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  statusReady: {color: '#2e7d32'},
  statusError: {color: '#c62828'},
  diagnostics: {
    fontSize: 12,
    color: '#888',
    lineHeight: 17,
    paddingHorizontal: 10,
    paddingBottom: 10,
    marginTop: -6,
  },
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    padding: 14,
    marginBottom: 10,
  },
  cardSelected: {borderColor: PURPLE, borderWidth: 1.5},
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  name: {fontSize: 17, fontWeight: '700', color: '#333'},
  badge: {
    backgroundColor: PURPLE,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeMuted: {backgroundColor: '#7e57c2'},
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  specs: {fontSize: 12, color: '#888', marginTop: 8},
  actions: {flexDirection: 'row', gap: 10, marginTop: 12},
  primaryButton: {
    flex: 1,
    backgroundColor: PURPLE,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryButtonText: {color: '#fff', fontSize: 15, fontWeight: '600'},
  ghostButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  ghostButtonText: {color: RED, fontSize: 15, fontWeight: '600'},
  disabled: {opacity: 0.4},
  downloadBlock: {marginTop: 12},
  track: {height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#e1e1e1'},
  fill: {height: 6, borderRadius: 3, backgroundColor: PURPLE},
  downloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressText: {fontSize: 13, color: '#666'},
  cancelText: {fontSize: 14, color: RED, fontWeight: '600'},
  footnote: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 18,
  },
});

export default LocalLlmSettings;
