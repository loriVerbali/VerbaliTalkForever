import {
  MeasurementResult,
  MetricCatalogue,
  MetricDefinition,
  Result,
  drawsTargetLine,
  isScored,
  presentMetric,
} from '../../../src/features/iep/core';

const measured = Result.value(4);

function present(
  metric: MetricDefinition,
  target: number | null,
  isPrimary: boolean,
  result: MeasurementResult = measured,
) {
  return presentMetric(metric, target, isPrimary, result);
}

/** The visual rules, asserted rather than assumed. */
describe('presentMetric', () => {
  describe('target lines', () => {
    it("the scored metric draws the goal's own target", () => {
      const p = present(MetricCatalogue.qualifyingSentences, 5, true);
      expect(p.style).toBe('goalProgress');
      expect(p.targetLine).toBe(5);
      expect(isScored(p)).toBe(true);
    });

    it('a second condition draws its own target', () => {
      const p = present(MetricCatalogue.differentWordsActivated, 20, false);
      expect(p.style).toBe('conditionProgress');
      expect(p.targetLine).toBe(20);
      expect(isScored(p)).toBe(true);
    });

    it('a metric with no stated target draws no line', () => {
      const p = present(MetricCatalogue.conversationInitiations, null, false);
      expect(p.style).toBe('contextualTrend');
      expect(p.targetLine).toBeNull();
      expect(isScored(p)).toBe(false);
    });

    it('the same metric renders two ways depending on its role', () => {
      const scored = present(MetricCatalogue.differentWordsActivated, 20, true);
      const context = present(MetricCatalogue.differentWordsActivated, null, false);
      expect(drawsTargetLine(scored)).toBe(true);
      expect(drawsTargetLine(context)).toBe(false);
      expect(scored.metricId).toBe(context.metricId);
    });

    it('a contextual-role metric is never scored even with a target', () => {
      const p = present(MetricCatalogue.deviceInteractions, 5, false);
      expect(isScored(p)).toBe(false);
      expect(p.targetLine).toBeNull();
    });
  });

  it('the rule always comes from the metric itself', () => {
    for (const metric of MetricCatalogue.all) {
      const p = present(metric, 3, true);
      expect(p.rule).toBe(metric.clinicalDefinition);
      expect(p.displayName).toBe(metric.displayName);
      expect(p.unit).toBe(metric.unit);
    }
  });

  describe('states that must not render as charts', () => {
    it('an unsupported metric says why instead of drawing', () => {
      const p = present(MetricCatalogue.totalSentences, 5, true, Result.unsupported('not in the metrics library'));
      expect(p.style).toBe('unsupported');
      expect(p.targetLine).toBeNull();
      expect(p.unavailableReason).toBe('not in the metrics library');
    });

    it('a contested metric cannot be the scored one', () => {
      const p = present(MetricCatalogue.conversationTurns, 3, true);
      expect(p.style).toBe('unsupported');
      expect(p.targetLine).toBeNull();
      expect(p.unavailableReason).not.toBeNull();
    });

    it('pending analysis draws neither a chart nor a failure', () => {
      const p = present(MetricCatalogue.requestCount, 3, true, Result.pending('awaiting analysis'));
      expect(p.style).toBe('pending');
      expect(p.targetLine).toBeNull();
    });

    it('no data is its own state, not a zero chart', () => {
      const p = present(MetricCatalogue.totalSentences, 5, true, Result.noData('nothing recorded'));
      expect(p.style).toBe('noData');
      expect(p.targetLine).toBeNull();
    });

    it('a target line exists exactly when the style carries one', () => {
      const cases: Array<[MetricDefinition, number | null, boolean, MeasurementResult]> = [
        [MetricCatalogue.qualifyingSentences, 5, true, measured],
        [MetricCatalogue.differentWordsActivated, 20, false, measured],
        [MetricCatalogue.conversationInitiations, null, false, measured],
        [MetricCatalogue.deviceInteractions, 5, false, measured],
        [MetricCatalogue.conversationTurns, 3, true, measured],
        [MetricCatalogue.totalSentences, 5, true, Result.noData('x')],
        [MetricCatalogue.requestCount, 3, true, Result.pending('x')],
      ];
      for (const [metric, target, isPrimary, result] of cases) {
        const p = present(metric, target, isPrimary, result);
        const expectsLine = p.style === 'goalProgress' || p.style === 'conditionProgress';
        expect(drawsTargetLine(p)).toBe(expectsLine);
      }
    });

    it('undrawable states carry a reason and drawn ones do not', () => {
      for (const result of [Result.noData('a'), Result.pending('b'), Result.unsupported('c')]) {
        expect(present(MetricCatalogue.totalSentences, 5, true, result).unavailableReason).not.toBeNull();
      }
      expect(present(MetricCatalogue.totalSentences, 5, true).unavailableReason).toBeNull();
    });
  });
});
