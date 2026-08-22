import {
  CATEGORY_LABELS,
  VerbiGroupSpec,
  VerbiSuggestion,
  VerbiSuggestionCategory,
} from '../state/verbiTypes';
import { CanonicalPos, POS_ORDER, normalizePos } from './normalizePos';

/** One rendered group in the column: heading, colour and its cards. */
export interface ResolvedVerbiGroup {
  key: string;
  label: string;
  /** Hex from the engine, or undefined to let the tile fall back to its POS. */
  color?: string;
  category?: VerbiSuggestionCategory;
  items: VerbiSuggestion[];
}

/**
 * Groups the column's suggestions by part of speech.
 *
 * The sections are always POS sections — Verbs, Nouns, Describing … — never the
 * engine's topics. The response's `groups` array is therefore *not* used for
 * headings or ordering; it is consulted only to borrow a colour for a POS
 * section whose cards carry none. Suggestions whose `category` isn't a part of
 * speech land in "Other" rather than spawning a topic heading.
 */
export function buildVerbiGroups(
  suggestions: VerbiSuggestion[],
  groups: VerbiGroupSpec[] | undefined,
): ResolvedVerbiGroup[] {
  const byPos = new Map<CanonicalPos, VerbiSuggestion[]>();
  for (const suggestion of suggestions) {
    const pos = normalizePos(suggestion.category);
    const existing = byPos.get(pos) ?? [];
    existing.push(suggestion);
    byPos.set(pos, existing);
  }

  return POS_ORDER.filter(pos => byPos.has(pos)).map(pos => {
    const items = byPos.get(pos)!;
    return {
      key: pos,
      label: CATEGORY_LABELS[pos] ?? pos,
      // Cards carry their own engine colour; the heading borrows the first one
      // so box and cards stay in the same hue. If none of them has a colour,
      // fall back to a group spec the engine sent for the same POS.
      color: items.find(s => s.color)?.color ?? colorForPos(pos, groups),
      category: pos,
      items,
    };
  });
}

/** Colour of the engine group whose category maps to this POS, if any. */
function colorForPos(
  pos: CanonicalPos,
  groups: VerbiGroupSpec[] | undefined,
): string | undefined {
  return groups?.find(g => g.category && normalizePos(g.category) === pos)?.color;
}
