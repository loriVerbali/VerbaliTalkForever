import { CSV_HEADER, buildIepCsv, csvField, csvFileName } from '../../../src/features/iep/export/csvExport';
import { NOW, fixtureProgress } from './helpers';

describe('CSV export', () => {
  it('starts with a BOM, uses CRLF, and has the exact header order', () => {
    const csv = buildIepCsv({ student: 'Sam', reportingPeriodLabel: 'Jun 21 – Sep 12, 2026', generatedOnMs: NOW, goals: [fixtureProgress([3, 5, 6])] });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines[lines.length - 1]).toBe('');
    expect(csv.includes('\n') && !csv.includes('\r\n')).toBe(false);
  });

  it('writes one row per session per goal with repeated goal columns and ISO dates', () => {
    const csv = buildIepCsv({ student: 'Sam', reportingPeriodLabel: 'P', generatedOnMs: NOW, goals: [fixtureProgress([3, 5, 6])] });
    const rows = csv.slice(1).trim().split('\r\n').slice(1).map(r => r.split(','));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row[0]).toBe('Sam');
      expect(row[2]).toBe('live');
      expect(row[3]).toBe('2026-09-12');
      expect(row[5]).toBe('Sentence Complexity');
      expect(row[17]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(rows.map(r => r[18])).toEqual(['3', '5', '6']);
    expect(rows.map(r => r[20])).toEqual(['no', 'yes', 'yes']);
    expect(rows[0][10]).toBe('consecutive');
  });

  it('still writes a goal row with empty session fields when there are no sessions', () => {
    const csv = buildIepCsv({ student: 'Sam', reportingPeriodLabel: 'P', generatedOnMs: NOW, goals: [fixtureProgress([])] });
    const rows = csv.slice(1).trim().split('\r\n').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].endsWith(',,,,')).toBe(true);
    expect(rows[0].split(',')[8]).toBe('');
  });

  it('labels mock data and leaves a missing target blank', () => {
    const csv = buildIepCsv({
      student: 'Sam',
      reportingPeriodLabel: 'P',
      generatedOnMs: NOW,
      goals: [fixtureProgress([2], { isMock: true, dataSourceLabel: 'mock', target: null, hasTarget: false })],
    });
    const row = csv.slice(1).trim().split('\r\n')[1].split(',');
    expect(row[2]).toBe('mock');
    expect(row[14]).toBe('');
    expect(row[19]).toBe('');
    expect(row[20]).toBe('');
  });

  it('quotes only when needed and doubles embedded quotes', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(' lead')).toBe('" lead"');
    expect(csvField(2.5)).toBe('2.5');
    expect(csvField(3)).toBe('3');
    expect(csvField(null)).toBe('');
  });

  it('names the file by date', () => {
    expect(csvFileName(NOW)).toBe('IEP-sessions-2026-09-12.csv');
  });
});

describe('csvField', () => {
  it('neutralises text a spreadsheet would run as a formula, but never a number', () => {
    expect(csvField('=HYPERLINK("http://x","Open")')).toBe('"\'=HYPERLINK(""http://x"",""Open"")"');
    expect(csvField('+2 words')).toBe("'+2 words");
    expect(csvField('-5 sentences')).toBe("'-5 sentences");
    expect(csvField('@mention')).toBe("'@mention");
    expect(csvField(-5)).toBe('-5');
    expect(csvField('plain title')).toBe('plain title');
  });
});
