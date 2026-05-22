// Types for Sentence Builder Grid Component

export type NodeKind = 'folder' | 'word';
export type WordType =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'preposition'
  | 'conjunction'
  | 'interjection'
  | 'article'
  | 'number'
  | 'letter'
  | 'question'
  | 'other';

export interface Node {
  id: string;
  parentId: string | null; // null = root grid
  kind: NodeKind;
  title: string;
  type?: WordType; // for words only (determines color)
  imageUri?: string; // local path (for words)
  imageHash?: string; // for deduplication
  ttsText?: string; // optional TTS override
  orderIndex: number; // placement in grid
  isSeed: boolean; // default content
  seedPackVersion?: number; // versioning
  createdAt: string;
  updatedAt: string;
  key: string; // for DraggableGrid compatibility (same as id)
  disabledDrag?: boolean; // for DraggableGrid compatibility
  disabledReSorted?: boolean; // for DraggableGrid compatibility
  deleted?: boolean; // marks if card is deleted (leaves empty space)
}

export interface GridSettings {
  gridRows: number;
  gridCols: number;
  colorMap: Record<WordType, string>; // JSON object mapping word types to colors
}

export interface SentenceState {
  tokenIds: string[]; // array of node IDs in order
}

export interface FolderStackItem {
  nodeId: string;
  title: string;
}

// Grid size configurations
export const GRID_CONFIGS = {
  '5x6': { rows: 5, cols: 6 },
  '6x6': { rows: 6, cols: 6 },
  '7x7': { rows: 7, cols: 7 },
  '8x8': { rows: 8, cols: 8 },
} as const;

export type GridConfigKey = keyof typeof GRID_CONFIGS;

// Default color mapping for word types - Modified Fitzgerald Key
export const DEFAULT_COLOR_MAP: Record<WordType, string> = {
  pronoun: '#FBC02D',      // Yellow - People/Pronouns
  verb: '#4CAF50',         // Green - Actions/Verbs
  noun: '#FF9800',         // Orange - Nouns/Things
  adjective: '#2196F3',    // Blue - Descriptors
  adverb: '#2196F3',       // Blue - Descriptors (grouped with Adjectives)
  preposition: '#E91E63',  // Pink - Grammar/Function words
  conjunction: '#E91E63',  // Pink - Grammar/Function words
  interjection: '#E91E63', // Pink - Social/Politeness
  question: '#9C27B0',     // Purple - Questions
  article: '#9E9E9E',      // Grey - Determiners/Grammar
  number: '#2196F3',       // Blue - Quantifiers/Descriptors
  letter: '#9E9E9E',       // Grey - Other
  other: '#9E9E9E',        // Grey - Other
};

// Default folder color
export const FOLDER_COLOR = '#673AB7'; // Deep Purple

// Edit modal states
export interface EditModalState {
  isVisible: boolean;
  nodeId?: string; // undefined for new node
  parentId?: string | null;
  position?: number; // for new nodes
}

// Search state for edit modal
export interface SearchState {
  query: string;
  results: any[]; // WordImageResult[]
  isSearching: boolean;
}

// Drag and drop state
export interface DragDropState {
  isDragging: boolean;
  draggedNodeId?: string;
  targetPosition?: number;
}
