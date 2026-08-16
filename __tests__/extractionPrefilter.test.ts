import {isExtractionEligible} from '../src/services/personalMemory/extractionPrefilter';

describe('isExtractionEligible', () => {
  it('accepts explicit personal statements', () => {
    expect(isExtractionEligible('My sister is Danielle')).toBe(true);
    expect(isExtractionEligible('I love trains')).toBe(true);
    expect(isExtractionEligible("I don't like broccoli")).toBe(true);
    expect(isExtractionEligible('We go to Pinecrest School')).toBe(true);
  });

  it('rejects short texts', () => {
    expect(isExtractionEligible('yes')).toBe(false);
    expect(isExtractionEligible('my ball')).toBe(false);
    expect(isExtractionEligible('')).toBe(false);
  });

  it('rejects pure need-expressions', () => {
    expect(isExtractionEligible('I want juice please')).toBe(false);
    expect(isExtractionEligible('I need help now')).toBe(false);
    expect(isExtractionEligible('help me please')).toBe(false);
    expect(isExtractionEligible("I'm hungry right now")).toBe(false);
  });

  it('rejects texts without personal markers', () => {
    expect(isExtractionEligible('go up down')).toBe(false);
  });
});
