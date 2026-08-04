const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createJsonStore, StoreError } = require('../backend/store');

async function temporaryStore(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codepreview-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'snippets.json');
  return { store: createJsonStore(file), file };
}

test('creates a version 2 JSON file with empty directories and snippets', async (t) => {
  const { store, file } = await temporaryStore(t);
  assert.deepEqual(await store.getLibrary(), { version: 2, directories: [], snippets: [] });
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(data.version, 2);
  assert.deepEqual(data.directories, []);
  assert.deepEqual(data.snippets, []);
});

test('migrates existing version 1 snippets into an uncategorized directory', async (t) => {
  const { store, file } = await temporaryStore(t);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({
    version: 1,
    snippets: [{ id: 'old-code', title: '旧代码', code: 'print(1)' }],
  }));
  const library = await store.getLibrary();
  assert.equal(library.version, 2);
  assert.equal(library.directories[0].name, '未分类');
  assert.equal(library.snippets[0].directoryId, library.directories[0].id);
});

test('creates, renames, reorders and deletes directories with their snippets', async (t) => {
  const { store } = await temporaryStore(t);
  const first = await store.createDirectory({ name: 'Python' });
  const second = await store.createDirectory({ name: 'JavaScript' });
  const renamed = await store.updateDirectory(first.id, { name: 'Python 基础' });
  assert.equal(renamed.name, 'Python 基础');
  assert.deepEqual(
    (await store.reorderDirectories([second.id, first.id])).map((item) => item.id),
    [second.id, first.id],
  );
  await store.create({ title: '循环', code: 'for i in range(3):', directoryId: first.id });
  const removed = await store.removeDirectory(first.id);
  assert.equal(removed.deletedSnippetCount, 1);
  assert.deepEqual(await store.getAll(), []);
});

test('creates, updates and deletes a snippet inside a directory', async (t) => {
  const { store } = await temporaryStore(t);
  const directory = await store.createDirectory({ name: '深度学习' });
  const created = await store.create({
    title: '训练循环',
    directoryId: directory.id,
    language: 'Python',
    description: '逐行复习',
    code: '  for epoch in range(3):\r\n    train()\n',
  });
  assert.equal(created.directoryId, directory.id);
  assert.equal(created.code, '  for epoch in range(3):\n    train()\n');

  const updated = await store.update(created.id, { ...created, title: '新的标题' });
  assert.equal(updated.title, '新的标题');
  assert.equal((await store.getById(created.id)).title, '新的标题');

  const removed = await store.remove(created.id);
  assert.equal(removed.id, created.id);
  assert.deepEqual(await store.getAll(), []);
});

test('reorders only the snippets inside the selected directory', async (t) => {
  const { store } = await temporaryStore(t);
  const directory = await store.createDirectory({ name: 'A' });
  const otherDirectory = await store.createDirectory({ name: 'B' });
  const first = await store.create({ title: 'A1', code: 'a', directoryId: directory.id });
  const other = await store.create({ title: 'B1', code: 'b', directoryId: otherDirectory.id });
  const second = await store.create({ title: 'A2', code: 'c', directoryId: directory.id });
  const reordered = await store.reorder(directory.id, [second.id, first.id]);
  assert.deepEqual(reordered.map((item) => item.id), [second.id, first.id]);
  assert.equal((await store.getById(other.id)).directoryId, otherDirectory.id);
  await assert.rejects(() => store.reorder(directory.id, [first.id]), StoreError);
});

test('serializes concurrent writes without losing snippets', async (t) => {
  const { store } = await temporaryStore(t);
  const directory = await store.createDirectory({ name: '并发测试' });
  await Promise.all(
    Array.from({ length: 12 }, (_, index) => store.create({
      title: `项目 ${index}`,
      code: `${index}`,
      directoryId: directory.id,
    })),
  );
  assert.equal((await store.getAll()).length, 12);
});

test('validates names, titles and directory references', async (t) => {
  const { store } = await temporaryStore(t);
  await assert.rejects(() => store.createDirectory({ name: '' }), /目录名称不能为空/);
  await assert.rejects(
    () => store.create({ title: '代码', code: '', directoryId: 'missing' }),
    /没有找到这个目录/,
  );
  await assert.rejects(() => store.create({ title: 'A'.repeat(101), code: '' }), /100/);
});

