/**
 * HeroContext types — Tell Us More / Magic Build / Magic Update
 *
 * Tile actions mirror PRD §10.2. Tile shapes are kept compatible
 * with the existing PepeItem used in MyPepesAndStuff so that
 * AI-generated tiles can be merged directly into the local pepes store.
 */

export type TileAction = 'none' | 'create' | 'update' | 'delete';

// ----- Tile types (PepeItem-compatible) -----

export interface AITile {
  id: string;
  _action: TileAction;
  name: string;
  aliases: string[];
  imageUri?: string; // optional — AI won't supply this; placeholder used
  type?: string;
  relationship?: string;
  category?: string; // For People: 'Family' | 'Friends' | 'Professionals' | 'Other'
}

export interface AITilesMap {
  people: AITile[];
  toys: AITile[];
  pets: AITile[];
  tv_shows: AITile[];
  food: AITile[];
  drinks: AITile[];
  places: AITile[];
}

// ----- API request/response shapes -----

export interface MagicBuildRequest {
  transcriptOrInput: string;
  currentFreeText: string;
  locale?: string;
  timezone?: string;
}

export interface MagicUpdateRequest {
  currentFreeText: string;
  newInput: string;
  locale?: string;
  timezone?: string;
}

export interface MagicPreviewSummary {
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
}

export interface MagicPreviewResponse {
  tiles: AITilesMap;
  free_text_form: string;
  summary?: MagicPreviewSummary;
}

export interface SaveRawContextRequest {
  freeTextContext: string;
}

export interface SaveRawContextResponse {
  freeTextContext: string;
  updatedAt: string;
}

export interface FinalizePreviewRequest {
  tiles: AITilesMap;
  free_text_form: string;
}

export interface FinalizePreviewResponse {
  tiles: AITilesMap;
  freeTextContext: string;
  updatedAt: string;
}
