import * as fs from 'fs';
import * as path from 'path';
import { buildReportGoal, buildReportModel } from '../../../src/features/iep/export/pdfReportModel';
import { niceCeiling, pdfFileName, renderIepReport, toWinAnsi } from '../../../src/features/iep/export/pdfRenderer';
import { NOW, fixtureProgress } from './helpers';

describe('PDF report model', () => {
  it('captions every percentage and singularises units at one', () => {
    const goal = buildReportGoal(fixtureProgress([5, 5, 5]));
    expect(goal.attainment).toBe('100%');
    expect(goal.attainmentCaption).toBe('3 of 3 consecutive sessions at target');
    expect(goal.levels[0].rows[0].target).toBe('Target: 3 sessions');
    const single = buildReportGoal(fixtureProgress([1], { target: 1 }));
    expect(single.levels[1].rows[0].target).toBe('Target: 1 sentence');
  });

  it('says tracking only for a goal without a target and never invents one', () => {
    const goal = buildReportGoal(fixtureProgress([2, 3], { target: null, hasTarget: false, status: 'trackingOnly' }));
    expect(goal.attainment).toBe('Tracking only');
    expect(goal.levels[1].rows[0].target).toBe('No target');
    expect(goal.sessions[0].target).toBe('Tracking only');
    expect(goal.sessions[0].met).toBe('–');
    expect(goal.chart?.target).toBeNull();
  });

  it('reports no tracked sessions rather than zero and draws no chart below two sessions', () => {
    const none = buildReportGoal(fixtureProgress([]));
    expect(none.attainment).toBe('No tracked sessions');
    expect(none.trendSentence).toBe('No tracked sessions in this reporting period.');
    expect(none.chart).toBeNull();
    const one = buildReportGoal(fixtureProgress([4]));
    expect(one.chart).toBeNull();
    expect(buildReportGoal(fixtureProgress([4, 6])).chart?.points).toHaveLength(2);
  });

  it('says Yes or No in the table beside the coloured points', () => {
    const goal = buildReportGoal(fixtureProgress([3, 6]));
    expect(goal.sessions.map(s => s.met)).toEqual(['No', 'Yes']);
    expect(goal.chart?.points.map(p => p.met)).toEqual([false, true]);
  });

  it('adds a bold synthetic banner only for mock data', () => {
    expect(buildReportModel({ student: 'Sam', reportingPeriod: 'P', generatedOnMs: NOW, goals: [fixtureProgress([1])] }).syntheticNote).toBeNull();
    expect(
      buildReportModel({ student: 'Sam', reportingPeriod: 'P', generatedOnMs: NOW, goals: [fixtureProgress([1], { isMock: true, dataSourceLabel: 'mock' })] }).syntheticNote,
    ).toContain('synthetic');
  });

  it('rounds axis ceilings to human numbers', () => {
    expect(niceCeiling(9.6)).toBe(10);
    expect(niceCeiling(4.8)).toBe(5);
    expect(niceCeiling(2.2)).toBe(2.5);
    expect(niceCeiling(17)).toBe(20);
    expect(niceCeiling(0)).toBe(1);
    expect(pdfFileName(NOW)).toBe('IEP-progress-report-2026-09-12.pdf');
  });
});

describe('PDF renderer', () => {
  const outDir = process.env.IEP_PDF_OUT ?? path.join(__dirname, '..', '..', '..', 'docs', 'iep-samples');

  async function render(name: string, goals: ReturnType<typeof fixtureProgress>[], mock = false) {
    const model = buildReportModel({ student: 'Sam', reportingPeriod: 'Jun 21 – Sep 12, 2026', generatedOnMs: NOW, goals });
    if (mock) {
      model.syntheticNote = 'Data source: synthetic mock data for demonstration. Not a clinical record.';
    }
    const bytes = await renderIepReport(model);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, name), bytes);
    return bytes;
  }

  it('renders one goal, many goals, no sessions, no target, and an AI-dependent goal', async () => {
    const one = await render('sample-one-goal.pdf', [fixtureProgress([2, 3, 5, 5, 6, 4, 5, 5])]);
    expect(one.length).toBeGreaterThan(1000);
    expect(Buffer.from(one.slice(0, 5)).toString()).toBe('%PDF-');

    const many = await render(
      'sample-many-goals.pdf',
      Array.from({ length: 15 }, (_, i) => fixtureProgress([1, 2, 3, 4, 5, 6, 5, 4].map(v => v + (i % 3)), { displayNumber: i + 1, title: `Goal ${i + 1}` })),
    );
    expect(many.length).toBeGreaterThan(one.length);

    await render('sample-no-sessions.pdf', [fixtureProgress([])]);
    await render('sample-no-target.pdf', [fixtureProgress([2, 3, 4], { target: null, hasTarget: false, status: 'trackingOnly' })]);
    await render('sample-ai-dependent.pdf', [fixtureProgress([2, 3, 4, 5], { dependsOnAi: true })]);
    await render('sample-mock.pdf', [fixtureProgress([2, 3, 4, 5], { isMock: true, dataSourceLabel: 'mock' })], true);
  });
});

describe('PDF text encoding', () => {
  it('renders names and statements the standard font cannot encode instead of throwing', async () => {
    expect(toWinAnsi('Zoë ≥ 3 → done 🦄')).toBe('Zoë >= 3 -> done ?');
    expect(toWinAnsi('Łukasz')).toBe('Lukasz');
    const model = buildReportModel({ student: 'Zoë 🦄', reportingPeriod: 'Jun 21 – Sep 12, 2026', generatedOnMs: NOW, goals: [fixtureProgress([3, 5, 6], { title: 'שלום ≥ 3 words' })] });
    await expect(renderIepReport(model)).resolves.toBeInstanceOf(Uint8Array);
  });
});
