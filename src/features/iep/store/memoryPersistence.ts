/**
 * In-memory persistence that round-trips through JSON text, so tests exercise the same
 * serialisation the on-device adapter uses and can corrupt a stored file on purpose.
 */

import { IepGoal } from '../model/types';
import {
  IepPersistence,
  LoadFailure,
  LoadResult,
  SessionArchive,
  parseGoalsJson,
  parseSessionJson,
  stableStringify,
} from './persistence';

export class MemoryPersistence implements IepPersistence {
  private goalsText: string | null = null;
  private sessionTexts = new Map<string, string>();
  readonly quarantined: string[] = [];
  saveCount = 0;

  async loadGoals(): Promise<LoadResult<IepGoal[]>> {
    if (this.goalsText === null) {
      return { kind: 'missing' };
    }
    try {
      return { kind: 'ok', value: parseGoalsJson(this.goalsText) };
    } catch (error) {
      const copy = `goals.unreadable-${this.quarantined.length + 1}`;
      this.quarantined.push(copy);
      return {
        kind: 'unreadable',
        failure: { name: 'goals', message: String(error), quarantinedCopy: copy },
      };
    }
  }

  async saveGoals(goals: readonly IepGoal[]): Promise<void> {
    this.saveCount += 1;
    this.goalsText = stableStringify(goals);
  }

  async loadSessions(): Promise<{ archives: SessionArchive[]; failures: LoadFailure[] }> {
    const archives: SessionArchive[] = [];
    const failures: LoadFailure[] = [];
    for (const [id, text] of this.sessionTexts) {
      try {
        archives.push(parseSessionJson(text));
      } catch (error) {
        const copy = `${id}.unreadable-${this.quarantined.length + 1}`;
        this.quarantined.push(copy);
        failures.push({ name: `session ${id}`, message: String(error), quarantinedCopy: copy });
      }
    }
    return { archives, failures };
  }

  async saveSession(archive: SessionArchive): Promise<void> {
    this.saveCount += 1;
    this.sessionTexts.set(archive.session.id, stableStringify(archive));
  }

  // Test helpers

  rawGoals(): string | null {
    return this.goalsText;
  }

  rawSession(id: string): string | null {
    return this.sessionTexts.get(id) ?? null;
  }

  sessionIds(): string[] {
    return [...this.sessionTexts.keys()];
  }

  /** Truncates the stored goals text mid-write. */
  corruptGoals(): void {
    if (this.goalsText) {
      this.goalsText = this.goalsText.slice(0, Math.floor(this.goalsText.length / 2));
    }
  }

  corruptSession(id: string): void {
    const text = this.sessionTexts.get(id);
    if (text) {
      this.sessionTexts.set(id, text.slice(0, Math.floor(text.length / 2)));
    }
  }
}
