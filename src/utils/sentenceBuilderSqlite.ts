import SQLite from 'react-native-sqlite-storage';
import {
  Node,
  GridSettings,
  SentenceState,
  DEFAULT_COLOR_MAP,
} from '../types/sentenceBuilder';
import {WordImageResult} from './wordImageApi';
import {downloadImage} from './imageDownloader';
import {COMPREHENSIVE_SEED_NODES} from './sentenceBuilderSeedData';

// Enable promise-based API
SQLite.enablePromise(true);

// Database configuration
const DATABASE_NAME = 'sentence_builder.db';
const DATABASE_VERSION = '1.0';
const DATABASE_DISPLAYNAME = 'Sentence Builder Database';
const DATABASE_SIZE = 200000;

// Note: Seed data is now imported from sentenceBuilderSeedData.ts

const DEFAULT_GRID_SETTINGS: GridSettings = {
  gridRows: 5,
  gridCols: 6,
  colorMap: DEFAULT_COLOR_MAP,
};

const DEFAULT_SENTENCE_STATE: SentenceState = {
  tokenIds: [],
};

export class SentenceBuilderSqlite {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    try {
      this.db = await SQLite.openDatabase({
        name: DATABASE_NAME,
        version: DATABASE_VERSION,
        displayName: DATABASE_DISPLAYNAME,
        size: DATABASE_SIZE,
        location: 'default',
      });

      await this.createTables();
      await this.migrateDatabase();
      await this.seedData();
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.db !== null;
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Create nodes table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        parentId TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('folder', 'word')),
        title TEXT NOT NULL,
        type TEXT,
        imageUri TEXT,
        imageHash TEXT,
        ttsText TEXT,
        orderIndex INTEGER NOT NULL,
        isSeed BOOLEAN NOT NULL DEFAULT 0,
        seedPackVersion INTEGER,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        key TEXT NOT NULL,
        disabledDrag BOOLEAN DEFAULT 0,
        disabledReSorted BOOLEAN DEFAULT 0,
        deleted BOOLEAN DEFAULT 0,
        FOREIGN KEY (parentId) REFERENCES nodes (id) ON DELETE CASCADE
      )
    `);

    // Create settings table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Create sentence_state table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS sentence_state (
        id INTEGER PRIMARY KEY,
        tokenIds TEXT NOT NULL
      )
    `);

    // Create indexes for better performance
    await this.db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes (parentId)
    `);
    await this.db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_nodes_order ON nodes (parentId, orderIndex)
    `);
  }

  private async migrateDatabase(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Check if key column exists
      const [result] = await this.db.executeSql(`
        PRAGMA table_info(nodes)
      `);

      let hasKeyColumn = false;
      for (let i = 0; i < result.rows.length; i++) {
        const column = result.rows.item(i);
        if (column.name === 'key') {
          hasKeyColumn = true;
          break;
        }
      }

      // Add key column if it doesn't exist
      if (!hasKeyColumn) {
        await this.db.executeSql(`
          ALTER TABLE nodes ADD COLUMN key TEXT
        `);

        // Update existing rows to set key = id
        await this.db.executeSql(`
          UPDATE nodes SET key = id WHERE key IS NULL
        `);
      }

      // Check and add disabledDrag, disabledReSorted, and deleted columns
      let hasDisabledDragColumn = false;
      let hasDisabledReSortedColumn = false;
      let hasDeletedColumn = false;

      for (let i = 0; i < result.rows.length; i++) {
        const column = result.rows.item(i);
        if (column.name === 'disabledDrag') hasDisabledDragColumn = true;
        if (column.name === 'disabledReSorted')
          hasDisabledReSortedColumn = true;
        if (column.name === 'deleted') hasDeletedColumn = true;
      }

      if (!hasDisabledDragColumn) {
        await this.db.executeSql(`
          ALTER TABLE nodes ADD COLUMN disabledDrag BOOLEAN DEFAULT 0
        `);
      }

      if (!hasDisabledReSortedColumn) {
        await this.db.executeSql(`
          ALTER TABLE nodes ADD COLUMN disabledReSorted BOOLEAN DEFAULT 0
        `);
      }

      if (!hasDeletedColumn) {
        await this.db.executeSql(`
          ALTER TABLE nodes ADD COLUMN deleted BOOLEAN DEFAULT 0
        `);
      }

      // Fix any existing deleted nodes to ensure they can be rearranged
      // Set disabledDrag=0 and disabledReSorted=0 for all deleted nodes
      await this.db.executeSql(`
        UPDATE nodes SET disabledDrag = 0, disabledReSorted = 0 WHERE deleted = 1
      `);
    } catch (error) {
      console.error('Error during migration:', error);
      // Don't throw error as this might be expected for new installations
    }
  }

  private async seedData(forceReseed: boolean = false): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Check if data already exists (unless forcing re-seed)
    if (!forceReseed) {
      const [result] = await this.db.executeSql(
        'SELECT COUNT(*) as count FROM nodes',
      );
      const count = result.rows.item(0).count;

      if (count > 0) {
        return;
      }
    }

    // Insert seed nodes
    const usedIds = new Set<string>();

    for (const nodeData of COMPREHENSIVE_SEED_NODES) {
      let id: string;
      let baseId: string;

      if (nodeData.parentId === null) {
        // Root level items - folders get folder_ prefix, words get root_ prefix
        if (nodeData.kind === 'folder') {
          baseId = `folder_${nodeData.title
            .toLowerCase()
            .replace(/\s+/g, '_')}`;
        } else {
          baseId = `root_${nodeData.title.toLowerCase().replace(/\s+/g, '_')}`;
        }
      } else if (nodeData.parentId.startsWith('folder_')) {
        // Items in folders - check if this is a nested folder or a word
        const folderName = nodeData.parentId.replace('folder_', '');
        if (nodeData.kind === 'folder') {
          // Nested folders get folder_ prefix
          baseId = `folder_${nodeData.title
            .toLowerCase()
            .replace(/\s+/g, '_')}`;
        } else {
          // Words in folders get parent_folder_word format
          baseId = `${folderName}_${nodeData.title
            .toLowerCase()
            .replace(/\s+/g, '_')}`;
        }
      } else {
        // Fallback
        baseId = `node_${nodeData.title.toLowerCase().replace(/\s+/g, '_')}`;
      }

      // Ensure unique ID by adding suffix if needed
      id = baseId;
      let counter = 1;
      while (usedIds.has(id)) {
        id = `${baseId}_${counter}`;
        counter++;
      }
      usedIds.add(id);

      const node: Node = {
        ...nodeData,
        id,
        key: id, // key is same as id for DraggableGrid compatibility
        disabledDrag: false, // allow dragging by default
        disabledReSorted: false, // allow reordering by default
        deleted: false, // not deleted by default
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.insertNode(node);
    }

    // Insert default settings
    await this.insertSetting(
      'gridSettings',
      JSON.stringify(DEFAULT_GRID_SETTINGS),
    );
    await this.insertSetting(
      'sentenceState',
      JSON.stringify(DEFAULT_SENTENCE_STATE),
    );
  }

  private async insertNode(node: Node): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.executeSql(
      `
      INSERT INTO nodes (
        id, parentId, kind, title, type, imageUri, imageHash, ttsText,
        orderIndex, isSeed, seedPackVersion, createdAt, updatedAt, key,
        disabledDrag, disabledReSorted, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        node.id,
        node.parentId,
        node.kind,
        node.title,
        node.type || null,
        node.imageUri || null,
        node.imageHash || null,
        node.ttsText || null,
        node.orderIndex,
        node.isSeed ? 1 : 0,
        node.seedPackVersion || null,
        node.createdAt,
        node.updatedAt,
        node.key,
        node.disabledDrag ? 1 : 0,
        node.disabledReSorted ? 1 : 0,
        node.deleted ? 1 : 0,
      ],
    );
  }

  private async insertSetting(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.executeSql(
      `
      INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    `,
      [key, value],
    );
  }

  // Public API methods
  async getNodes(): Promise<Node[]> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(`
      SELECT * FROM nodes WHERE deleted IS NULL OR deleted = 0 ORDER BY parentId, orderIndex
    `);

    const nodes: Node[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      nodes.push({
        id: row.id,
        parentId: row.parentId,
        kind: row.kind,
        title: row.title,
        type: row.type,
        imageUri: row.imageUri,
        imageHash: row.imageHash,
        ttsText: row.ttsText,
        orderIndex: row.orderIndex,
        isSeed: row.isSeed === 1,
        seedPackVersion: row.seedPackVersion,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        key: row.key || row.id, // fallback to id if key is null
        disabledDrag: row.disabledDrag === 1,
        disabledReSorted: row.disabledReSorted === 1,
        deleted: row.deleted === 1,
      });
    }

    return nodes;
  }

  async getNodesByParent(parentId: string | null): Promise<Node[]> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      `
      SELECT * FROM nodes 
      WHERE parentId ${
        parentId === null ? 'IS NULL' : '= ?'
      } AND (deleted IS NULL OR deleted = 0)
      ORDER BY orderIndex
    `,
      parentId === null ? [] : [parentId],
    );

    const nodes: Node[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      nodes.push({
        id: row.id,
        parentId: row.parentId,
        kind: row.kind,
        title: row.title,
        type: row.type,
        imageUri: row.imageUri,
        imageHash: row.imageHash,
        ttsText: row.ttsText,
        orderIndex: row.orderIndex,
        isSeed: row.isSeed === 1,
        seedPackVersion: row.seedPackVersion,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        key: row.key || row.id, // fallback to id if key is null
        disabledDrag: row.disabledDrag === 1,
        disabledReSorted: row.disabledReSorted === 1,
        deleted: row.deleted === 1,
      });
    }

    return nodes;
  }

  async getAllNodesByParent(parentId: string | null): Promise<Node[]> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      `
      SELECT * FROM nodes 
      WHERE parentId ${parentId === null ? 'IS NULL' : '= ?'}
      ORDER BY orderIndex
    `,
      parentId === null ? [] : [parentId],
    );

    const nodes: Node[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      nodes.push({
        id: row.id,
        parentId: row.parentId,
        kind: row.kind,
        title: row.title,
        type: row.type,
        imageUri: row.imageUri,
        imageHash: row.imageHash,
        ttsText: row.ttsText,
        orderIndex: row.orderIndex,
        isSeed: row.isSeed === 1,
        seedPackVersion: row.seedPackVersion,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        key: row.key || row.id, // fallback to id if key is null
        disabledDrag: row.disabledDrag === 1,
        disabledReSorted: row.disabledReSorted === 1,
        deleted: row.deleted === 1,
      });
    }

    return nodes;
  }

  async getAllFolders(): Promise<Node[]> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      `
      SELECT * FROM nodes 
      WHERE kind = 'folder' AND deleted = 0
      ORDER BY title
    `,
    );

    const folders: Node[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      folders.push({
        id: row.id,
        parentId: row.parentId,
        kind: row.kind,
        title: row.title,
        type: row.type,
        imageUri: row.imageUri,
        imageHash: row.imageHash,
        ttsText: row.ttsText,
        orderIndex: row.orderIndex,
        isSeed: row.isSeed === 1,
        seedPackVersion: row.seedPackVersion,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        key: row.key || row.id, // fallback to id if key is null
        disabledDrag: row.disabledDrag === 1,
        disabledReSorted: row.disabledReSorted === 1,
        deleted: row.deleted === 1,
      });
    }

    return folders;
  }

  async getNodeById(nodeId: string): Promise<Node | null> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      `
      SELECT * FROM nodes WHERE id = ?
    `,
      [nodeId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows.item(0);
    return {
      id: row.id,
      parentId: row.parentId,
      kind: row.kind,
      title: row.title,
      type: row.type,
      imageUri: row.imageUri,
      imageHash: row.imageHash,
      ttsText: row.ttsText,
      orderIndex: row.orderIndex,
      isSeed: row.isSeed === 1,
      seedPackVersion: row.seedPackVersion,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      key: row.key || row.id, // fallback to id if key is null
      disabledDrag: row.disabledDrag === 1,
      disabledReSorted: row.disabledReSorted === 1,
      deleted: row.deleted === 1,
    };
  }

  async addNode(
    node: Omit<Node, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Node> {
    if (!this.db) throw new Error('Database not initialized');

    const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newNode: Node = {
      ...node,
      id,
      key: node.key || id, // use provided key or fallback to id
      disabledDrag: node.disabledDrag || false, // allow dragging by default
      disabledReSorted: node.disabledReSorted || false, // allow reordering by default
      deleted: node.deleted || false, // not deleted by default
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.insertNode(newNode);
    return newNode;
  }

  async updateNode(
    nodeId: string,
    updates: Partial<Node>,
  ): Promise<Node | null> {
    if (!this.db) throw new Error('Database not initialized');

    const existingNode = await this.getNodeById(nodeId);
    if (!existingNode) {
      return null;
    }

    const updatedNode = {
      ...existingNode,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.db.executeSql(
      `
      UPDATE nodes SET
        parentId = ?, kind = ?, title = ?, type = ?, imageUri = ?,
        imageHash = ?, ttsText = ?, orderIndex = ?, isSeed = ?,
        seedPackVersion = ?, updatedAt = ?, key = ?, disabledDrag = ?, disabledReSorted = ?, deleted = ?
      WHERE id = ?
    `,
      [
        updatedNode.parentId,
        updatedNode.kind,
        updatedNode.title,
        updatedNode.type || null,
        updatedNode.imageUri || null,
        updatedNode.imageHash || null,
        updatedNode.ttsText || null,
        updatedNode.orderIndex,
        updatedNode.isSeed ? 1 : 0,
        updatedNode.seedPackVersion || null,
        updatedNode.updatedAt,
        updatedNode.key,
        updatedNode.disabledDrag ? 1 : 0,
        updatedNode.disabledReSorted ? 1 : 0,
        updatedNode.deleted ? 1 : 0,
        nodeId,
      ],
    );

    return updatedNode;
  }

  async deleteNode(nodeId: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    // Mark as deleted instead of actually deleting
    // Also set disabledDrag=0 and disabledReSorted=0 so the empty space can be rearranged
    const [result] = await this.db.executeSql(
      `
      UPDATE nodes SET deleted = 1, disabledDrag = 0, disabledReSorted = 0, updatedAt = ? WHERE id = ?
    `,
      [new Date().toISOString(), nodeId],
    );

    return result.rowsAffected > 0;
  }

  async permanentlyDeleteNode(nodeId: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    // Actually delete the node from the database
    const [result] = await this.db.executeSql(
      `DELETE FROM nodes WHERE id = ?`,
      [nodeId],
    );

    return result.rowsAffected > 0;
  }

  async reorderNodes(
    parentId: string | null,
    nodeIds: string[],
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    for (let i = 0; i < nodeIds.length; i++) {
      await this.db.executeSql(
        `
        UPDATE nodes SET orderIndex = ?, updatedAt = ? WHERE id = ?
      `,
        [i, new Date().toISOString(), nodeIds[i]],
      );
    }
  }

  async reorderNodesWithPositions(
    parentId: string | null,
    nodeIds: string[],
    orderIndexes: number[],
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    if (nodeIds.length !== orderIndexes.length) {
      throw new Error(
        'nodeIds and orderIndexes arrays must have the same length',
      );
    }

    for (let i = 0; i < nodeIds.length; i++) {
      // Update position while preserving drag properties for deleted nodes
      await this.db.executeSql(
        `
        UPDATE nodes SET orderIndex = ?, updatedAt = ? WHERE id = ?
      `,
        [orderIndexes[i], new Date().toISOString(), nodeIds[i]],
      );
    }
  }

  async getGridSettings(): Promise<GridSettings> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(`
      SELECT value FROM settings WHERE key = 'gridSettings'
    `);

    if (result.rows.length === 0) {
      return DEFAULT_GRID_SETTINGS;
    }

    try {
      return JSON.parse(result.rows.item(0).value);
    } catch (error) {
      console.error('Error parsing grid settings:', error);
      return DEFAULT_GRID_SETTINGS;
    }
  }

  async saveGridSettings(settings: GridSettings): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.insertSetting('gridSettings', JSON.stringify(settings));
  }

  async updateGridSize(rows: number, cols: number): Promise<void> {
    const settings = await this.getGridSettings();
    settings.gridRows = rows;
    settings.gridCols = cols;
    await this.saveGridSettings(settings);
  }

  async getSentenceState(): Promise<SentenceState> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(`
      SELECT tokenIds FROM sentence_state ORDER BY id DESC LIMIT 1
    `);

    if (result.rows.length === 0) {
      return DEFAULT_SENTENCE_STATE;
    }

    try {
      return JSON.parse(result.rows.item(0).tokenIds);
    } catch (error) {
      console.error('Error parsing sentence state:', error);
      return DEFAULT_SENTENCE_STATE;
    }
  }

  async saveSentenceState(state: SentenceState): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.executeSql(
      `
      INSERT INTO sentence_state (tokenIds) VALUES (?)
    `,
      [JSON.stringify(state)],
    );
  }

  async addWordToSentence(nodeId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const currentState = await this.getSentenceState();
    currentState.tokenIds.push(nodeId);
    await this.saveSentenceState(currentState);
  }

  async removeWordFromSentence(nodeId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const currentState = await this.getSentenceState();
    currentState.tokenIds = currentState.tokenIds.filter(id => id !== nodeId);
    await this.saveSentenceState(currentState);
  }

  async clearSentence(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.saveSentenceState(DEFAULT_SENTENCE_STATE);
  }

  async addWordFromSearch(
    wordImage: WordImageResult,
    parentId: string | null,
    position: number,
    wordType: string = 'other',
  ): Promise<Node> {
    try {
      // Download image
      const localImagePath = await downloadImage(
        wordImage.imageUrl,
        wordImage.id,
      );

      const newNode = await this.addNode({
        parentId,
        kind: 'word',
        title: wordImage.word,
        type: wordType as any,
        imageUri: localImagePath,
        imageHash: wordImage.id,
        orderIndex: position,
        isSeed: false,
        key: `word_${wordImage.id}`, // generate key for the word
        disabledDrag: false, // allow dragging
        disabledReSorted: false, // allow reordering
        deleted: false, // not deleted by default
      });

      return newNode;
    } catch (error) {
      console.error('Error adding word from search:', error);
      throw error;
    }
  }

  async clearAndReseed(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Clear all existing data
    await this.db.executeSql('DELETE FROM nodes');
    await this.db.executeSql('DELETE FROM settings');
    await this.db.executeSql('DELETE FROM sentence_state');

    // Re-seed with comprehensive data
    await this.seedData(true);
  }

  async copyFolder(
    sourceFolderId: string,
    newParentId: string | null,
    position: number,
  ): Promise<Node> {
    if (!this.db) throw new Error('Database not initialized');

    // Get the source folder
    const sourceFolder = await this.getNodeById(sourceFolderId);

    if (!sourceFolder || sourceFolder.kind !== 'folder') {
      throw new Error(`Source folder not found: ${sourceFolderId}`);
    }

    // Create new folder with new ID and parent
    const newFolder = await this.addNode({
      parentId: newParentId,
      kind: 'folder',
      title: sourceFolder.title,
      type: sourceFolder.type,
      imageUri: sourceFolder.imageUri,
      imageHash: sourceFolder.imageHash,
      ttsText: sourceFolder.ttsText,
      orderIndex: position,
      isSeed: false, // Mark as user-created
      key: `folder_copy_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      disabledDrag: sourceFolder.disabledDrag,
      disabledReSorted: sourceFolder.disabledReSorted,
      deleted: false,
    });

    // Get all children of the source folder
    const sourceChildren = await this.getAllNodesByParent(sourceFolderId);

    // Recursively copy all children
    for (const child of sourceChildren) {
      await this.copyNodeRecursively(child, newFolder.id, child.orderIndex);
    }

    return newFolder;
  }

  private async copyNodeRecursively(
    sourceNode: Node,
    newParentId: string,
    position: number,
  ): Promise<Node> {
    if (!this.db) throw new Error('Database not initialized');

    // Create new node
    const newNode = await this.addNode({
      parentId: newParentId,
      kind: sourceNode.kind,
      title: sourceNode.title,
      type: sourceNode.type,
      imageUri: sourceNode.imageUri,
      imageHash: sourceNode.imageHash,
      ttsText: sourceNode.ttsText,
      orderIndex: position,
      isSeed: false, // Mark as user-created
      key: `${sourceNode.kind}_copy_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      disabledDrag: sourceNode.disabledDrag,
      disabledReSorted: sourceNode.disabledReSorted,
      deleted: false,
    });

    // If it's a folder, recursively copy its children
    if (sourceNode.kind === 'folder') {
      const sourceChildren = await this.getAllNodesByParent(sourceNode.id);
      for (const child of sourceChildren) {
        await this.copyNodeRecursively(child, newNode.id, child.orderIndex);
      }
    }

    return newNode;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance
export const sentenceBuilderSqlite = new SentenceBuilderSqlite();
