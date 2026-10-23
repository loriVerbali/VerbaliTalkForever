/**
 * Local identifiers for IEP records. UUID v4 shaped, generated without native crypto so
 * the same code runs under Jest, Node and Hermes. These ids only need to be unique on
 * one device.
 */
export function newId(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += hex[(Math.random() * 4) | 8];
    } else {
      out += hex[(Math.random() * 16) | 0];
    }
  }
  return out;
}

export interface IdGenerator {
  next(): string;
}

export const randomIds: IdGenerator = { next: newId };

/** Deterministic ids for tests. */
export function sequentialIds(prefix = 'id'): IdGenerator {
  let n = 0;
  return {
    next() {
      n += 1;
      return `${prefix}-${String(n).padStart(4, '0')}`;
    },
  };
}
