/** How the session type and partner recorded at session start read on the Evidence sidebar. */

import { sessionContextLabel } from '../../../src/features/iep/application/evidence';

describe('sessionContextLabel', () => {
  it('turns stored and mock-dataset values into readable labels', () => {
    expect(sessionContextLabel('therapy')).toBe('Therapy');
    expect(sessionContextLabel('peer interaction')).toBe('Peer interaction');
    expect(sessionContextLabel('structured_activity')).toBe('Structured activity');
    expect(sessionContextLabel('speech_therapist')).toBe('Speech therapist');
  });

  it('keeps the SLP acronym', () => {
    expect(sessionContextLabel('slp')).toBe('SLP');
    expect(sessionContextLabel('SLP')).toBe('SLP');
  });

  it('is null when nothing was recorded', () => {
    expect(sessionContextLabel('')).toBeNull();
    expect(sessionContextLabel('  ')).toBeNull();
    expect(sessionContextLabel('unknown')).toBeNull();
    expect(sessionContextLabel('unspecified')).toBeNull();
    expect(sessionContextLabel(null)).toBeNull();
    expect(sessionContextLabel(undefined)).toBeNull();
  });
});
