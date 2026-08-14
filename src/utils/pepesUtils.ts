export interface PepesItem {
  id?: string;
  name: string;
  aliases?: string[];
  imageUri?: string;
  [key: string]: any;
}

export interface PepesData {
  People?: PepesItem[];
  Toys?: PepesItem[];
  Pets?: PepesItem[];
  TVShows?: PepesItem[];
  Food?: PepesItem[];
  Drinks?: PepesItem[];
  Places?: PepesItem[];
  [category: string]: PepesItem[] | undefined;
}

const PEPES_CATEGORIES = [
  'People',
  'Toys',
  'Pets',
  'TVShows',
  'Food',
  'Drinks',
  'Places',
];

/**
 * Resolves a local Pepes image URI for a target word/label by matching item name or aliases.
 */
export function resolvePepesImageFromParsed(
  word: string,
  pepesData: PepesData | null | undefined,
  fallbackUrl: string = '',
): string {
  if (!pepesData || !word) return fallbackUrl;

  const normalizedWord = word.trim().toLowerCase();
  if (!normalizedWord) return fallbackUrl;

  for (const category of PEPES_CATEGORIES) {
    const items = pepesData[category] || [];
    for (const item of items) {
      const nameMatch = item.name?.trim().toLowerCase() === normalizedWord;
      const aliasMatch = item.aliases?.some(
        (alias: string) => alias.trim().toLowerCase() === normalizedWord,
      );

      if ((nameMatch || aliasMatch) && item.imageUri) {
        return item.imageUri;
      }
    }
  }

  return fallbackUrl;
}

/**
 * Appends a tile to a pepes category, returning the new PepesData.
 * Used by the Personal Memory "Add to People & Stuff" promotion flow.
 */
export function addPepesTile(
  pepesRawOrData: string | PepesData | null | undefined,
  category: string,
  item: PepesItem,
): PepesData {
  let data: PepesData = {};
  if (pepesRawOrData) {
    try {
      data =
        typeof pepesRawOrData === 'string'
          ? JSON.parse(pepesRawOrData)
          : {...pepesRawOrData};
    } catch (error) {
      data = {};
    }
  }
  for (const cat of PEPES_CATEGORIES) {
    if (!Array.isArray(data[cat])) {
      data[cat] = [];
    }
  }
  const target = PEPES_CATEGORIES.includes(category) ? category : 'People';
  const exists = (data[target] || []).some(
    existing =>
      existing.name?.trim().toLowerCase() === item.name.trim().toLowerCase(),
  );
  if (!exists) {
    data[target] = [...(data[target] || []), item];
  }
  return data;
}

/**
 * Parses raw pepes JSON string if needed and resolves local Pepes image URI.
 */
export function resolvePepesImage(
  word: string,
  pepesRawOrData: string | PepesData | null | undefined,
  fallbackUrl: string = '',
): string {
  if (!pepesRawOrData) return fallbackUrl;

  try {
    const parsedData: PepesData =
      typeof pepesRawOrData === 'string'
        ? JSON.parse(pepesRawOrData)
        : pepesRawOrData;
    return resolvePepesImageFromParsed(word, parsedData, fallbackUrl);
  } catch (error) {
    return fallbackUrl;
  }
}
