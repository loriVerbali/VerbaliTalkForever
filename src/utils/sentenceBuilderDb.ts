import {useAppSettings} from './persistance';
import {
  Node,
  GridSettings,
  SentenceState,
  DEFAULT_COLOR_MAP,
  GRID_CONFIGS,
  GridConfigKey,
} from '../types/sentenceBuilder';
import {WordImageResult} from './wordImageApi';
import {downloadImage} from './imageDownloader';

// Database keys for preferences
const NODES_KEY = 'sentenceBuilder_nodes';
const GRID_SETTINGS_KEY = 'sentenceBuilder_gridSettings';
const SENTENCE_STATE_KEY = 'sentenceBuilder_sentenceState';

// Default seed data
const DEFAULT_SEED_NODES: Node[] = [
  // Root level - basic words
  {
    id: 'root_yes',
    parentId: null,
    kind: 'word',
    title: 'Yes',
    type: 'interjection',
    imageUri: undefined,
    orderIndex: 0,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'root_no',
    parentId: null,
    kind: 'word',
    title: 'No',
    type: 'interjection',
    imageUri: undefined,
    orderIndex: 1,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'root_help',
    parentId: null,
    kind: 'word',
    title: 'Help',
    type: 'verb',
    imageUri: undefined,
    orderIndex: 2,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'root_more',
    parentId: null,
    kind: 'word',
    title: 'More',
    type: 'adjective',
    imageUri: undefined,
    orderIndex: 3,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'root_food',
    parentId: null,
    kind: 'word',
    title: 'Food',
    type: 'noun',
    imageUri: undefined,
    orderIndex: 4,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'root_water',
    parentId: null,
    kind: 'word',
    title: 'Water',
    type: 'noun',
    imageUri: undefined,
    orderIndex: 5,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'root_play',
    parentId: null,
    kind: 'word',
    title: 'Play',
    type: 'verb',
    imageUri: undefined,
    orderIndex: 6,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'root_sleep',
    parentId: null,
    kind: 'word',
    title: 'Sleep',
    type: 'verb',
    imageUri: undefined,
    orderIndex: 7,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Family folder
  {
    id: 'folder_family',
    parentId: null,
    kind: 'folder',
    title: 'Family',
    orderIndex: 8,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Family words
  {
    id: 'family_mom',
    parentId: 'folder_family',
    kind: 'word',
    title: 'Mom',
    type: 'noun',
    imageUri: undefined,
    orderIndex: 0,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'family_dad',
    parentId: 'folder_family',
    kind: 'word',
    title: 'Dad',
    type: 'noun',
    imageUri: undefined,
    orderIndex: 1,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'family_brother',
    parentId: 'folder_family',
    kind: 'word',
    title: 'Brother',
    type: 'noun',
    imageUri: undefined,
    orderIndex: 2,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'family_sister',
    parentId: 'folder_family',
    kind: 'word',
    title: 'Sister',
    type: 'noun',
    imageUri: undefined,
    orderIndex: 3,
    isSeed: true,
    seedPackVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEFAULT_GRID_SETTINGS: GridSettings = {
  gridRows: 5,
  gridCols: 6,
  colorMap: DEFAULT_COLOR_MAP,
};

const DEFAULT_SENTENCE_STATE: SentenceState = {
  tokenIds: [],
};

// Database operations
export class SentenceBuilderDb {
  private getItem: (key: string) => Promise<string>;
  private setItem: (key: string, value: string) => Promise<void>;

  constructor(
    getItem: (key: string) => Promise<string>,
    setItem: (key: string, value: string) => Promise<void>,
  ) {
    this.getItem = getItem;
    this.setItem = setItem;
  }

  // Nodes operations
  async getNodes(): Promise<Node[]> {
    try {
      const nodesJson = await this.getItem(NODES_KEY);
      if (!nodesJson || nodesJson.trim() === '') {
        return DEFAULT_SEED_NODES;
      }
      return JSON.parse(nodesJson);
    } catch (error) {
      console.error('Error loading nodes:', error);
      return DEFAULT_SEED_NODES;
    }
  }

  async saveNodes(nodes: Node[]): Promise<void> {
    try {
      await this.setItem(NODES_KEY, JSON.stringify(nodes));
    } catch (error) {
      console.error('Error saving nodes:', error);
      throw error;
    }
  }

  async getNodesByParent(parentId: string | null): Promise<Node[]> {
    const nodes = await this.getNodes();
    return nodes
      .filter(node => node.parentId === parentId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async getNodeById(nodeId: string): Promise<Node | null> {
    const nodes = await this.getNodes();
    return nodes.find(node => node.id === nodeId) || null;
  }

  async addNode(
    node: Omit<Node, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Node> {
    const nodes = await this.getNodes();
    const newNode: Node = {
      ...node,
      id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    nodes.push(newNode);
    await this.saveNodes(nodes);
    return newNode;
  }

  async updateNode(
    nodeId: string,
    updates: Partial<Node>,
  ): Promise<Node | null> {
    const nodes = await this.getNodes();
    const nodeIndex = nodes.findIndex(node => node.id === nodeId);

    if (nodeIndex === -1) {
      return null;
    }

    nodes[nodeIndex] = {
      ...nodes[nodeIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.saveNodes(nodes);
    return nodes[nodeIndex];
  }

  async deleteNode(nodeId: string): Promise<boolean> {
    const nodes = await this.getNodes();
    const initialLength = nodes.length;

    // Remove the node and all its children
    const filteredNodes = nodes.filter(node => {
      if (node.id === nodeId) {
        return false;
      }
      // Remove children recursively
      return !this.isChildOf(node, nodeId, nodes);
    });

    if (filteredNodes.length === initialLength) {
      return false; // Node not found
    }

    await this.saveNodes(filteredNodes);
    return true;
  }

  private isChildOf(node: Node, parentId: string, allNodes: Node[]): boolean {
    if (node.parentId === parentId) {
      return true;
    }
    if (node.parentId === null) {
      return false;
    }
    const parent = allNodes.find(n => n.id === node.parentId);
    return parent ? this.isChildOf(parent, parentId, allNodes) : false;
  }

  async reorderNodes(
    parentId: string | null,
    nodeIds: string[],
  ): Promise<void> {
    const nodes = await this.getNodes();

    nodeIds.forEach((nodeId, index) => {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        node.orderIndex = index;
        node.updatedAt = new Date().toISOString();
      }
    });

    await this.saveNodes(nodes);
  }

  // Grid settings operations
  async getGridSettings(): Promise<GridSettings> {
    try {
      const settingsJson = await this.getItem(GRID_SETTINGS_KEY);
      if (!settingsJson || settingsJson.trim() === '') {
        return DEFAULT_GRID_SETTINGS;
      }
      return JSON.parse(settingsJson);
    } catch (error) {
      console.error('Error loading grid settings:', error);
      return DEFAULT_GRID_SETTINGS;
    }
  }

  async saveGridSettings(settings: GridSettings): Promise<void> {
    try {
      await this.setItem(GRID_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving grid settings:', error);
      throw error;
    }
  }

  async updateGridSize(rows: number, cols: number): Promise<void> {
    const settings = await this.getGridSettings();
    settings.gridRows = rows;
    settings.gridCols = cols;
    await this.saveGridSettings(settings);
  }

  // Sentence state operations
  async getSentenceState(): Promise<SentenceState> {
    try {
      const stateJson = await this.getItem(SENTENCE_STATE_KEY);
      if (!stateJson || stateJson.trim() === '') {
        return DEFAULT_SENTENCE_STATE;
      }
      return JSON.parse(stateJson);
    } catch (error) {
      console.error('Error loading sentence state:', error);
      return DEFAULT_SENTENCE_STATE;
    }
  }

  async saveSentenceState(state: SentenceState): Promise<void> {
    try {
      await this.setItem(SENTENCE_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving sentence state:', error);
      throw error;
    }
  }

  async addWordToSentence(nodeId: string): Promise<void> {
    const state = await this.getSentenceState();
    state.tokenIds.push(nodeId);
    await this.saveSentenceState(state);
  }

  async removeWordFromSentence(nodeId: string): Promise<void> {
    const state = await this.getSentenceState();
    state.tokenIds = state.tokenIds.filter(id => id !== nodeId);
    await this.saveSentenceState(state);
  }

  async clearSentence(): Promise<void> {
    await this.saveSentenceState(DEFAULT_SENTENCE_STATE);
  }

  // Word image operations
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
      });

      return newNode;
    } catch (error) {
      console.error('Error adding word from search:', error);
      throw error;
    }
  }

  // Utility functions
  async getGridConfig(): Promise<{rows: number; cols: number}> {
    const settings = await this.getGridSettings();
    return {
      rows: settings.gridRows,
      cols: settings.gridCols,
    };
  }

  async getMaxSlots(): Promise<number> {
    const config = await this.getGridConfig();
    return config.rows * config.cols;
  }

  async getColorForWordType(wordType: string): Promise<string> {
    const settings = await this.getGridSettings();
    return (
      settings.colorMap[wordType as keyof typeof settings.colorMap] ||
      settings.colorMap.other
    );
  }
}

// Export factory function to create instance with proper dependencies
export const createSentenceBuilderDb = (
  getItem: (key: string) => Promise<string>,
  setItem: (key: string, value: string) => Promise<void>,
) => {
  return new SentenceBuilderDb(getItem, setItem);
};
