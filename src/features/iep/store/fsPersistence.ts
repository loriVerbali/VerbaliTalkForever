/**
 * On-device persistence for IEP records using react-native-fs.
 *
 * Layout under `<DocumentDirectoryPath>/iep/`:
 *   goals.json                 all goals and approved plans
 *   sessions/<sessionId>.json  one archive per recorded session
 *
 * Writes go to a temporary file first and are then moved into place, so a crash never
 * leaves a half-written record under the real name. A file that cannot be parsed is
 * copied to `<name>.unreadable-<stamp>` and reported; it is never replaced.
 */

import RNFS from 'react-native-fs';
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

export const IEP_DIRECTORY_NAME = 'iep';

function stamp(): string {
  return new Date().toISOString().replace(/:/g, '-');
}

export class FsPersistence implements IepPersistence {
  private readonly root: string;
  private readonly goalsPath: string;
  private readonly sessionsDir: string;

  constructor(baseDirectory: string = RNFS.DocumentDirectoryPath) {
    this.root = `${baseDirectory}/${IEP_DIRECTORY_NAME}`;
    this.goalsPath = `${this.root}/goals.json`;
    this.sessionsDir = `${this.root}/sessions`;
  }

  get directory(): string {
    return this.root;
  }

  private async ensureDirectories(): Promise<void> {
    if (!(await RNFS.exists(this.root))) {
      await RNFS.mkdir(this.root);
    }
    if (!(await RNFS.exists(this.sessionsDir))) {
      await RNFS.mkdir(this.sessionsDir);
    }
  }

  private async writeAtomically(path: string, text: string): Promise<void> {
    const temp = `${path}.tmp`;
    await RNFS.writeFile(temp, text, 'utf8');
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
    await RNFS.moveFile(temp, path);
  }

  /** Reads a file, recovering a completed temp file if the final move never happened. */
  private async readWithRecovery(path: string): Promise<string | null> {
    if (await RNFS.exists(path)) {
      return RNFS.readFile(path, 'utf8');
    }
    const temp = `${path}.tmp`;
    if (await RNFS.exists(temp)) {
      const text = await RNFS.readFile(temp, 'utf8');
      try {
        JSON.parse(text);
        await RNFS.moveFile(temp, path);
        return text;
      } catch {
        return null;
      }
    }
    return null;
  }

  private async quarantine(path: string, name: string, error: unknown): Promise<LoadFailure> {
    const copy = `${path}.unreadable-${stamp()}`;
    let quarantinedCopy: string | null = null;
    try {
      await RNFS.copyFile(path, copy);
      quarantinedCopy = copy;
    } catch {
      quarantinedCopy = null;
    }
    return { name, message: String(error), quarantinedCopy };
  }

  async loadGoals(): Promise<LoadResult<IepGoal[]>> {
    await this.ensureDirectories();
    const text = await this.readWithRecovery(this.goalsPath);
    if (text === null) {
      return { kind: 'missing' };
    }
    try {
      return { kind: 'ok', value: parseGoalsJson(text) };
    } catch (error) {
      return { kind: 'unreadable', failure: await this.quarantine(this.goalsPath, 'goals', error) };
    }
  }

  async saveGoals(goals: readonly IepGoal[]): Promise<void> {
    await this.ensureDirectories();
    await this.writeAtomically(this.goalsPath, stableStringify(goals));
  }

  async loadSessions(): Promise<{ archives: SessionArchive[]; failures: LoadFailure[] }> {
    await this.ensureDirectories();
    const entries = await RNFS.readDir(this.sessionsDir);
    const names = new Set(entries.filter(e => e.isFile()).map(e => e.name));
    // A crash between removing the old file and moving the new one into place leaves
    // only `<id>.json.tmp`; the same recovery goals.json gets applies to each session.
    const paths = new Set<string>();
    for (const name of names) {
      if (name.endsWith('.json')) {
        paths.add(`${this.sessionsDir}/${name}`);
      } else if (name.endsWith('.json.tmp') && !names.has(name.slice(0, -'.tmp'.length))) {
        paths.add(`${this.sessionsDir}/${name.slice(0, -'.tmp'.length)}`);
      }
    }
    const results = await Promise.all(
      [...paths].map(async (path): Promise<{ archive?: SessionArchive; failure?: LoadFailure }> => {
        const name = path.slice(this.sessionsDir.length + 1);
        let text: string | null;
        try {
          text = await this.readWithRecovery(path);
        } catch (error) {
          return { failure: { name: `session ${name}`, message: String(error), quarantinedCopy: null } };
        }
        if (text === null) {
          return { failure: { name: `session ${name}`, message: 'temporary file could not be recovered', quarantinedCopy: null } };
        }
        try {
          return { archive: parseSessionJson(text) };
        } catch (error) {
          return { failure: await this.quarantine(path, `session ${name}`, error) };
        }
      }),
    );
    const archives = results.flatMap(r => (r.archive ? [r.archive] : []));
    const failures = results.flatMap(r => (r.failure ? [r.failure] : []));
    return { archives, failures };
  }

  async saveSession(archive: SessionArchive): Promise<void> {
    await this.ensureDirectories();
    const safeId = archive.session.id.replace(/[^A-Za-z0-9_-]/g, '_');
    await this.writeAtomically(`${this.sessionsDir}/${safeId}.json`, stableStringify(archive));
  }
}
