const elements = {
  list: document.querySelector('#admin-list'),
  form: document.querySelector('#editor-form'),
  empty: document.querySelector('#editor-empty'),
  heading: document.querySelector('#editor-heading'),
  title: document.querySelector('#title-input'),
  language: document.querySelector('#language-input'),
  description: document.querySelector('#description-input'),
  code: document.querySelector('#code-input'),
  lineCount: document.querySelector('#line-count'),
  deleteButton: document.querySelector('#delete-button'),
  addButton: document.querySelector('#add-button'),
  emptyAddButton: document.querySelector('#empty-add-button'),
  saveState: document.querySelector('#save-state'),
  previewLink: document.querySelector('#preview-link'),
  toast: document.querySelector('#toast'),
};

const state = { snippets: [], selectedId: null, creating: false, toastTimer: null };

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}

function showToast(message, type = 'success') {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.dataset.type = type;
  elements.toast.classList.add('show');
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2400);
}

function lineCount(code) {
  return code ? code.split('\n').length : 0;
}

function updateLineCount() {
  elements.lineCount.textContent = `${lineCount(elements.code.value)} 行`;
}

function renderList() {
  elements.list.replaceChildren();
  if (!state.snippets.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-list-empty';
    empty.textContent = '暂无代码内容';
    elements.list.append(empty);
    return;
  }

  state.snippets.forEach((snippet, index) => {
    const row = document.createElement('div');
    row.className = 'admin-list-row';
    if (snippet.id === state.selectedId) row.classList.add('active');

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'admin-list-select';
    const number = document.createElement('span');
    number.className = 'admin-item-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = snippet.title;
    const meta = document.createElement('small');
    meta.textContent = `${snippet.language || '无标签'} · ${lineCount(snippet.code)} 行`;
    copy.append(title, meta);
    select.append(number, copy);
    select.addEventListener('click', () => selectSnippet(snippet.id));

    const order = document.createElement('span');
    order.className = 'order-buttons';
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.title = '上移';
    up.disabled = index === 0;
    up.addEventListener('click', () => moveSnippet(index, -1));
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.title = '下移';
    down.disabled = index === state.snippets.length - 1;
    down.addEventListener('click', () => moveSnippet(index, 1));
    order.append(up, down);
    row.append(select, order);
    elements.list.append(row);
  });
}

function setEditorVisible(visible) {
  elements.form.classList.toggle('is-hidden', !visible);
  elements.empty.classList.toggle('is-hidden', visible);
}

function selectSnippet(id) {
  const snippet = state.snippets.find((item) => item.id === id);
  if (!snippet) return;
  state.selectedId = id;
  state.creating = false;
  elements.heading.textContent = '编辑代码';
  elements.title.value = snippet.title;
  elements.language.value = snippet.language;
  elements.description.value = snippet.description;
  elements.code.value = snippet.code;
  elements.deleteButton.classList.remove('is-hidden');
  elements.previewLink.href = `/?id=${encodeURIComponent(id)}`;
  setEditorVisible(true);
  updateLineCount();
  renderList();
}

function newSnippet() {
  state.selectedId = null;
  state.creating = true;
  elements.heading.textContent = '新建代码';
  elements.form.reset();
  elements.deleteButton.classList.add('is-hidden');
  elements.previewLink.href = '/';
  setEditorVisible(true);
  updateLineCount();
  renderList();
  elements.title.focus();
}

async function moveSnippet(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.snippets.length) return;
  const previous = [...state.snippets];
  [state.snippets[index], state.snippets[target]] = [state.snippets[target], state.snippets[index]];
  renderList();
  try {
    const data = await api('/api/snippets/order', {
      method: 'PUT',
      body: JSON.stringify({ ids: state.snippets.map((item) => item.id) }),
    });
    state.snippets = data.snippets;
    showToast('顺序已更新');
  } catch (error) {
    state.snippets = previous;
    renderList();
    showToast(error.message, 'error');
  }
}

async function loadSnippets() {
  try {
    const data = await api('/api/snippets');
    state.snippets = data.snippets;
    renderList();
    if (state.snippets.length) selectSnippet(state.snippets[0].id);
    else setEditorVisible(false);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    title: elements.title.value,
    language: elements.language.value,
    description: elements.description.value,
    code: elements.code.value,
  };
  const isNew = state.creating;
  const url = isNew ? '/api/snippets' : `/api/snippets/${encodeURIComponent(state.selectedId)}`;
  elements.saveState.textContent = '正在保存…';
  try {
    const data = await api(url, { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(payload) });
    if (isNew) state.snippets.push(data.snippet);
    else {
      const index = state.snippets.findIndex((item) => item.id === state.selectedId);
      state.snippets[index] = data.snippet;
    }
    selectSnippet(data.snippet.id);
    elements.saveState.textContent = '已保存到 JSON 文件';
    showToast(isNew ? '代码已创建' : '更改已保存');
  } catch (error) {
    elements.saveState.textContent = '保存失败';
    showToast(error.message, 'error');
  }
});

elements.deleteButton.addEventListener('click', async () => {
  const snippet = state.snippets.find((item) => item.id === state.selectedId);
  if (!snippet || !window.confirm(`确定删除“${snippet.title}”吗？此操作无法撤销。`)) return;
  try {
    await api(`/api/snippets/${encodeURIComponent(snippet.id)}`, { method: 'DELETE' });
    const index = state.snippets.findIndex((item) => item.id === snippet.id);
    state.snippets.splice(index, 1);
    state.selectedId = null;
    renderList();
    if (state.snippets.length) selectSnippet(state.snippets[Math.min(index, state.snippets.length - 1)].id);
    else setEditorVisible(false);
    showToast('代码已删除');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

elements.addButton.addEventListener('click', newSnippet);
elements.emptyAddButton.addEventListener('click', newSnippet);
elements.code.addEventListener('input', updateLineCount);
loadSnippets();

