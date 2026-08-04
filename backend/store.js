const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const EMPTY_STORE = Object.freeze({ version: 1, snippets: [] });

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

function normalizePayload(payload = {}) {
  return {
    title: cleanText(payload.title, 100, '标题', true),
    language: cleanText(payload.language, 30, '语言'),
    description: cleanText(payload.description, 500, '说明'),
    code: cleanCode(payload.code),
  };
}

function validateStore(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.snippets)) {
    throw new StoreError('JSON 数据文件格式不正确', 500, 'INVALID_DATA_FILE');
  }
  return {
    version: Number(value.version) || 1,
    snippets: value.snippets,
  };
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
    let raw;
    try {
      raw = await fs.readFile(dataFile, 'utf8');
      return validateStore(JSON.parse(raw));
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

  async function getAll() {
    const data = await read();
    return data.snippets;
  }

  async function getById(id) {
    const snippets = await getAll();
    const snippet = snippets.find((item) => item.id === id);
    if (!snippet) throw new StoreError('没有找到这段代码', 404, 'NOT_FOUND');
    return snippet;
  }

  async function create(payload) {
    const normalized = normalizePayload(payload);
    return mutate((data) => {
      const now = new Date().toISOString();
      const snippet = {
        id: crypto.randomUUID(),
        ...normalized,
        createdAt: now,
        updatedAt: now,
      };
      data.snippets.push(snippet);
      return snippet;
    });
  }

  async function update(id, payload) {
    const normalized = normalizePayload(payload);
    return mutate((data) => {
      const index = data.snippets.findIndex((item) => item.id === id);
      if (index === -1) throw new StoreError('没有找到这段代码', 404, 'NOT_FOUND');
      data.snippets[index] = {
        ...data.snippets[index],
        ...normalized,
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

  async function reorder(ids) {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) {
      throw new StoreError('排序数据格式不正确');
    }
    return mutate((data) => {
      const currentIds = data.snippets.map((item) => item.id);
      const isComplete = ids.length === currentIds.length && currentIds.every((id) => ids.includes(id));
      if (!isComplete) throw new StoreError('排序数据必须包含全部代码项目');
      const snippetsById = new Map(data.snippets.map((item) => [item.id, item]));
      data.snippets = ids.map((id) => snippetsById.get(id));
      return data.snippets;
    });
  }

  return { getAll, getById, create, update, remove, reorder };
}

module.exports = { createJsonStore, StoreError };
