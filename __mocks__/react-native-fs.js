// Jest stub for react-native-fs: an in-memory file system so modules that import it
// can load without the native module. IEP persistence tests use MemoryPersistence.
const files = new Map();

const exists = async path => files.has(path) || [...files.keys()].some(k => k.startsWith(`${path}/`));

module.exports = {
  DocumentDirectoryPath: '/mock/Documents',
  TemporaryDirectoryPath: '/mock/tmp',
  LibraryDirectoryPath: '/mock/Library',
  exists,
  mkdir: async () => undefined,
  readFile: async path => {
    if (!files.has(path)) {
      throw new Error(`ENOENT: ${path}`);
    }
    return files.get(path);
  },
  writeFile: async (path, contents) => {
    files.set(path, contents);
  },
  moveFile: async (from, to) => {
    files.set(to, files.get(from));
    files.delete(from);
  },
  copyFile: async (from, to) => {
    files.set(to, files.get(from));
  },
  unlink: async path => {
    files.delete(path);
  },
  readDir: async dir =>
    [...files.keys()]
      .filter(k => k.startsWith(`${dir}/`))
      .map(k => ({ name: k.slice(dir.length + 1), path: k, isFile: () => true, isDirectory: () => false })),
  __reset: () => files.clear(),
};
