// Jest stub for react-native-sqlite-storage: enough surface for modules that
// import the library to load; DB behavior itself is not simulated.
const emptyResult = {
  rows: {length: 0, item: () => undefined},
  rowsAffected: 0,
  insertId: 1,
};

const mockDb = {
  executeSql: jest.fn(async () => [emptyResult]),
  close: jest.fn(async () => {}),
  transaction: jest.fn(),
};

module.exports = {
  enablePromise: jest.fn(),
  openDatabase: jest.fn(async () => mockDb),
  DEBUG: jest.fn(),
};
