const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DATA_VERSION = 2;
const LEGACY_DIRECTORY_ID = 'legacy-default';
const EMPTY_STORE = Object.freeze({ version: DATA_VERSION, directories: [], snippets: [] });

class StoreError extends Error {
  constructor(message, status = 400, code = 'STORE_ERROR') {
    super(message);
    this.name = 'StoreError';
    this.status = status;
    this.code = code;
  }
}

function cleanText(value, maxLength, fieldName, required = false) {
  if (typeof value !== 'string') {
    if (required) throw new StoreError(`${fieldName}不能为空`);
    return '';
  }
  const cleaned = value.replace(/\r\n?/g, '\n').trim();
  if (required && !cleaned) throw new StoreError(`${fieldName}不能为空`);
  if (cleaned.length > maxLength) {
    throw new StoreError(`${fieldName}不能超过 ${maxLength} 个字符`);
  }
  return cleaned;
}

function cleanCode(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\r\n?/g, '\n');
  if (normalized.length > 200000) {
    throw new StoreError('代码不能超过 200000 个字符');
  }
  return normalized;
}

function normalizeSnippetPayload(payload = {}) {
  return {
    title: cleanText(payload.title, 100, '标题', true),
    language: cleanText(payload.language, 30, '语言'),
    description: cleanText(payload.description, 500, '说明'),
    code: cleanCode(payload.code),
    directoryId: cleanText(payload.directoryId, 100, '目录'),
  };
}

function normalizeDirectoryPayload(payload = {}) {
  return { name: cleanText(payload.name, 60, '目录名称', true) };
}

function migrateStore(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.snippets)) {
    throw new StoreError('JSON 数据文件格式不正确', 500, 'INVALID_DATA_FILE');
  }

  const snippets = value.snippets.map((snippet) => ({ ...snippet }));
  const directories = Array.isArray(value.directories)
    ? value.directories.map((directory) => ({ ...directory }))
    : [];

  const directoryIds = new Set(directories.map((directory) => directory.id));
  const hasUnassignedSnippets = snippets.some(
    (snippet) => !snippet.directoryId || !directoryIds.has(snippet.directoryId),
  );

  if (hasUnassignedSnippets) {
    if (!directoryIds.has(LEGACY_DIRECTORY_ID)) {
      directories.unshift({
        id: LEGACY_DIRECTORY_ID,
        name: '未分类',
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:00.000Z',
      });
      directoryIds.add(LEGACY_DIRECTORY_ID);
    }
    snippets.forEach((snippet) => {
      if (!snippet.directoryId || !directoryIds.has(snippet.directoryId)) {
        snippet.directoryId = LEGACY_DIRECTORY_ID;
      }
    });
  }

  if (directories.some((directory) => !directory.id || !directory.name)) {
    throw new StoreError('JSON 数据文件中的目录格式不正确', 500, 'INVALID_DATA_FILE');
  }
  if (new Set(directories.map((directory) => directory.id)).size !== directories.length) {
    throw new StoreError('JSON 数据文件中存在重复目录', 500, 'INVALID_DATA_FILE');
  }

  return { version: DATA_VERSION, directories, snippets };
}

function createJsonStore(dataFile) {
  if (!dataFile) throw new Error('dataFile is required');
  let mutationQueue = Promise.resolve();

  async function ensureFile() {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    try {
      await fs.access(dataFile);
    } catch {
      await fs.writeFile(dataFile, `${JSON.stringify(EMPTY_STORE, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      }).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
    }
  }

  async function read() {
    await ensureFile();
    try {
      const raw = await fs.readFile(dataFile, 'utf8');
      return migrateStore(JSON.parse(raw));
    } catch (error) {
      if (error instanceof StoreError) throw error;
      if (error instanceof SyntaxError) {
        throw new StoreError('JSON 数据文件无法解析，请检查文件内容', 500, 'INVALID_JSON');
      }
      throw error;
    }
  }

  async function write(data) {
    await ensureFile();
    const temporaryFile = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryFile, dataFile);
  }

  function mutate(operation) {
    const nextMutation = mutationQueue.then(async () => {
      const data = await read();
      const result = await operation(data);
      await write(data);
      return result;
    });
    mutationQueue = nextMutation.catch(() => undefined);
    return nextMutation;
  }

  function findDirectory(data, id) {
    const directory = data.directories.find((item) => item.id === id);
    if (!directory) throw new StoreError('没有找到这个目录', 404, 'DIRECTORY_NOT_FOUND');
    return directory;
  }

  async function getLibrary() {
    return read();
  }

  async function getDirectories() {
    return (await read()).directories;
  }

  async function createDirectory(payload) {
    const normalized = normalizeDirectoryPayload(payload);
    return mutate((data) => {
      const now = new Date().toISOString();
      const directory = {
        id: crypto.randomUUID(),
        ...normalized,
        createdAt: now,
        updatedAt: now,
      };
      data.directories.push(directory);
      return directory;
    });
  }

  async function updateDirectory(id, payload) {
    const normalized = normalizeDirectoryPayload(payload);
    return mutate((data) => {
      const index = data.directories.findIndex((item) => item.id === id);
      if (index === -1) throw new StoreError('没有找到这个目录', 404, 'DIRECTORY_NOT_FOUND');
      data.directories[index] = {
        ...data.directories[index],
        ...normalized,
        updatedAt: new Date().toISOString(),
      };
      return data.directories[index];
    });
  }

  async function removeDirectory(id) {
    return mutate((data) => {
      const index = data.directories.findIndex((item) => item.id === id);
      if (index === -1) throw new StoreError('没有找到这个目录', 404, 'DIRECTORY_NOT_FOUND');
      const [directory] = data.directories.splice(index, 1);
      const before = data.snippets.length;
      data.snippets = data.snippets.filter((snippet) => snippet.directoryId !== id);
      return { directory, deletedSnippetCount: before - data.snippets.length };
    });
  }

  async function reorderDirectories(ids) {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) {
      throw new StoreError('目录排序数据格式不正确');
    }
    return mutate((data) => {
      const currentIds = data.directories.map((item) => item.id);
      const complete = ids.length === currentIds.length && currentIds.every((id) => ids.includes(id));
      if (!complete) throw new StoreError('排序数据必须包含全部目录');
      const byId = new Map(data.directories.map((item) => [item.id, item]));
      data.directories = ids.map((id) => byId.get(id));
      return data.directories;
    });
  }

  async function getAll() {
    return (await read()).snippets;
  }

  async function getById(id) {
    const snippets = await getAll();
    const snippet = snippets.find((item) => item.id === id);
    if (!snippet) throw new StoreError('没有找到这段代码', 404, 'NOT_FOUND');
    return snippet;
  }

  async function create(payload) {
    const normalized = normalizeSnippetPayload(payload);
    return mutate((data) => {
      const directoryId = normalized.directoryId || data.directories[0]?.id;
      findDirectory(data, directoryId);
      const now = new Date().toISOString();
      const snippet = {
        id: crypto.randomUUID(),
        ...normalized,
        directoryId,
        createdAt: now,
        updatedAt: now,
      };
      data.snippets.push(snippet);
      return snippet;
    });
  }

  async function update(id, payload) {
    const normalized = normalizeSnippetPayload(payload);
    return mutate((data) => {
      const index = data.snippets.findIndex((item) => item.id === id);
      if (index === -1) throw new StoreError('没有找到这段代码', 404, 'NOT_FOUND');
      const directoryId = normalized.directoryId || data.snippets[index].directoryId;
      findDirectory(data, directoryId);
      data.snippets[index] = {
        ...data.snippets[index],
        ...normalized,
        directoryId,
        updatedAt: new Date().toISOString(),
      };
      return data.snippets[index];
    });
  }

  async function remove(id) {
    return mutate((data) => {
      const index = data.snippets.findIndex((item) => item.id === id);
      if (index === -1) throw new StoreError('没有找到这段代码', 404, 'NOT_FOUND');
      const [removed] = data.snippets.splice(index, 1);
      return removed;
    });
  }

  async function reorder(directoryId, ids) {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) {
      throw new StoreError('排序数据格式不正确');
    }
    return mutate((data) => {
      findDirectory(data, directoryId);
      const currentIds = data.snippets
        .filter((snippet) => snippet.directoryId === directoryId)
        .map((snippet) => snippet.id);
      const complete = ids.length === currentIds.length && currentIds.every((id) => ids.includes(id));
      if (!complete) throw new StoreError('排序数据必须包含目录下的全部代码');
      const byId = new Map(data.snippets.map((item) => [item.id, item]));
      let orderedIndex = 0;
      data.snippets = data.snippets.map((snippet) => (
        snippet.directoryId === directoryId ? byId.get(ids[orderedIndex++]) : snippet
      ));
      return ids.map((id) => byId.get(id));
    });
  }

  return {
    getLibrary,
    getDirectories,
    createDirectory,
    updateDirectory,
    removeDirectory,
    reorderDirectories,
    getAll,
    getById,
    create,
    update,
    remove,
    reorder,
  };
}

module.exports = { createJsonStore, StoreError };
