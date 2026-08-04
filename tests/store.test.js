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

test('creates the JSON file and starts with an empty list', async (t) => {
  const { store, file } = await temporaryStore(t);
  assert.deepEqual(await store.getAll(), []);
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(data.version, 1);
  assert.deepEqual(data.snippets, []);
});

test('creates, updates and deletes a snippet', async (t) => {
  const { store } = await temporaryStore(t);
  const created = await store.create({
    title: '训练循环',
    language: 'Python',
    description: '逐行复习',
    code: '  for epoch in range(3):\r\n    train()\n',
  });
  assert.equal(created.title, '训练循环');
  assert.equal(created.code, '  for epoch in range(3):\n    train()\n');
  assert.equal((await store.getAll()).length, 1);

  const updated = await store.update(created.id, { ...created, title: '新的标题' });
  assert.equal(updated.title, '新的标题');
  assert.equal((await store.getById(created.id)).title, '新的标题');

  const removed = await store.remove(created.id);
  assert.equal(removed.id, created.id);
  assert.deepEqual(await store.getAll(), []);
});

test('reorders snippets and rejects incomplete order data', async (t) => {
  const { store } = await temporaryStore(t);
  const first = await store.create({ title: 'A', code: 'a' });
  const second = await store.create({ title: 'B', code: 'b' });
  const reordered = await store.reorder([second.id, first.id]);
  assert.deepEqual(reordered.map((item) => item.id), [second.id, first.id]);
  await assert.rejects(() => store.reorder([first.id]), StoreError);
});

test('serializes concurrent writes without losing snippets', async (t) => {
  const { store } = await temporaryStore(t);
  await Promise.all(
    Array.from({ length: 12 }, (_, index) => store.create({ title: `项目 ${index}`, code: `${index}` })),
  );
  assert.equal((await store.getAll()).length, 12);
});

test('validates required title and field size', async (t) => {
  const { store } = await temporaryStore(t);
  await assert.rejects(() => store.create({ title: '', code: '' }), /标题不能为空/);
  await assert.rejects(() => store.create({ title: 'A'.repeat(101), code: '' }), /100/);
});
