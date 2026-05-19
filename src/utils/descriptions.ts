/**
 * Description compression for Codex's 8K catalog cap.
 *
 * The Codex skill catalog (all names + descriptions + paths) is capped
 * at ~8,000 characters total. When exceeded, descriptions get truncated
 * before skills get dropped. Authors are expected to front-load triggers.
 *
 * Strategy:
 *   1. If `front_loaded` is provided, use verbatim.
 *   2. Otherwise extract a "use when X" clause if present.
 *   3. Otherwise take the first ~200 chars, ending at sentence boundary.
 */

const FRONT_LOADED_TARGET_LENGTH = 200;
const SHORT_TARGET_LENGTH = 60;

export function frontLoad(full: string, frontLoaded?: string, triggers: string[] = []): string {
  if (frontLoaded && frontLoaded.trim()) return frontLoaded.trim();

  // Try to extract a trigger-loaded clause like "Use when..."
  const useWhenMatch = full.match(/\bUse (?:when|this for|for|to)\b[^.!?]*[.!?]/i);
  if (useWhenMatch) {
    const clause = useWhenMatch[0].trim();
    const lead = full.slice(0, useWhenMatch.index).trim();
    // If the use-when clause is later in the description, hoist it.
    if (useWhenMatch.index! > 0 && lead.length > 20) {
      const combined = `${clause} ${lead}`;
      return truncateAtSentence(combined, FRONT_LOADED_TARGET_LENGTH);
    }
    return truncateAtSentence(full, FRONT_LOADED_TARGET_LENGTH);
  }

  // Surface triggers explicitly if none of the heuristics fired.
  if (triggers.length > 0 && full.length > FRONT_LOADED_TARGET_LENGTH) {
    const triggerLead = `Use when working with ${triggers.slice(0, 3).join(', ')}. `;
    return truncateAtSentence(triggerLead + full, FRONT_LOADED_TARGET_LENGTH);
  }

  return truncateAtSentence(full, FRONT_LOADED_TARGET_LENGTH);
}

export function shortLabel(full: string, short?: string): string {
  if (short && short.trim()) {
    const trimmed = short.trim();
    if (trimmed.length >= 25 && trimmed.length <= 64) return trimmed;
    return clipAtWord(trimmed, 64);
  }
  // Take the first sentence, capped at SHORT_TARGET_LENGTH at a word boundary.
  const firstSentence = full.match(/^[^.!?]+[.!?]/)?.[0] ?? full;
  const stripped = firstSentence.replace(/[.!?]\s*$/, '').trim();
  return clipAtWord(stripped, SHORT_TARGET_LENGTH);
}

function clipAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > max * 0.5) return slice.slice(0, lastSpace).replace(/[,;:\s—–-]+$/, '').trim();
  return slice.trim();
}

function truncateAtSentence(s: string, max: number): string {
  if (s.length <= max) return s.trim();
  const slice = s.slice(0, max);
  const lastSentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (lastSentenceEnd > max * 0.5) {
    return slice.slice(0, lastSentenceEnd + 1).trim();
  }
  // No good sentence boundary; cut at last space and trim trailing punctuation.
  const lastSpace = slice.lastIndexOf(' ');
  const cleanCut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return cleanCut.replace(/[,;:\s—–-]+$/, '').trim() + '…';
}
