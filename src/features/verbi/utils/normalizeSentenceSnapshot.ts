import { Node } from '../../../types/sentenceBuilder';
import { PredictionRequestItem } from '../state/verbiTypes';

export interface SentenceSnapshot {
  text: string;
  items: PredictionRequestItem[];
  itemCount: number;
}

/**
 * Builds an immutable snapshot of the current sentence bar.
 * Captured synchronously at prediction-request time to prevent stale-closure bugs.
 */
export function normalizeSentenceSnapshot(
  sentenceTokenIds: string[],
  nodes: Node[],
): SentenceSnapshot {
  const nodeMap = new Map<string, Node>(nodes.map(n => [n.id, n]));

  const items: PredictionRequestItem[] = sentenceTokenIds
    .map(id => {
      const node = nodeMap.get(id);
      if (!node) return null;
      return {
        id: node.id,
        label: node.title,
        spokenText: node.ttsText ?? node.title,
      } as PredictionRequestItem;
    })
    .filter((item): item is PredictionRequestItem => item !== null);

  const text = items.map(i => i.spokenText ?? i.label).join(' ');

  return {
    text,
    items,
    itemCount: items.length,
  };
}
