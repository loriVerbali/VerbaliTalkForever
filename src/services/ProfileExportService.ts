import RNFS from 'react-native-fs';
import { zip } from 'react-native-zip-archive';
import Share from 'react-native-share';
import DefaultPreference from 'react-native-default-preference';
import { Platform } from 'react-native';
// @ts-ignore
import { closeDatabase, getDatabase, initDatabase } from '../utils/database';
// @ts-ignore
import { sentenceBuilderSqlite } from '../utils/sentenceBuilderSqlite';
import { initialPreferences } from '../utils/persistance';

const BACKUP_FOLDER_NAME = 'matalk-profile-backup';
const EXPORT_FOLDER_NAME = 'verbali-profile-backup';
const ZIP_PREFIX = 'matalk-profile-backup';

interface ExportMetadata {
    appName: string;
    backupType: string;
    schemaVersion: number;
    appVersion: string; // Dynamic?
    exportedAt: string;
    devicePlatform: string;
}

export const ProfileExportService = {
    /**
     * Main export function
     */
    async exportProfile(): Promise<void> {
        const stagingPath = `${RNFS.DocumentDirectoryPath}/${BACKUP_FOLDER_NAME}`;
        const exportPath = `${stagingPath}/${EXPORT_FOLDER_NAME}`;
        const dbPath = `${exportPath}/db`;
        const imagesPath = `${exportPath}/images`;
        let zipPath = '';

        try {
            console.log('Starting profile export...');

            // 1. Cleanup & Setup Staging
            await this._cleanup(stagingPath);
            await RNFS.mkdir(exportPath);
            await RNFS.mkdir(dbPath);
            await RNFS.mkdir(imagesPath);

            // 2. Export Persistence (Preferences)
            await this._exportPersistence(exportPath);

            // 3. Export Database
            await this._exportDatabase(dbPath);

            // 4. Export Images
            await this._exportImages(imagesPath);

            // 5. Create Metadata
            await this._createMetadata(exportPath);

            // 6. Zip
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const zipFileName = `${ZIP_PREFIX}-${timestamp}.zip`;
            zipPath = `${RNFS.DocumentDirectoryPath}/${zipFileName}`;

            await zip(exportPath, zipPath);
            console.log(`Zip created at: ${zipPath}`);

            // 7. Share
            await this._shareBackup(zipPath);

            // 8. Cleanup Zip (Staging cleaned in finally)
            await RNFS.unlink(zipPath);

        } catch (error) {
            console.error('Export failed:', error);
            throw error;
        } finally {
            await this._cleanup(stagingPath);
            // Re-open DBs after export
            try {
                await initDatabase(); // reopens matalk_metrics.db
            } catch (e) {
                console.warn('Failed to reopen metrics DB after export:', e);
            }
            try {
                await sentenceBuilderSqlite.init(); // reopens sentence_builder.db
            } catch (e) {
                console.warn('Failed to reopen sentence builder DB after export:', e);
            }
        }
    },

    async _cleanup(path: string) {
        if (await RNFS.exists(path)) {
            await RNFS.unlink(path);
        }
    },

    async _exportPersistence(exportPath: string) {
        const prefsToExport: Record<string, string> = {};
        const keys = Object.keys(initialPreferences);

        // List of keys to exclude
        const excludedKeys = [
            'isIOSActive',
            'isInTrial',
            'trialInstallationDate',
            'sessionToken',
            'lastRefreshCheck',
            'installationGuid'
        ];

        for (const key of keys) {
            if (excludedKeys.includes(key)) {
                continue;
            }

            try {
                const value = await DefaultPreference.get(key);
                // specific logic: if value is null/undefined, do we default to initial?
                // The requirement says "Export all key-value persistence for the active profile".
                prefsToExport[key] = value ?? (initialPreferences as any)[key];
                
                if (key === 'tellUsMore') {
                    console.log(`[Export] Including tellUsMore context (${(prefsToExport[key] || '').length} chars)`);
                }
            } catch (e) {
                console.warn(`Failed to get preference for ${key}`, e);
                prefsToExport[key] = (initialPreferences as any)[key];
            }
        }

        // Rewrite pepes imageUri paths to just filenames for portability
        if (prefsToExport.pepes) {
            try {
                const pepesData = JSON.parse(prefsToExport.pepes);
                const categories = ['People', 'Toys', 'Pets', 'TVShows', 'Food', 'Drinks', 'Places'];
                for (const category of categories) {
                    if (Array.isArray(pepesData[category])) {
                        for (const item of pepesData[category]) {
                            if (item.imageUri && typeof item.imageUri === 'string') {
                                // Extract just the filename from the full path
                                const filename = item.imageUri.replace('file://', '').split('/').pop();
                                if (filename) {
                                    console.log(`[Export] Rewriting pepes imageUri: ${item.name} → ${filename}`);
                                    item.imageUri = filename;
                                }
                            }
                        }
                    }
                }
                prefsToExport.pepes = JSON.stringify(pepesData);
            } catch (e) {
                console.warn('[Export] Error rewriting pepes paths:', e);
            }
        }

        const json = JSON.stringify(prefsToExport, null, 2);
        await RNFS.writeFile(`${exportPath}/storage.json`, json, 'utf8');
    },

    async _exportDatabase(destPath: string) {
        // Close BOTH databases before copying to ensure clean file state
        await closeDatabase(); // matalk_metrics.db
        await sentenceBuilderSqlite.close(); // sentence_builder.db

        const dbNames = ['matalk_metrics.db', 'sentence_builder.db'];

        // react-native-sqlite-storage may place DBs in different locations depending on version/config
        // Search all possible locations to find the actual files
        const possibleDirs = Platform.OS === 'ios'
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

        for (const dbName of dbNames) {
            let found = false;

            for (const dir of possibleDirs) {
                const fullPath = `${dir}/${dbName}`;
                console.log(`[Export] Checking for ${dbName} at: ${fullPath}`);

                if (await RNFS.exists(fullPath)) {
                    await RNFS.copyFile(fullPath, `${destPath}/${dbName}`);
                    console.log(`[Export] ✅ Exported ${dbName} from: ${fullPath}`);
                    found = true;
                    break;
                }
            }

            if (!found) {
                console.warn(`[Export] ⚠️ ${dbName} not found in any known location!`);
                // List what IS in each directory for debugging
                for (const dir of possibleDirs) {
                    try {
                        if (await RNFS.exists(dir)) {
                            const files = await RNFS.readDir(dir);
                            const dbFiles = files.filter(f => f.name.endsWith('.db') || f.name.endsWith('.sqlite'));
                            console.log(`[Export] Contents of ${dir}: ${dbFiles.map(f => f.name).join(', ') || '(no .db files)'}`);
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            }
        }
    },

    async _exportImages(destPath: string) {
        const sourceDir = `${RNFS.DocumentDirectoryPath}/sentenceBuilder`;
        const my8wordsDir = `${RNFS.DocumentDirectoryPath}/my8words`;

        // 1. sentenceBuilder images
        if (await RNFS.exists(sourceDir)) {
            await RNFS.copyFile(sourceDir, `${destPath}/sentenceBuilder`);
        }

        // 2. my8words images
        if (await RNFS.exists(my8wordsDir)) {
            await RNFS.copyFile(my8wordsDir, `${destPath}/my8words`);
        }

        // 3. pepes images — read from preference data and copy each referenced image
        try {
            const pepesRaw = await DefaultPreference.get('pepes');
            if (pepesRaw) {
                const pepesData = JSON.parse(pepesRaw);
                const categories = ['People', 'Toys', 'Pets', 'TVShows', 'Food', 'Drinks', 'Places'];
                const pepesImagesDir = `${destPath}/pepes`;
                let copiedCount = 0;

                for (const category of categories) {
                    if (Array.isArray(pepesData[category])) {
                        for (const item of pepesData[category]) {
                            if (item.imageUri && typeof item.imageUri === 'string') {
                                // Strip file:// prefix if present
                                const sourcePath = item.imageUri.replace('file://', '');
                                if (await RNFS.exists(sourcePath)) {
                                    // Create pepes images dir on first use
                                    if (copiedCount === 0) {
                                        await RNFS.mkdir(pepesImagesDir);
                                    }
                                    const filename = sourcePath.split('/').pop()!;
                                    await RNFS.copyFile(sourcePath, `${pepesImagesDir}/${filename}`);
                                    console.log(`[Export] ✅ Copied pepes image: ${item.name} (${filename})`);
                                    copiedCount++;
                                } else {
                                    console.warn(`[Export] ⚠️ Pepes image not found: ${sourcePath} (${item.name})`);
                                }
                            }
                        }
                    }
                }
                if (copiedCount > 0) {
                    console.log(`[Export] Exported ${copiedCount} pepes images`);
                }
            }
        } catch (e) {
            console.warn('[Export] Error exporting pepes images:', e);
        }
    },

    async _createMetadata(exportPath: string) {
        const metadata: ExportMetadata = {
            appName: 'Matalk',
            backupType: 'profile',
            schemaVersion: 1,
            appVersion: '0.0.2', // Should ideally come from DeviceInfo or package.json
            exportedAt: new Date().toISOString(),
            devicePlatform: Platform.OS,
        };

        await RNFS.writeFile(`${exportPath}/metadata.json`, JSON.stringify(metadata, null, 2), 'utf8');
    },

    async _shareBackup(filePath: string) {
        await Share.open({
            title: 'Export Profile',
            subject: 'Matalk Profile Backup',
            url: `file://${filePath}`,
            failOnCancel: false,
        });
    }
};
