import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { pick, types } from 'react-native-document-picker';
import DefaultPreference from 'react-native-default-preference';
import { Platform } from 'react-native';
// @ts-ignore
import { closeDatabase, initDatabase } from '../utils/database';
// @ts-ignore
import { sentenceBuilderSqlite } from '../utils/sentenceBuilderSqlite';

const IMPORT_FOLDER_NAME = 'matalk-profile-import';

// Keys that must NEVER be overwritten during import
const PROTECTED_KEYS = [
    'isIOSActive',
    'isInTrial',
    'trialInstallationDate',
    'sessionToken',
    'lastRefreshCheck',
    'installationGuid',
];

interface ImportMetadata {
    appName: string;
    backupType: string;
    schemaVersion: number;
    appVersion: string;
    exportedAt?: string;
    devicePlatform?: string;
}

export const ProfileImportService = {
    /**
     * Main import function — orchestrates the entire restore flow.
     * Throws on failure with a user-friendly message.
     */
    async importProfile(): Promise<void> {
        const stagingPath = `${RNFS.DocumentDirectoryPath}/${IMPORT_FOLDER_NAME}`;
        let zipCopyPath = '';

        try {
            console.log('[Import] Starting profile import...');

            // 1. Cleanup any previous import staging
            await this._cleanup(stagingPath);

            // 2. Pick the backup ZIP file
            zipCopyPath = await this._pickBackupFile(stagingPath);
            console.log('[Import] ZIP copied to staging:', zipCopyPath);

            // 3. Unzip into staging
            const unzipPath = `${stagingPath}/unzipped`;
            await RNFS.mkdir(unzipPath);
            await unzip(zipCopyPath, unzipPath);
            console.log('[Import] Unzipped to:', unzipPath);

            // 4. Find the actual backup root (may be nested inside a folder)
            const backupRoot = await this._findBackupRoot(unzipPath);
            console.log('[Import] Backup root:', backupRoot);

            // 5. Validate backup structure and metadata
            await this._validateBackup(backupRoot);
            console.log('[Import] Validation passed');

            // 6. Freeze writes — close both databases
            await this._freezeWrites();
            console.log('[Import] Databases closed');

            // 7. Clear current profile data (preserving subscription keys)
            await this._clearCurrentData();
            console.log('[Import] Current data cleared');

            // 8. Restore backup data
            await this._restoreBackupData(backupRoot);
            console.log('[Import] Backup data restored');

            // 9. Reopen databases to verify integrity
            await this._reopenDatabases();
            console.log('[Import] Databases reopened and verified');

            // 10. Rewrite device-specific local paths to match this device
            await this._rewriteLocalPaths();
            console.log('[Import] Local paths rewritten');

            // 11. Cleanup staging
            await this._cleanup(stagingPath);
            console.log('[Import] Staging cleaned up — import complete!');
        } catch (error: any) {
            console.error('[Import] Failed:', error);

            // Attempt to reopen databases so the app isn't left broken
            try {
                await this._reopenDatabases();
            } catch (reopenError) {
                console.error('[Import] Failed to reopen DBs after error:', reopenError);
            }

            // Cleanup staging folder
            await this._cleanup(stagingPath);

            // Re-throw with a user-friendly message
            if (error.message?.includes('cancel')) {
                throw new Error('CANCELLED');
            }
            throw error;
        }
    },

    // ───────────────────── Private helpers ─────────────────────

    async _cleanup(path: string) {
        if (await RNFS.exists(path)) {
            await RNFS.unlink(path);
        }
    },

    /**
     * Let user pick a .zip file from Files / Google Drive / etc.
     * Copies it into the staging directory and returns the copy path.
     */
    async _pickBackupFile(stagingPath: string): Promise<string> {
        const result = await pick({
            type: [types.zip],
            copyTo: 'cachesDirectory',
        });

        const picked = result[0];
        if (!picked) {
            throw new Error('No file selected — cancel');
        }

        // Use the cached copy (copyTo gives us a local path)
        const sourceUri = picked.fileCopyUri || picked.uri;
        if (!sourceUri) {
            throw new Error('Failed to access the selected file.');
        }

        // Normalise the URI — remove file:// prefix if present
        const sourcePath = sourceUri.replace('file://', '');

        await RNFS.mkdir(stagingPath);
        const destPath = `${stagingPath}/import.zip`;
        await RNFS.copyFile(sourcePath, destPath);

        return destPath;
    },

    /**
     * The ZIP may contain the backup at the root or inside a single subfolder
     * (e.g. verbali-profile-backup/). This resolves the true root.
     */
    async _findBackupRoot(unzipPath: string): Promise<string> {
        // Check if metadata.json exists directly
        if (await RNFS.exists(`${unzipPath}/metadata.json`)) {
            return unzipPath;
        }

        // Otherwise check one level of subdirectories
        const items = await RNFS.readDir(unzipPath);
        for (const item of items) {
            if (item.isDirectory()) {
                if (await RNFS.exists(`${item.path}/metadata.json`)) {
                    return item.path;
                }
            }
        }

        throw new Error('Invalid or incompatible backup file.');
    },

    /**
     * Validate the unzipped backup structure:
     * - metadata.json, storage.json, db/, images/ must exist
     * - metadata fields must match expected values
     */
    async _validateBackup(backupRoot: string) {
        // Check required files/dirs
        const requiredPaths = [
            `${backupRoot}/metadata.json`,
            `${backupRoot}/storage.json`,
            `${backupRoot}/db`,
            `${backupRoot}/images`,
        ];

        for (const reqPath of requiredPaths) {
            if (!(await RNFS.exists(reqPath))) {
                throw new Error('Invalid or incompatible backup file.');
            }
        }

        // Read and validate metadata
        const metadataRaw = await RNFS.readFile(
            `${backupRoot}/metadata.json`,
            'utf8',
        );
        let metadata: ImportMetadata;
        try {
            metadata = JSON.parse(metadataRaw);
        } catch {
            throw new Error('Invalid or incompatible backup file.');
        }

        if (metadata.appName !== 'Matalk') {
            throw new Error('Invalid or incompatible backup file.');
        }
        if (metadata.backupType !== 'profile') {
            throw new Error('Invalid or incompatible backup file.');
        }
        if (metadata.schemaVersion !== 1) {
            throw new Error('Invalid or incompatible backup file.');
        }
        if (!metadata.appVersion) {
            throw new Error('Invalid or incompatible backup file.');
        }
    },

    /**
     * Close both databases to freeze all writes.
     */
    async _freezeWrites() {
        try {
            await closeDatabase();
        } catch (e) {
            console.warn('[Import] Error closing metrics DB:', e);
        }

        try {
            await sentenceBuilderSqlite.close();
        } catch (e) {
            console.warn('[Import] Error closing sentence builder DB:', e);
        }
    },

    /**
     * Clear current profile data while preserving subscription keys.
     */
    async _clearCurrentData() {
        // 1. Save protected preference values
        const savedProtected: Record<string, string | null> = {};
        for (const key of PROTECTED_KEYS) {
            try {
                savedProtected[key] = (await DefaultPreference.get(key)) ?? null;
            } catch {
                savedProtected[key] = null;
            }
        }

        // 2. Clear all preferences
        try {
            await DefaultPreference.clearAll();
        } catch (e) {
            console.warn('[Import] Error clearing DefaultPreference:', e);
        }

        // 3. Restore protected keys
        for (const key of PROTECTED_KEYS) {
            if (savedProtected[key] != null) {
                await DefaultPreference.set(key, savedProtected[key]!);
            }
        }

        // 4. Delete current DB files — search all possible locations
        const dbNames = ['matalk_metrics.db', 'sentence_builder.db'];
        const possibleDirs = this._getDbSearchDirs();

        for (const dbName of dbNames) {
            for (const dir of possibleDirs) {
                const dbPath = `${dir}/${dbName}`;
                if (await RNFS.exists(dbPath)) {
                    await RNFS.unlink(dbPath);
                    console.log(`[Import] Deleted DB: ${dbPath}`);
                }
            }
        }

        // 5. Delete current image directories
        const imageDirs = [
            `${RNFS.DocumentDirectoryPath}/sentenceBuilder`,
            `${RNFS.DocumentDirectoryPath}/my8words`,
        ];

        for (const dir of imageDirs) {
            if (await RNFS.exists(dir)) {
                await RNFS.unlink(dir);
                console.log(`[Import] Deleted image dir: ${dir}`);
            }
        }
    },

    /**
     * Get all possible directories where react-native-sqlite-storage might store DBs.
     */
    _getDbSearchDirs(): string[] {
        return Platform.OS === 'ios'
            ? [
                `${RNFS.LibraryDirectoryPath}/LocalDatabase`,
                RNFS.LibraryDirectoryPath,
                RNFS.DocumentDirectoryPath,
                `${RNFS.LibraryDirectoryPath}/NoCloud`,
            ]
            : [
                `${RNFS.DocumentDirectoryPath}/../databases`,
                RNFS.DocumentDirectoryPath,
            ];
    },

    /**
     * Find where a DB file actually lives on this device.
     */
    async _findDbPath(dbName: string): Promise<string | null> {
        for (const dir of this._getDbSearchDirs()) {
            const fullPath = `${dir}/${dbName}`;
            if (await RNFS.exists(fullPath)) {
                return dir;
            }
        }
        return null;
    },

    /**
     * Restore data from the validated backup:
     * - Copy DB files
     * - Copy image directories
     * - Restore preferences from storage.json (excluding protected keys)
     */
    async _restoreBackupData(backupRoot: string) {
        // 1. Restore DB files
        // First, figure out where DBs should go by creating a temp DB and finding it
        // Use the first possible directory as default, but log alternatives
        const possibleDirs = this._getDbSearchDirs();
        const defaultDbDir = possibleDirs[0]; // Library/LocalDatabase on iOS

        // Log what's in the backup db/ folder
        const backupDbDir = `${backupRoot}/db`;
        if (await RNFS.exists(backupDbDir)) {
            const backupDbFiles = await RNFS.readDir(backupDbDir);
            console.log(`[Import] Backup db/ contains: ${backupDbFiles.map(f => `${f.name} (${f.size} bytes)`).join(', ')}`);

            for (const file of backupDbFiles) {
                if (file.isFile()) {
                    // Try to find where this DB was previously located
                    // If not found, use the default directory
                    let targetDir = defaultDbDir;

                    // Log the target
                    console.log(`[Import] Restoring ${file.name} to: ${targetDir}/${file.name}`);

                    // Ensure target directory exists
                    if (!(await RNFS.exists(targetDir))) {
                        await RNFS.mkdir(targetDir);
                    }

                    const destPath = `${targetDir}/${file.name}`;
                    await RNFS.copyFile(file.path, destPath);

                    // Verify the copy
                    if (await RNFS.exists(destPath)) {
                        const stat = await RNFS.stat(destPath);
                        console.log(`[Import] ✅ Restored ${file.name} (${stat.size} bytes) to: ${destPath}`);
                    } else {
                        console.error(`[Import] ❌ Failed to restore ${file.name}!`);
                    }
                }
            }
        } else {
            console.warn('[Import] No db/ directory in backup!');
        }

        // 2. Restore image directories
        const backupImagesDir = `${backupRoot}/images`;
        if (await RNFS.exists(backupImagesDir)) {
            const imageFolders = await RNFS.readDir(backupImagesDir);
            for (const folder of imageFolders) {
                const destPath = `${RNFS.DocumentDirectoryPath}/${folder.name}`;
                if (folder.isDirectory()) {
                    await this._copyDirectoryRecursive(folder.path, destPath);
                    console.log(`[Import] Restored image dir: ${folder.name}`);
                } else if (folder.isFile()) {
                    // Single file in images root
                    await RNFS.copyFile(folder.path, destPath);
                    console.log(`[Import] Restored image file: ${folder.name}`);
                }
            }
        }

        // 3. Restore preferences from storage.json
        const storageRaw = await RNFS.readFile(
            `${backupRoot}/storage.json`,
            'utf8',
        );
        const storageData: Record<string, string> = JSON.parse(storageRaw);

        for (const [key, value] of Object.entries(storageData)) {
            // Skip protected keys
            if (PROTECTED_KEYS.includes(key)) {
                console.log(`[Import] Skipping protected key: ${key}`);
                continue;
            }

            try {
                await DefaultPreference.set(key, value);
            } catch (e) {
                console.warn(`[Import] Failed to set preference ${key}:`, e);
            }
        }
        console.log('[Import] Preferences restored');
    },

    /**
     * Recursively copy a directory and all its contents.
     */
    async _copyDirectoryRecursive(srcDir: string, destDir: string) {
        await RNFS.mkdir(destDir);
        const items = await RNFS.readDir(srcDir);

        for (const item of items) {
            const destPath = `${destDir}/${item.name}`;
            if (item.isDirectory()) {
                await this._copyDirectoryRecursive(item.path, destPath);
            } else {
                await RNFS.copyFile(item.path, destPath);
            }
        }
    },

    /**
     * Reopen databases after restore to validate integrity.
     */
    async _reopenDatabases() {
        // Reopen metrics DB
        try {
            await initDatabase();
            console.log('[Import] ✅ Metrics DB reopened');
        } catch (e) {
            console.error('[Import] ❌ Failed to reopen metrics DB:', e);
            throw new Error('Failed to initialize the metrics database after import.');
        }

        // Reopen sentence builder DB with retry
        try {
            await sentenceBuilderSqlite.init();
            console.log('[Import] ✅ Sentence Builder DB reopened');
        } catch (e) {
            console.error('[Import] ❌ Failed to reopen sentence builder DB (attempt 1):', e);
            // Wait and retry once — the file system may need a moment
            await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
            try {
                await sentenceBuilderSqlite.init();
                console.log('[Import] ✅ Sentence Builder DB reopened (retry)');
            } catch (retryError) {
                console.error('[Import] ❌ Failed to reopen sentence builder DB (attempt 2):', retryError);
                throw new Error('Failed to initialize the sentence builder database after import.');
            }
        }
    },

    /**
     * Rewrite device-specific absolute paths in preferences and DB
     * so images load correctly on the current device.
     *
     * Both my8words cards and sentence_builder nodes store full absolute paths
     * like /Users/.../Documents/my8words/filename.jpg — these need to be updated
     * to use the current device's DocumentDirectoryPath.
     */
    async _rewriteLocalPaths() {
        const currentDocsPath = RNFS.DocumentDirectoryPath;

        // 1. Rewrite my8words preference
        try {
            const my8wordsRaw = await DefaultPreference.get('my8words');
            if (my8wordsRaw) {
                const my8wordsData = JSON.parse(my8wordsRaw);
                if (my8wordsData.cards && Array.isArray(my8wordsData.cards)) {
                    let changed = false;
                    for (const card of my8wordsData.cards) {
                        if (card.localImagePath && typeof card.localImagePath === 'string') {
                            // Extract just the filename from the absolute path
                            const filename = card.localImagePath.split('/').pop();
                            if (filename) {
                                const newPath = `${currentDocsPath}/my8words/${filename}`;
                                if (card.localImagePath !== newPath) {
                                    console.log(`[Import] Rewriting my8words path: ${card.localImagePath} → ${newPath}`);
                                    card.localImagePath = newPath;
                                    changed = true;
                                }
                            }
                        }
                    }
                    if (changed) {
                        await DefaultPreference.set('my8words', JSON.stringify(my8wordsData));
                        console.log('[Import] my8words paths rewritten');
                    }
                }
            }
        } catch (e) {
            console.warn('[Import] Error rewriting my8words paths:', e);
        }

        // 2. Rewrite pepes preference — imageUri filenames → full device paths
        try {
            const pepesRaw = await DefaultPreference.get('pepes');
            if (pepesRaw) {
                const pepesData = JSON.parse(pepesRaw);
                const categories = ['People', 'Toys', 'Pets', 'TVShows', 'Food', 'Drinks', 'Places'];
                let changed = false;

                for (const category of categories) {
                    if (Array.isArray(pepesData[category])) {
                        for (const item of pepesData[category]) {
                            if (item.imageUri && typeof item.imageUri === 'string') {
                                // If imageUri is just a filename (from portable backup), build full path
                                if (!item.imageUri.includes('/')) {
                                    const newPath = `file://${currentDocsPath}/pepes/${item.imageUri}`;
                                    console.log(`[Import] Rewriting pepes imageUri: ${item.name} → ${newPath}`);
                                    item.imageUri = newPath;
                                    changed = true;
                                } else {
                                    // Legacy full path — extract filename and rewrite
                                    const filename = item.imageUri.replace('file://', '').split('/').pop();
                                    if (filename) {
                                        const newPath = `file://${currentDocsPath}/pepes/${filename}`;
                                        if (item.imageUri !== newPath) {
                                            console.log(`[Import] Rewriting pepes imageUri: ${item.name} → ${newPath}`);
                                            item.imageUri = newPath;
                                            changed = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (changed) {
                    await DefaultPreference.set('pepes', JSON.stringify(pepesData));
                    console.log('[Import] pepes paths rewritten');
                }
            }
        } catch (e) {
            console.warn('[Import] Error rewriting pepes paths:', e);
        }

        // 3. Rewrite sentence_builder.db imageUri column
        try {
            // Get all nodes with imageUri values that contain absolute paths
            const db = (sentenceBuilderSqlite as any).db;
            if (db) {
                // Find all rows with absolute imageUri paths (containing /Documents/)
                const [results] = await db.executeSql(
                    `SELECT id, imageUri FROM nodes WHERE imageUri IS NOT NULL AND imageUri LIKE '%/Documents/%'`
                );

                if (results.rows.length > 0) {
                    console.log(`[Import] Found ${results.rows.length} nodes with absolute imageUri paths`);

                    for (let i = 0; i < results.rows.length; i++) {
                        const row = results.rows.item(i);
                        const oldPath: string = row.imageUri;
                        // Extract the relative part (e.g., sentenceBuilder/filename.jpg or my8words/filename.jpg)
                        let relativePath: string | null = null;

                        const sentenceBuilderIdx = oldPath.lastIndexOf('/sentenceBuilder/');
                        const my8wordsIdx = oldPath.lastIndexOf('/my8words/');

                        if (sentenceBuilderIdx !== -1) {
                            relativePath = oldPath.substring(sentenceBuilderIdx + 1); // "sentenceBuilder/filename.jpg"
                        } else if (my8wordsIdx !== -1) {
                            relativePath = oldPath.substring(my8wordsIdx + 1); // "my8words/filename.jpg"
                        }

                        if (relativePath) {
                            const newPath = `${currentDocsPath}/${relativePath}`;
                            if (oldPath !== newPath) {
                                await db.executeSql(
                                    `UPDATE nodes SET imageUri = ? WHERE id = ?`,
                                    [newPath, row.id]
                                );
                                console.log(`[Import] Rewriting DB imageUri: ${row.id}`);
                            }
                        }
                    }
                    console.log('[Import] sentence_builder DB paths rewritten');
                } else {
                    console.log('[Import] No absolute imageUri paths found in DB — nothing to rewrite');
                }
            } else {
                console.warn('[Import] Could not access sentence_builder DB for path rewriting');
            }
        } catch (e) {
            console.warn('[Import] Error rewriting sentence_builder paths:', e);
        }
    },
};
