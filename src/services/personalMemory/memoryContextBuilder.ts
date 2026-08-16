// Pure fact-selection and serialization-cap logic for MemoryContext (PRD §9.1).

import type {KnowledgeItemRow, MemoryContext} from '../../types/personalMemory';

export const MAX_FACTS = 8;
export const TARGET_CHARS = 600;
export const HARD_CAP_CHARS = 1000;

function lexicalOverlap(statement: string, currentText: string): boolean {
  const words = new Set(
    currentText
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2),
  );
  return statement
    .toLowerCase()
    .split(/\W+/)
    .some(w => w.length > 2 && words.has(w));
}

/**
 * Relevance-select facts for AI context: confirmed + active first, flagged
 * facts only on direct lexical match with the current interaction, excluded
 * statuses never.
 */
export function selectContextFacts(
  facts: KnowledgeItemRow[],
  currentText?: string,
): string[] {
  const eligible = facts.filter(
    fact =>
      fact.ai_context_enabled === 1 &&
      (fact.status === 'active' || fact.status === 'possibly_outdated'),
  );

  const scored = eligible
    .filter(fact => {
      const flagged =
        fact.review_flag === 'possibly_outdated' ||
        fact.status === 'possibly_outdated';
      if (!flagged) {
        return true;
      }
      // Flagged facts join only when directly relevant to the interaction.
      return !!currentText && lexicalOverlap(fact.statement, currentText);
    })
    .map(fact => {
      let score = 0;
      if (fact.confirmed === 1) {
        score += 4;
      }
      score += Math.min(2, fact.confidence * 2);
      if (currentText && lexicalOverlap(fact.statement, currentText)) {
        score += 3;
      }
      const reinforcedMs = Date.parse(fact.last_reinforced);
      if (!Number.isNaN(reinforcedMs)) {
        const days = (Date.now() - reinforcedMs) / (24 * 60 * 60 * 1000);
        score += Math.max(0, 1 - days / 90);
      }
      return {fact, score};
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_FACTS).map(entry => entry.fact.statement);
}

/**
 * Enforce the serialized size cap: truncate facts first, then sequences,
 * then frequent/recent words. Returns undefined if nothing is left.
 */
export function capContextSize(
  context: MemoryContext,
): MemoryContext | undefined {
  const size = (c: MemoryContext) => JSON.stringify(c).length;

  const trimmed: MemoryContext = JSON.parse(JSON.stringify(context));

  const shrinkSteps: Array<(c: MemoryContext) => boolean> = [
    c => {
      if (c.personal && c.personal.facts.length > 0) {
        c.personal.facts.pop();
        if (c.personal.facts.length === 0) {
          delete c.personal;
        }
        return true;
      }
      return false;
    },
    c => {
      const seq = c.communication?.commonSequences;
      if (seq && seq.length > 0) {
        seq.pop();
        return true;
      }
      return false;
    },
    c => {
      const freq = c.communication?.frequentWords;
      if (freq && freq.length > 0) {
        freq.pop();
        return true;
      }
      return false;
    },
    c => {
      const recent = c.communication?.recentWords;
      if (recent && recent.length > 0) {
        recent.pop();
        return true;
      }
      return false;
    },
  ];

  // Shrink in priority order: exhaust facts before touching sequences, and
  // sequences before word lists.
  let guard = 100;
  while (size(trimmed) > HARD_CAP_CHARS && guard-- > 0) {
    const shrunk = shrinkSteps.some(step => step(trimmed));
    if (!shrunk) {
      break;
    }
  }

  const hasCommunication =
    !!trimmed.communication &&
    ((trimmed.communication.recentWords?.length ?? 0) > 0 ||
      (trimmed.communication.frequentWords?.length ?? 0) > 0 ||
      (trimmed.communication.commonSequences?.length ?? 0) > 0);
  const hasPersonal = (trimmed.personal?.facts.length ?? 0) > 0;

  if (!hasCommunication && !hasPersonal) {
    return undefined;
  }
  if (!hasCommunication) {
    delete trimmed.communication;
  }
  return trimmed;
}
