const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('../backend/server');

async function testServer(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codepreview-api-'));
  const app = createApp({ dataFile: path.join(directory, 'snippets.json') });
  const server = await new Promise((resolve) => {
    const running = app.listen(0, '127.0.0.1', () => resolve(running));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test('health endpoint reports the service status', async (t) => {
  const baseUrl = await testServer(t);
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'CodePreview' });
});

test('snippet API supports the full management flow', async (t) => {
  const baseUrl = await testServer(t);
  const createResponse = await fetch(`${baseUrl}/api/snippets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Hello', language: 'JavaScript', code: 'const ok = true;' }),
  });
  assert.equal(createResponse.status, 201);
  const { snippet } = await createResponse.json();

  const listResponse = await fetch(`${baseUrl}/api/snippets`);
  assert.equal((await listResponse.json()).snippets.length, 1);

  const updateResponse = await fetch(`${baseUrl}/api/snippets/${snippet.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...snippet, title: 'Updated' }),
  });
  assert.equal((await updateResponse.json()).snippet.title, 'Updated');

  const deleteResponse = await fetch(`${baseUrl}/api/snippets/${snippet.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/snippets`)).json()).snippets, []);
});

test('serves viewer and management pages', async (t) => {
  const baseUrl = await testServer(t);
  const viewer = await (await fetch(baseUrl)).text();
  const admin = await (await fetch(`${baseUrl}/admin`)).text();
  assert.match(viewer, /CodePreview/);
  assert.match(admin, /代码管理/);
});

