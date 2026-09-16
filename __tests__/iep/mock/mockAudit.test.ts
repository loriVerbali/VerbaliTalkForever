/**
 * Guards the mock-data audit port (scripts/lib/iepMockAudit.js) against the reference
 * results documented in docs/iep-dashboard-agent-package/README_FOR_AGENT.md:
 *
 *   - standard data reaches 21 of 32 dashboard states
 *   - edge data reaches 32 of 32
 *   - every derivable standard metric reconciles with the event stream
 *   - a reconciliation dry run proposes zero edits
 *
 * Plain Node code under test; nothing from react-native is imported.
 */
const audit = require('../../../scripts/lib/iepMockAudit');
const csv = require('../../../scripts/lib/csv');

describe('IEP mock-data audit port', () => {
  const standard = audit.loadDataset(audit.DEFAULT_DATA_DIR, 'standard');
  const edge = audit.loadDataset(audit.DEFAULT_DATA_DIR, 'edge');

  it('standard data reaches 21 of 32 states in a 12-week window', () => {
    const result = audit.evaluateDataset(standard, { weeks: 12 });
    expect(result.total).toBe(32);
    expect(result.reached).toBe(21);
    expect(result.missing).toEqual([
      'card: Needs attention',
      'card: Not enough data',
      'card: No tracked sessions',
      'trend: declining',
      'trend: not enough data',
      'chart: single session',
      'chart: empty state',
      'gap: missing metric value',
      'gap: missing duration',
      'gap: missing context',
      'gap: irregular spacing',
    ]);
  });

  it('edge data reaches 32 of 32 states in a 12-week window', () => {
    const result = audit.evaluateDataset(edge, { weeks: 12 });
    expect(result.total).toBe(32);
    expect(result.reached).toBe(32);
    expect(result.missing).toEqual([]);
  });

  it('every derivable standard metric reconciles with the event stream', () => {
    const result = audit.checkConsistency(standard);
    expect(result.checked.map((c: { gid: string }) => c.gid)).toEqual(
      Object.keys(audit.DERIVABLE).sort(),
    );
    for (const entry of result.checked) {
      expect({ gid: entry.gid, differences: entry.mismatches.length }).toEqual({
        gid: entry.gid,
        differences: 0,
      });
    }
    expect(result.failures).toBe(0);
  });

  it('a reconciliation dry run proposes zero edits', () => {
    const result = audit.reconcile(standard);
    expect(result.added).toBe(0);
    expect(result.dropped).toBe(0);
    expect(result.report.size).toBe(0);
    expect(result.events).toHaveLength(standard.events.length);
  });
});

describe('Python compatibility helpers', () => {
  it('rounds ties to even like Python round()', () => {
    expect([0.5, 1.5, 2.5, 12.5, 62.5, 65.625].map(audit.pyRound)).toEqual([0, 2, 2, 12, 62, 66]);
  });

  it('reproduces random.seed(4471) sequences', () => {
    const rng = new audit.PyRandom(4471);
    expect([rng.getrandbits(32), rng.getrandbits(32)]).toEqual([3934339655, 1729638777]);
  });
});

describe('RFC 4180 CSV parser', () => {
  it('handles quoted fields, doubled quotes, CRLF and LF', () => {
    const text = 'a,b,c\r\n1,"x, y","say ""hi"""\n2,,"multi\r\nline"\r\n';
    const parsed = csv.parseCsv(text);
    expect(parsed.headers).toEqual(['a', 'b', 'c']);
    expect(parsed.rows).toEqual([
      { a: '1', b: 'x, y', c: 'say "hi"' },
      { a: '2', b: '', c: 'multi\r\nline' },
    ]);
  });

  it('round-trips through the writer with minimal quoting', () => {
    const rows = [{ a: '1', b: 'x, y', c: 'say "hi"' }];
    const text = csv.stringifyCsv(['a', 'b', 'c'], rows);
    expect(text).toBe('a,b,c\r\n1,"x, y","say ""hi"""\r\n');
    expect(csv.parseCsv(text).rows).toEqual(rows);
  });
});
