import { DEFAULT_COLOR_MAP, WordType } from '../../../types/sentenceBuilder';
import { VerbiSuggestionCategory } from '../state/verbiTypes';
import { normalizePos } from './normalizePos';

/**
 * Verbi category → Fitzgerald word type used by the main board.
 *
 * FALLBACK ONLY. The engine now returns an explicit `color` on each suggestion
 * (and on each entry of the response's `groups` array); that colour is the
 * source of truth and is what `getTheme` uses whenever it is present. This map
 * exists for responses that predate the colour field, and for offline/fallback
 * suggestions the client synthesises itself.
 *
 * `category` carries a part-of-speech value, so the keys here are POS names —
 * never topics. Don't add topic keys ("food", "feelings", …): a topic that is
 * missing from the map would silently paint grey. Colour those from the
 * server's `color` instead.
 */
const CATEGORY_TO_WORD_TYPE: Record<string, WordType> = {
  // Verbi categories
  pronoun: 'pronoun',
  verb: 'verb',
  adjective: 'adjective',
  noun: 'noun',
  social: 'interjection',
  preposition: 'preposition',
  question: 'question',
  // Remaining board word types, in case the engine returns them directly
  adverb: 'adverb',
  conjunction: 'conjunction',
  interjection: 'interjection',
  article: 'article',
  number: 'number',
  letter: 'letter',
  other: 'other',
};

const FALLBACK_BASE = '#9E9E9E';

/** Lightness the label/header text is pinned to, so it reads on a light tint. */
const TEXT_LIGHTNESS = 0.32;

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Accepts the colour shapes the engine may send (`#RRGGBB`, `#RGB`, or the same
 * without the hash) and returns a canonical `#RRGGBB`, or undefined if the value
 * isn't a colour we can render. Anything unparseable falls through to the
 * category fallback rather than crashing the column.
 */
export function normalizeHex(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return undefined;
  const digits = trimmed.replace('#', '');
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map(c => c + c)
          .join('')
      : digits;
  return `#${full.toUpperCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const digits = hex.replace('#', '');
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ];
}

/** #RRGGBB → rgba() at the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(normalizeHex(hex) ?? FALLBACK_BASE);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Darkens a colour to a fixed lightness while keeping its hue and saturation.
 *
 * The Fitzgerald hues are tuned for fills, so at label sizes they're too light
 * to read. Deriving the text shade (rather than looking it up) means an
 * arbitrary server-sent colour gets a readable label too.
 */
function toTextShade(hex: string): string {
  const [r255, g255, b255] = hexToRgb(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic: just clamp the lightness.
    const v = Math.round(Math.min(l, TEXT_LIGHTNESS) * 255);
    const channel = v.toString(16).padStart(2, '0');
    return `#${channel}${channel}${channel}`.toUpperCase();
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) {
    h = (g - b) / d + (g < b ? 6 : 0);
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  h /= 6;

  // Never lighten: a colour already dark enough keeps its own lightness.
  const targetL = Math.min(l, TEXT_LIGHTNESS);
  const q = targetL < 0.5 ? targetL * (1 + s) : targetL + s - targetL * s;
  const p = 2 * targetL - q;

  const hueToChannel = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const channels = [h + 1 / 3, h, h - 1 / 3]
    .map(t => Math.round(hueToChannel(t) * 255))
    .map(v => v.toString(16).padStart(2, '0'))
    .join('');

  return `#${channels}`.toUpperCase();
}

export interface CategoryTheme {
  /** Base hue: the server's colour when it sent one, else the POS fallback. */
  base: string;
  /** Readable dark shade for header/label text. */
  text: string;
  /** Group container border. */
  border: string;
  /** Group container fill. */
  fill: string;
  /** Header band fill, sitting on top of `fill`. */
  headerFill: string;
}

/** Builds the container shades a group/tile paints itself with from one hue. */
function buildTheme(base: string): CategoryTheme {
  // The group reads as a container in its own colour: a clear border, a light
  // fill, and a stronger header band. Alphas (rather than flat hexes) let the
  // column's violet backdrop show through, keeping the whole column visually
  // distinct from the page behind it.
  return {
    base,
    text: toTextShade(base),
    border: withAlpha(base, 0.6),
    fill: withAlpha(base, 0.16),
    headerFill: withAlpha(base, 0.32),
  };
}

/**
 * Resolves the theme for a group or tile.
 *
 * `color` — the value the engine sent — wins whenever it parses. `category`
 * (a POS value) is only consulted when there is no usable colour, so the client
 * never has to interpret the engine's category vocabulary to paint the UI.
 */
export function getTheme(
  color?: string | null,
  category?: VerbiSuggestionCategory | string,
): CategoryTheme {
  const serverColor = normalizeHex(color);
  if (serverColor) {
    return buildTheme(serverColor);
  }
  return getCategoryTheme(category);
}

/**
 * POS-only fallback path. Prefer {@link getTheme} so a server-sent colour is
 * honoured; reach for this directly only where no colour can exist.
 */
export function getCategoryTheme(
  category: VerbiSuggestionCategory | string | undefined,
): CategoryTheme {
  // The engine's casing/spacing/pluralisation isn't guaranteed, so canonicalise
  // to a POS before lookup; anything non-POS resolves to the grey fallback.
  const wordType = CATEGORY_TO_WORD_TYPE[normalizePos(category)];
  const base = (wordType && DEFAULT_COLOR_MAP[wordType]) || FALLBACK_BASE;
  return buildTheme(base);
}
