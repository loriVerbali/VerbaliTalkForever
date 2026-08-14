// Deterministic on-device prefilter (PRD §7.4): only plausible fact-bearing
// communications are queued for AI extraction. Pure module — no RN imports.

const MARKER_PATTERN =
  /\b(my|i|mine|we|our|is|are|like|likes|love|loves|hate|hates|favorite|favourite)\b|don'?t like|go to|goes to|live[sd]? (in|at|with)/i;

// Pure need-expressions and single-intent utterances: never extraction-worthy.
const STOPLIST_PATTERNS = [
  /^i want\b/i,
  /^i need\b/i,
  /^(yes|no|ok|okay)\b[.!?]?$/i,
  /^help\b/i,
  /^more\b/i,
  /^stop\b/i,
  /^please\b/i,
  /^thank you\b/i,
  /^all done\b/i,
  /^i'?m (hungry|thirsty|tired|done|finished|full)\b/i,
];

export function isExtractionEligible(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) {
    return false;
  }
  if (STOPLIST_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return false;
  }
  return MARKER_PATTERN.test(trimmed);
}
