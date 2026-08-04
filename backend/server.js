const path = require('node:path');
const express = require('express');
const { createJsonStore, StoreError } = require('./store');

const DEFAULT_DATA_FILE = path.join(__dirname, 'data', 'snippets.json');
const DEFAULT_PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp({ dataFile = DEFAULT_DATA_FILE, publicDir = DEFAULT_PUBLIC_DIR } = {}) {
  const app = express();
  const store = createJsonStore(dataFile);

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'CodePreview' });
  });

  app.get('/api/library', async (_request, response, next) => {
    try {
      response.json(await store.getLibrary());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/directories', async (_request, response, next) => {
    try {
      response.json({ directories: await store.getDirectories() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/directories', async (request, response, next) => {
    try {
      response.status(201).json({ directory: await store.createDirectory(request.body) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/directories/order', async (request, response, next) => {
    try {
      response.json({ directories: await store.reorderDirectories(request.body.ids) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/directories/:id', async (request, response, next) => {
    try {
      response.json({ directory: await store.updateDirectory(request.params.id, request.body) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/directories/:id', async (request, response, next) => {
    try {
      response.json(await store.removeDirectory(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/snippets', async (_request, response, next) => {
    try {
      response.json({ snippets: await store.getAll() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/snippets/:id', async (request, response, next) => {
    try {
      response.json({ snippet: await store.getById(request.params.id) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/snippets', async (request, response, next) => {
    try {
      response.status(201).json({ snippet: await store.create(request.body) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/snippets/order', async (request, response, next) => {
    try {
      response.json({
        snippets: await store.reorder(request.body.directoryId, request.body.ids),
      });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/snippets/:id', async (request, response, next) => {
    try {
      response.json({ snippet: await store.update(request.params.id, request.body) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/snippets/:id', async (request, response, next) => {
    try {
      response.json({ snippet: await store.remove(request.params.id) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/admin', (_request, response) => {
    response.sendFile(path.join(publicDir, 'admin.html'));
  });
  app.use(express.static(publicDir, { extensions: ['html'], maxAge: '1h' }));

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: '接口不存在', code: 'NOT_FOUND' });
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && error.type === 'entity.parse.failed') {
      response.status(400).json({ error: '请求中的 JSON 格式不正确', code: 'INVALID_JSON' });
      return;
    }
    const status = error instanceof StoreError ? error.status : 500;
    if (status >= 500) console.error(error);
    response.status(status).json({
      error: status >= 500 && !(error instanceof StoreError) ? '服务器内部错误' : error.message,
      code: error.code || 'INTERNAL_ERROR',
    });
  });

  return app;
}

function start() {
  const port = Number.parseInt(process.env.PORT || '3022', 10);
  const host = process.env.HOST || '127.0.0.1';
  const app = createApp({ dataFile: process.env.DATA_FILE || DEFAULT_DATA_FILE });
  app.listen(port, host, () => {
    console.log(`CodePreview is listening on http://${host}:${port}`);
  });
}

if (require.main === module) start();

module.exports = { createApp, start };
