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

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  return { response, data: await response.json() };
}

test('health endpoint reports the service status', async (t) => {
  const baseUrl = await testServer(t);
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'CodePreview' });
});

test('directory and snippet APIs support the full management flow', async (t) => {
  const baseUrl = await testServer(t);
  const createdDirectory = await jsonRequest(`${baseUrl}/api/directories`, {
    method: 'POST',
    body: JSON.stringify({ name: '练习' }),
  });
  assert.equal(createdDirectory.response.status, 201);
  const { directory } = createdDirectory.data;

  const createdSnippet = await jsonRequest(`${baseUrl}/api/snippets`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Hello',
      directoryId: directory.id,
      language: 'JavaScript',
      code: 'const ok = true;',
    }),
  });
  assert.equal(createdSnippet.response.status, 201);
  const { snippet } = createdSnippet.data;

  const library = await (await fetch(`${baseUrl}/api/library`)).json();
  assert.equal(library.version, 3);
  assert.equal(library.directories.length, 1);
  assert.equal(library.snippets.length, 1);
  assert.equal(library.snippets[0].directoryId, directory.id);
  assert.equal(library.snippets[0].reviewed, false);

  const reviewed = await jsonRequest(`${baseUrl}/api/snippets/${snippet.id}/reviewed`, {
    method: 'PATCH',
    body: JSON.stringify({ reviewed: true }),
  });
  assert.equal(reviewed.response.status, 200);
  assert.equal(reviewed.data.snippet.reviewed, true);
  const persistedLibrary = await (await fetch(`${baseUrl}/api/library`)).json();
  assert.equal(persistedLibrary.snippets[0].reviewed, true);

  const unreviewed = await jsonRequest(`${baseUrl}/api/snippets/${snippet.id}/reviewed`, {
    method: 'PATCH',
    body: JSON.stringify({ reviewed: false }),
  });
  assert.equal(unreviewed.data.snippet.reviewed, false);

  const updated = await jsonRequest(`${baseUrl}/api/snippets/${snippet.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...snippet, title: 'Updated' }),
  });
  assert.equal(updated.data.snippet.title, 'Updated');

  const deletedDirectory = await jsonRequest(`${baseUrl}/api/directories/${directory.id}`, {
    method: 'DELETE',
  });
  assert.equal(deletedDirectory.data.deletedSnippetCount, 1);
  const emptyLibrary = await (await fetch(`${baseUrl}/api/library`)).json();
  assert.deepEqual(emptyLibrary.directories, []);
  assert.deepEqual(emptyLibrary.snippets, []);
});

test('directory order and per-directory snippet order endpoints work', async (t) => {
  const baseUrl = await testServer(t);
  const firstDirectory = (await jsonRequest(`${baseUrl}/api/directories`, {
    method: 'POST',
    body: JSON.stringify({ name: 'A' }),
  })).data.directory;
  const secondDirectory = (await jsonRequest(`${baseUrl}/api/directories`, {
    method: 'POST',
    body: JSON.stringify({ name: 'B' }),
  })).data.directory;
  const firstSnippet = (await jsonRequest(`${baseUrl}/api/snippets`, {
    method: 'POST',
    body: JSON.stringify({ title: 'A1', directoryId: firstDirectory.id, code: '1' }),
  })).data.snippet;
  const secondSnippet = (await jsonRequest(`${baseUrl}/api/snippets`, {
    method: 'POST',
    body: JSON.stringify({ title: 'A2', directoryId: firstDirectory.id, code: '2' }),
  })).data.snippet;

  const directoryOrder = await jsonRequest(`${baseUrl}/api/directories/order`, {
    method: 'PUT',
    body: JSON.stringify({ ids: [secondDirectory.id, firstDirectory.id] }),
  });
  assert.deepEqual(
    directoryOrder.data.directories.map((item) => item.id),
    [secondDirectory.id, firstDirectory.id],
  );

  const snippetOrder = await jsonRequest(`${baseUrl}/api/snippets/order`, {
    method: 'PUT',
    body: JSON.stringify({
      directoryId: firstDirectory.id,
      ids: [secondSnippet.id, firstSnippet.id],
    }),
  });
  assert.deepEqual(
    snippetOrder.data.snippets.map((item) => item.id),
    [secondSnippet.id, firstSnippet.id],
  );

  await jsonRequest(`${baseUrl}/api/snippets/${firstSnippet.id}/reviewed`, {
    method: 'PATCH',
    body: JSON.stringify({ reviewed: true }),
  });
  const moved = await jsonRequest(`${baseUrl}/api/snippets/${firstSnippet.id}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ directoryId: secondDirectory.id }),
  });
  assert.equal(moved.response.status, 200);
  assert.equal(moved.data.snippet.directoryId, secondDirectory.id);
  assert.equal(moved.data.snippet.reviewed, true);
  assert.deepEqual(
    moved.data.snippets.filter((item) => item.directoryId === firstDirectory.id).map((item) => item.id),
    [secondSnippet.id],
  );
  assert.deepEqual(
    moved.data.snippets.filter((item) => item.directoryId === secondDirectory.id).map((item) => item.id),
    [firstSnippet.id],
  );
});

test('serves viewer and management pages without a mobile admin entry', async (t) => {
  const baseUrl = await testServer(t);
  const viewerResponse = await fetch(baseUrl);
  const adminResponse = await fetch(`${baseUrl}/admin`);
  const adminScriptResponse = await fetch(`${baseUrl}/admin.js?v=admin-drag-sort-1`);
  const viewerScriptResponse = await fetch(`${baseUrl}/viewer.js?v=incremental-line-reveal-1`);
  const viewerStylesResponse = await fetch(`${baseUrl}/styles.css?v=incremental-line-reveal-1`);
  const viewer = await viewerResponse.text();
  const admin = await adminResponse.text();
  const adminScript = await adminScriptResponse.text();
  const viewerScript = await viewerScriptResponse.text();
  const viewerStyles = await viewerStylesResponse.text();
  assert.match(viewer, /CodePreview/);
  assert.doesNotMatch(viewer, /在电脑端管理/);
  assert.match(admin, /目录/);
  assert.match(admin, /代码管理/);
  assert.match(admin, /admin\.js\?v=admin-drag-sort-1/);
  assert.match(admin, /id="directory-sort-button"/);
  assert.match(admin, /id="snippet-sort-button"/);
  assert.match(admin, /id="move-dialog"/);
  assert.doesNotMatch(admin, /使用箭头调整显示顺序/);
  assert.match(adminScript, /row\.draggable = enabled/);
  assert.match(adminScript, /\/api\/snippets\/\$\{encodeURIComponent\(snippet\.id\)\}\/move/);
  assert.doesNotMatch(adminScript, /function moveDirectory\(/);
  assert.doesNotMatch(adminScript, /function moveSnippet\(/);
  assert.match(viewer, /viewer\.js\?v=incremental-line-reveal-1/);
  assert.doesNotMatch(viewer, /id="fullscreen-button"/);
  assert.doesNotMatch(viewer, /id="play-label"/);
  assert.ok(
    viewer.indexOf('class="viewer-controls"') < viewer.indexOf('class="code-workspace"'),
    '播放控制栏应位于代码区域上方',
  );
  assert.match(viewer, /id="play-button"[^>]*aria-label="自动播放"[^>]*>/);
  assert.match(viewer, /<option value="1800" selected>1×<\/option>/);
  assert.match(viewerScript, /className = 'review-toggle'/);
  assert.match(viewerScript, /method: 'PATCH'/);
  assert.match(viewerScript, /aria-pressed/);
  assert.match(viewerStyles, /\.review-toggle\.reviewed/);
  assert.match(viewerStyles, /width: 28px/);
  assert.match(viewerScript, /function createCodeLine\(line, reveal\)/);
  assert.match(viewerScript, /item\.classList\.add\('revealing-line'\)/);
  assert.match(viewerScript, /for \(let index = elements\.lines\.children\.length; index < targetCount/);
  assert.doesNotMatch(viewerStyles, /\.code-lines li \{[^}]*animation:/s);
  assert.match(viewerStyles, /\.code-lines li\.revealing-line \{[^}]*animation: reveal-line/s);
  assert.match(adminResponse.headers.get('cache-control'), /no-store/);
});

test('rejects an invalid reviewed value and migrates old snippets to unreviewed', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codepreview-migration-'));
  const dataFile = path.join(directory, 'snippets.json');
  await fs.writeFile(dataFile, JSON.stringify({
    version: 2,
    directories: [{ id: 'd1', name: '旧目录' }],
    snippets: [{ id: 's1', title: '旧代码', directoryId: 'd1', code: '1' }],
  }), 'utf8');
  const app = createApp({ dataFile });
  const server = await new Promise((resolve) => {
    const running = app.listen(0, '127.0.0.1', () => resolve(running));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const migrated = await (await fetch(`${baseUrl}/api/library`)).json();
  assert.equal(migrated.version, 3);
  assert.equal(migrated.snippets[0].reviewed, false);

  const invalid = await jsonRequest(`${baseUrl}/api/snippets/s1/reviewed`, {
    method: 'PATCH',
    body: JSON.stringify({ reviewed: 'yes' }),
  });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.data.error, /布尔值/);
});

test('prevents stale scripts and API data from being cached', async (t) => {
  const baseUrl = await testServer(t);
  const scriptResponse = await fetch(`${baseUrl}/admin.js?v=admin-drag-sort-1`);
  const apiResponse = await fetch(`${baseUrl}/api/library`);
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get('cache-control'), /no-cache/);
  assert.match(scriptResponse.headers.get('cache-control'), /no-store/);
  assert.equal(apiResponse.headers.get('cache-control'), 'no-store');
});
