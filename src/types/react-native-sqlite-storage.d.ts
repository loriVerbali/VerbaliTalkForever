declare module 'react-native-sqlite-storage' {
  export interface SQLiteDatabase {
    executeSql(sql: string, params?: any[]): Promise<[any, any]>;
    close(): Promise<void>;
  }

  export interface SQLiteParams {
    name: string;
    version: string;
    displayName: string;
    size: number;
    location: string;
  }

  export function openDatabase(params: SQLiteParams): Promise<SQLiteDatabase>;
  export function enablePromise(enable: boolean): void;
}
