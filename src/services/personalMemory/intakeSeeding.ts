// Pure mapping from caregiver-curated pepes tiles to Personal Knowledge seed
// facts (PRD §8.2). Uses the loose PepesData shape from pepesUtils.

import type {PepesData, PepesItem} from '../../utils/pepesUtils';
import type {KnowledgeCategory} from '../../types/personalMemory';

export interface SeedFact {
  pepesItemId: string;
  category: KnowledgeCategory;
  subject: string;
  value: string | null;
  statement: string;
}

const CATEGORY_MAP: Record<string, KnowledgeCategory> = {
  People: 'person',
  Pets: 'object',
  Toys: 'object',
  TVShows: 'object',
  Food: 'food',
  Drinks: 'food',
  Places: 'place',
};

const CATEGORY_NOUN: Record<string, string> = {
  People: 'person',
  Pets: 'pet',
  Toys: 'toy',
  TVShows: 'TV show',
  Food: 'food',
  Drinks: 'drink',
  Places: 'place',
};

export function seedKey(category: string, item: PepesItem): string {
  return item.id || `${category}:${item.name.trim().toLowerCase()}`;
}

export function mapPepesToKnowledge(pepes: PepesData): SeedFact[] {
  const facts: SeedFact[] = [];

  for (const [pepesCategory, knowledgeCategory] of Object.entries(
    CATEGORY_MAP,
  )) {
    const items = pepes[pepesCategory] || [];
    for (const item of items) {
      const name = (item.name || '').trim();
      if (!name) {
        continue;
      }
      const key = seedKey(pepesCategory, item);
      const noun = CATEGORY_NOUN[pepesCategory];

      if (pepesCategory === 'People' && item.relationship) {
        facts.push({
          pepesItemId: key,
          category: 'relationship',
          subject: name,
          value: String(item.relationship),
          statement: `${name} is the user's ${item.relationship}`,
        });
      } else {
        facts.push({
          pepesItemId: key,
          category: knowledgeCategory,
          subject: name,
          value: item.type ? String(item.type) : noun,
          statement:
            pepesCategory === 'People'
              ? `${name} is someone important to the user`
              : `${name} is a ${noun} in the user's life`,
        });
      }

      if (item.isFavorite === true) {
        facts.push({
          pepesItemId: `${key}#favorite`,
          category: 'like',
          subject: name,
          value: 'favorite',
          statement: `${name} is a favorite of the user`,
        });
      }
    }
  }

  return facts;
}
