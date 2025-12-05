import SQLite from 'react-native-sqlite-storage';

// Enable promise-based API
SQLite.enablePromise(true);

// Database configuration
const DB_NAME = 'matalk_metrics.db';
const DB_VERSION = '1.0';
const DB_DISPLAYNAME = 'Matalk Metrics Database';
const DB_SIZE = 200000;

// Database instance
let db: SQLite.SQLiteDatabase | null = null;

// Table schemas
const CREATE_UTTERANCES_TABLE = `
  CREATE TABLE IF NOT EXISTS utterances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    dateof DATETIME NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('Home', 'Convo')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const CREATE_CLASSIC_TABLE = `
  CREATE TABLE IF NOT EXISTS classic (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sentence TEXT NOT NULL,
    wordcount INTEGER NOT NULL,
    dateof DATETIME NOT NULL,
    timetobuild INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const CREATE_AI_RESPONSE_TIME_TABLE = `
  CREATE TABLE IF NOT EXISTS ai_response_time (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timetotap REAL NOT NULL,
    dateof DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const CREATE_AI_RESOLVED_TABLE = `
  CREATE TABLE IF NOT EXISTS ai_resolved (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    dateof DATETIME NOT NULL,
    round1_answers TEXT,
    round1_picked TEXT,
    round2_answers TEXT,
    round2_picked TEXT,
    round3_answers TEXT,
    round3_picked TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

// Database initialization
export const initDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  try {
    if (db) {
      return db;
    }

    db = await SQLite.openDatabase({
      name: DB_NAME,
      version: DB_VERSION,
      displayName: DB_DISPLAYNAME,
      size: DB_SIZE,
      location: 'default',
    });

    // Create tables
    await db.executeSql(CREATE_UTTERANCES_TABLE);
    await db.executeSql(CREATE_CLASSIC_TABLE);
    await db.executeSql(CREATE_AI_RESPONSE_TIME_TABLE);
    await db.executeSql(CREATE_AI_RESOLVED_TABLE);

    console.log('Database initialized successfully');
    return db;
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

// Get database instance
export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!db) {
    return await initDatabase();
  }
  return db;
};

// Close database
export const closeDatabase = async (): Promise<void> => {
  if (db) {
    await db.close();
    db = null;
    console.log('Database closed');
  }
};

// UTTERANCES TABLE OPERATIONS
export interface UtteranceRecord {
  id?: number;
  word: string;
  dateof: Date;
  source: 'Home' | 'Convo';
}

export const insertUtterance = async (
  utterance: UtteranceRecord,
): Promise<number> => {
  const database = await getDatabase();
  const query = `
    INSERT INTO utterances (word, dateof, source)
    VALUES (?, ?, ?)
  `;
  const [result] = await database.executeSql(query, [
    utterance.word,
    utterance.dateof.toISOString(),
    utterance.source,
  ]);
  return result.insertId || 0;
};

export const getUtterances = async (filters?: {
  startDate?: Date;
  endDate?: Date;
  source?: 'Home' | 'Convo' | 'all';
  limit?: number;
}): Promise<UtteranceRecord[]> => {
  const database = await getDatabase();
  let query = 'SELECT * FROM utterances WHERE 1=1';
  const params: any[] = [];

  if (filters?.startDate) {
    query += ' AND dateof >= ?';
    params.push(filters.startDate.toISOString());
  }

  if (filters?.endDate) {
    query += ' AND dateof <= ?';
    params.push(filters.endDate.toISOString());
  }

  if (filters?.source && filters.source !== 'all') {
    query += ' AND source = ?';
    params.push(filters.source);
  }

  query += ' ORDER BY dateof DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const [results] = await database.executeSql(query, params);
  const utterances: UtteranceRecord[] = [];

  for (let i = 0; i < results.rows.length; i++) {
    const row = results.rows.item(i);
    utterances.push({
      id: row.id,
      word: row.word,
      dateof: new Date(row.dateof),
      source: row.source,
    });
  }

  return utterances;
};

export const getWordCounts = async (filters?: {
  startDate?: Date;
  endDate?: Date;
  source?: 'Home' | 'Convo' | 'all';
  daysOfWeek?: number[]; // 0 = Sunday, 6 = Saturday
  timeOfDayStart?: string; // HH:mm format
  timeOfDayEnd?: string; // HH:mm format
  limit?: number;
}): Promise<{word: string; count: number}[]> => {
  const database = await getDatabase();
  let query = `
    SELECT word, COUNT(*) as count 
    FROM utterances 
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.startDate) {
    query += ' AND dateof >= ?';
    params.push(filters.startDate.toISOString());
  }

  if (filters?.endDate) {
    query += ' AND dateof <= ?';
    params.push(filters.endDate.toISOString());
  }

  if (filters?.source && filters.source !== 'all') {
    query += ' AND source = ?';
    params.push(filters.source);
  }

  // Filter by day of week (0 = Sunday, 6 = Saturday)
  if (filters?.daysOfWeek && filters.daysOfWeek.length > 0) {
    const placeholders = filters.daysOfWeek.map(() => '?').join(',');
    query += ` AND CAST(strftime('%w', dateof) AS INTEGER) IN (${placeholders})`;
    params.push(...filters.daysOfWeek);
  }

  // Filter by time of day
  if (filters?.timeOfDayStart && filters?.timeOfDayEnd) {
    // Convert HH:mm to seconds since midnight for comparison
    const [startHour, startMin] = filters.timeOfDayStart.split(':').map(Number);
    const [endHour, endMin] = filters.timeOfDayEnd.split(':').map(Number);
    const startSeconds = startHour * 3600 + startMin * 60;
    const endSeconds = endHour * 3600 + endMin * 60;

    // Extract time in seconds from dateof
    const timeInSeconds = `(CAST(strftime('%H', dateof) AS INTEGER) * 3600 + CAST(strftime('%M', dateof) AS INTEGER) * 60)`;

    // Handle time range that spans midnight (e.g., 23:00 to 01:00)
    if (startSeconds > endSeconds) {
      // Range spans midnight
      query += ` AND (${timeInSeconds} >= ? OR ${timeInSeconds} <= ?)`;
      params.push(startSeconds, endSeconds);
    } else {
      // Normal range within same day
      query += ` AND ${timeInSeconds} >= ? AND ${timeInSeconds} <= ?`;
      params.push(startSeconds, endSeconds);
    }
  }

  query += ' GROUP BY word ORDER BY count DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const [results] = await database.executeSql(query, params);
  const wordCounts: {word: string; count: number}[] = [];

  for (let i = 0; i < results.rows.length; i++) {
    const row = results.rows.item(i);
    wordCounts.push({
      word: row.word,
      count: row.count,
    });
  }

  return wordCounts;
};

// CLASSIC TABLE OPERATIONS
export interface ClassicRecord {
  id?: number;
  sentence: string;
  wordcount: number;
  dateof: Date;
  timetobuild: number;
}

export const insertClassic = async (
  classic: ClassicRecord,
): Promise<number> => {
  const database = await getDatabase();
  const query = `
    INSERT INTO classic (sentence, wordcount, dateof, timetobuild)
    VALUES (?, ?, ?, ?)
  `;
  const [result] = await database.executeSql(query, [
    classic.sentence,
    classic.wordcount,
    classic.dateof.toISOString(),
    classic.timetobuild,
  ]);
  return result.insertId || 0;
};

export const getClassicEntries = async (filters?: {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<ClassicRecord[]> => {
  const database = await getDatabase();
  let query = 'SELECT * FROM classic WHERE 1=1';
  const params: any[] = [];

  if (filters?.startDate) {
    query += ' AND dateof >= ?';
    params.push(filters.startDate.toISOString());
  }

  if (filters?.endDate) {
    query += ' AND dateof <= ?';
    params.push(filters.endDate.toISOString());
  }

  query += ' ORDER BY dateof DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const [results] = await database.executeSql(query, params);
  const entries: ClassicRecord[] = [];

  for (let i = 0; i < results.rows.length; i++) {
    const row = results.rows.item(i);
    entries.push({
      id: row.id,
      sentence: row.sentence,
      wordcount: row.wordcount,
      dateof: new Date(row.dateof),
      timetobuild: row.timetobuild,
    });
  }

  return entries;
};

// AI RESPONSE TIME TABLE OPERATIONS
export interface AIResponseTimeRecord {
  id?: number;
  timetotap: number;
  dateof: Date;
}

export const insertAIResponseTime = async (
  record: AIResponseTimeRecord,
): Promise<number> => {
  const database = await getDatabase();
  const query = `
    INSERT INTO ai_response_time (timetotap, dateof)
    VALUES (?, ?)
  `;
  const [result] = await database.executeSql(query, [
    record.timetotap,
    record.dateof.toISOString(),
  ]);
  return result.insertId || 0;
};

export const getAIResponseTimes = async (filters?: {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<AIResponseTimeRecord[]> => {
  const database = await getDatabase();
  let query = 'SELECT * FROM ai_response_time WHERE 1=1';
  const params: any[] = [];

  if (filters?.startDate) {
    query += ' AND dateof >= ?';
    params.push(filters.startDate.toISOString());
  }

  if (filters?.endDate) {
    query += ' AND dateof <= ?';
    params.push(filters.endDate.toISOString());
  }

  query += ' ORDER BY dateof DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const [results] = await database.executeSql(query, params);
  const records: AIResponseTimeRecord[] = [];

  for (let i = 0; i < results.rows.length; i++) {
    const row = results.rows.item(i);
    records.push({
      id: row.id,
      timetotap: row.timetotap,
      dateof: new Date(row.dateof),
    });
  }

  return records;
};

// AI RESOLVED TABLE OPERATIONS
export interface AIResolvedRecord {
  id?: number;
  question: string;
  dateof: Date;
  round1_answers?: string;
  round1_picked?: string;
  round2_answers?: string;
  round2_picked?: string;
  round3_answers?: string;
  round3_picked?: string;
}

export const insertAIResolved = async (
  record: AIResolvedRecord,
): Promise<number> => {
  const database = await getDatabase();
  const query = `
    INSERT INTO ai_resolved (
      question, dateof, round1_answers, round1_picked,
      round2_answers, round2_picked, round3_answers, round3_picked
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const [result] = await database.executeSql(query, [
    record.question,
    record.dateof.toISOString(),
    record.round1_answers || null,
    record.round1_picked || null,
    record.round2_answers || null,
    record.round2_picked || null,
    record.round3_answers || null,
    record.round3_picked || null,
  ]);
  return result.insertId || 0;
};

export const getAIResolved = async (filters?: {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<AIResolvedRecord[]> => {
  const database = await getDatabase();
  let query = 'SELECT * FROM ai_resolved WHERE 1=1';
  const params: any[] = [];

  if (filters?.startDate) {
    query += ' AND dateof >= ?';
    params.push(filters.startDate.toISOString());
  }

  if (filters?.endDate) {
    query += ' AND dateof <= ?';
    params.push(filters.endDate.toISOString());
  }

  query += ' ORDER BY dateof DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const [results] = await database.executeSql(query, params);
  const records: AIResolvedRecord[] = [];

  for (let i = 0; i < results.rows.length; i++) {
    const row = results.rows.item(i);
    records.push({
      id: row.id,
      question: row.question,
      dateof: new Date(row.dateof),
      round1_answers: row.round1_answers,
      round1_picked: row.round1_picked,
      round2_answers: row.round2_answers,
      round2_picked: row.round2_picked,
      round3_answers: row.round3_answers,
      round3_picked: row.round3_picked,
    });
  }

  return records;
};

// UTILITY FUNCTIONS
export const clearAllData = async (): Promise<void> => {
  const database = await getDatabase();
  await database.executeSql('DELETE FROM utterances');
  await database.executeSql('DELETE FROM classic');
  await database.executeSql('DELETE FROM ai_response_time');
  await database.executeSql('DELETE FROM ai_resolved');
  console.log('All data cleared');
};

export const getDatabaseStats = async (): Promise<{
  utterances: number;
  classic: number;
  aiResponseTime: number;
  aiResolved: number;
}> => {
  const database = await getDatabase();

  const [utterancesResult] = await database.executeSql(
    'SELECT COUNT(*) as count FROM utterances',
  );
  const [classicResult] = await database.executeSql(
    'SELECT COUNT(*) as count FROM classic',
  );
  const [aiResponseTimeResult] = await database.executeSql(
    'SELECT COUNT(*) as count FROM ai_response_time',
  );
  const [aiResolvedResult] = await database.executeSql(
    'SELECT COUNT(*) as count FROM ai_resolved',
  );

  return {
    utterances: utterancesResult.rows.item(0).count,
    classic: classicResult.rows.item(0).count,
    aiResponseTime: aiResponseTimeResult.rows.item(0).count,
    aiResolved: aiResolvedResult.rows.item(0).count,
  };
};
