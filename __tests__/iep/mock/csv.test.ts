import { booleanOrNull, numberOrNull, parseCsv, parseCsvRows } from '../../../src/features/iep/mock/csv';

describe('csv parser', () => {
  it('parses quoted fields with commas, doubled quotes and embedded newlines', () => {
    const rows = parseCsvRows('a,"b, c","say ""hi""","line1\nline2"\n1,2,3,4\n');
    expect(rows).toEqual([
      ['a', 'b, c', 'say "hi"', 'line1\nline2'],
      ['1', '2', '3', '4'],
    ]);
  });

  it('accepts CRLF and LF endings and a BOM', () => {
    expect(parseCsvRows('﻿x,y\r\n1,2\r\n3,4')).toEqual([
      ['x', 'y'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('maps rows onto the header and skips blank lines', () => {
    const table = parseCsv('id,value\nS1,5\n\nS2,\n');
    expect(table.header).toEqual(['id', 'value']);
    expect(table.rows).toEqual([
      { id: 'S1', value: '5' },
      { id: 'S2', value: '' },
    ]);
  });

  it('keeps a blank cell absent rather than zero', () => {
    expect(numberOrNull('')).toBeNull();
    expect(numberOrNull('0')).toBe(0);
    expect(numberOrNull('2.5')).toBe(2.5);
    expect(numberOrNull('n/a')).toBeNull();
    expect(booleanOrNull('')).toBeNull();
    expect(booleanOrNull('Yes')).toBe(true);
    expect(booleanOrNull('no')).toBe(false);
  });
});
