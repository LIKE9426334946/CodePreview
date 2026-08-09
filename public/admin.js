const elements = {
  directoryList: document.querySelector('#directory-list'),
  addDirectoryButton: document.querySelector('#add-directory-button'),
  directorySortButton: document.querySelector('#directory-sort-button'),
  codeListTitle: document.querySelector('#code-list-title'),
  list: document.querySelector('#admin-list'),
  snippetSortButton: document.querySelector('#snippet-sort-button'),
  form: document.querySelector('#editor-form'),
  empty: document.querySelector('#editor-empty'),
  emptyTitle: document.querySelector('#empty-title'),
  emptyDescription: document.querySelector('#empty-description'),
  heading: document.querySelector('#editor-heading'),
  title: document.querySelector('#title-input'),
  directory: document.querySelector('#directory-input'),
  language: document.querySelector('#language-input'),
  description: document.querySelector('#description-input'),
  code: document.querySelector('#code-input'),
  lineCount: document.querySelector('#line-count'),
  deleteButton: document.querySelector('#delete-button'),
  addButton: document.querySelector('#add-button'),
  emptyAddButton: document.querySelector('#empty-add-button'),
  saveState: document.querySelector('#save-state'),
  previewLink: document.querySelector('#preview-link'),
  moveDialog: document.querySelector('#move-dialog'),
  moveForm: document.querySelector('#move-form'),
  moveDescription: document.querySelector('#move-description'),
  moveDirectory: document.querySelector('#move-directory-select'),
  cancelMoveButton: document.querySelector('#cancel-move-button'),
  confirmMoveButton: document.querySelector('#confirm-move-button'),
  toast: document.querySelector('#toast'),
};

const state = {
  directories: [],
  snippets: [],
  selectedDirectoryId: null,
  selectedId: null,
  creating: false,
  directorySortMode: false,
  snippetSortMode: false,
  draggingType: null,
  moveSnippetId: null,
  sortSaving: false,
  toastTimer: null,
};

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

function currentDirectory() {
  return state.directories.find((directory) => directory.id === state.selectedDirectoryId);
}

function currentSnippets() {
  return state.snippets.filter((snippet) => snippet.directoryId === state.selectedDirectoryId);
}

function updateLineCount() {
  elements.lineCount.textContent = `${lineCount(elements.code.value)} 行`;
}

function renderDirectoryOptions(selectedId = state.selectedDirectoryId) {
  elements.directory.replaceChildren();
  state.directories.forEach((directory) => {
    const option = document.createElement('option');
    option.value = directory.id;
    option.textContent = directory.name;
    option.selected = directory.id === selectedId;
    elements.directory.append(option);
  });
}

function directoryActionButton(label, title, onClick, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function createDragHandle(title) {
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';
  handle.title = title;
  handle.setAttribute('aria-hidden', 'true');
  return handle;
}

function updateSortControls() {
  elements.directorySortButton.textContent = state.directorySortMode ? '✓ 完成' : '⇅ 排序';
  elements.directorySortButton.classList.toggle('active', state.directorySortMode);
  elements.directorySortButton.disabled = state.sortSaving || state.directories.length < 2;
  elements.snippetSortButton.textContent = state.snippetSortMode ? '✓ 完成' : '⇅ 排序';
  elements.snippetSortButton.classList.toggle('active', state.snippetSortMode);
  elements.snippetSortButton.disabled = state.sortSaving || currentSnippets().length < 2;
  elements.addDirectoryButton.disabled = state.directorySortMode || state.sortSaving;
  elements.addButton.disabled = !currentDirectory() || state.snippetSortMode || state.sortSaving;
}

function makeSortable(row, type, id, enabled) {
  row.draggable = enabled;
  row.classList.toggle('sortable-row', enabled);
  if (!enabled) return;
  row.addEventListener('dragstart', (event) => {
    state.draggingType = type;
    row.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    state.draggingType = null;
  });
}

function renderDirectories() {
  elements.directoryList.replaceChildren();
  if (!state.directories.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-list-empty directory-empty';
    empty.textContent = '暂无目录';
    elements.directoryList.append(empty);
    updateSortControls();
    return;
  }

  state.directories.forEach((directory) => {
    const row = document.createElement('div');
    row.className = 'directory-admin-row';
    row.dataset.directoryId = directory.id;
    if (directory.id === state.selectedDirectoryId) row.classList.add('active');
    makeSortable(row, 'directory', directory.id, state.directorySortMode);

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'directory-admin-select';
    const icon = document.createElement('span');
    icon.className = 'folder-icon';
    icon.textContent = '▱';
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = directory.name;
    const count = document.createElement('small');
    count.textContent = `${state.snippets.filter((item) => item.directoryId === directory.id).length} 段代码`;
    copy.append(name, count);
    select.append(icon, copy);
    select.addEventListener('click', () => {
      if (!state.directorySortMode) selectDirectory(directory.id);
    });

    const actions = document.createElement('span');
    actions.className = 'directory-actions';
    if (state.directorySortMode) {
      actions.append(createDragHandle('拖动目录调整顺序'));
    } else {
      actions.append(
        directoryActionButton('✎', '重命名目录', () => renameDirectory(directory)),
        directoryActionButton('×', '删除目录', () => deleteDirectory(directory)),
      );
    }
    row.append(select, actions);
    elements.directoryList.append(row);
  });
  updateSortControls();
}

function renderList() {
  const snippets = currentSnippets();
  elements.list.replaceChildren();
  const directory = currentDirectory();
  elements.codeListTitle.textContent = directory ? directory.name : '代码库';
  updateSortControls();

  if (!directory || !snippets.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-list-empty';
    empty.textContent = directory ? '目录中暂无代码' : '请先选择目录';
    elements.list.append(empty);
    return;
  }

  snippets.forEach((snippet, index) => {
    const row = document.createElement('div');
    row.className = 'admin-list-row';
    row.dataset.snippetId = snippet.id;
    if (snippet.id === state.selectedId) row.classList.add('active');
    makeSortable(row, 'snippet', snippet.id, state.snippetSortMode);

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
    select.addEventListener('click', () => {
      if (!state.snippetSortMode) selectSnippet(snippet.id);
    });

    const actions = document.createElement('span');
    actions.className = 'code-item-actions';
    if (state.snippetSortMode) {
      actions.append(createDragHandle('拖动代码调整顺序'));
    } else {
      const moveButton = directoryActionButton('移动', '移动到其他目录', () => openMoveDialog(snippet));
      moveButton.className = 'move-code-button';
      moveButton.disabled = state.directories.length < 2;
      actions.append(moveButton);
    }
    row.append(select, actions);
    elements.list.append(row);
  });
  updateSortControls();
}

function setEditorVisible(visible) {
  elements.form.classList.toggle('is-hidden', !visible);
  elements.empty.classList.toggle('is-hidden', visible);
}

function showEmptyEditor() {
  setEditorVisible(false);
  const directory = currentDirectory();
  if (!state.directories.length) {
    elements.emptyTitle.textContent = '请先创建一个目录';
    elements.emptyDescription.textContent = '目录创建完成后，才能在目录下面添加代码。';
    elements.emptyAddButton.textContent = '新建目录';
  } else if (directory) {
    elements.emptyTitle.textContent = `“${directory.name}”中还没有代码`;
    elements.emptyDescription.textContent = '创建第一段代码后，手机端就可以从这个目录进入学习。';
    elements.emptyAddButton.textContent = '创建第一段代码';
  } else {
    elements.emptyTitle.textContent = '请选择一个目录';
    elements.emptyDescription.textContent = '选择目录后可以查看和管理其中的代码。';
    elements.emptyAddButton.textContent = '选择第一个目录';
  }
}

function selectDirectory(id, { selectFirst = true } = {}) {
  if (!state.directories.some((directory) => directory.id === id)) return;
  state.snippetSortMode = false;
  state.selectedDirectoryId = id;
  state.creating = false;
  state.selectedId = null;
  renderDirectories();
  renderList();
  renderDirectoryOptions(id);
  const first = currentSnippets()[0];
  if (selectFirst && first) selectSnippet(first.id);
  else showEmptyEditor();
}

function selectSnippet(id) {
  const snippet = state.snippets.find((item) => item.id === id);
  if (!snippet) return;
  state.selectedDirectoryId = snippet.directoryId;
  state.selectedId = id;
  state.creating = false;
  elements.heading.textContent = '编辑代码';
  elements.title.value = snippet.title;
  elements.language.value = snippet.language;
  elements.description.value = snippet.description;
  elements.code.value = snippet.code;
  elements.deleteButton.classList.remove('is-hidden');
  elements.previewLink.href = `/?id=${encodeURIComponent(id)}`;
  renderDirectoryOptions(snippet.directoryId);
  setEditorVisible(true);
  updateLineCount();
  renderDirectories();
  renderList();
}

function newSnippet() {
  if (!currentDirectory()) {
    showToast('请先创建并选择一个目录', 'error');
    return;
  }
  state.selectedId = null;
  state.creating = true;
  elements.heading.textContent = '新建代码';
  elements.form.reset();
  renderDirectoryOptions(state.selectedDirectoryId);
  elements.deleteButton.classList.add('is-hidden');
  elements.previewLink.href = '/';
  setEditorVisible(true);
  updateLineCount();
  renderList();
  elements.title.focus();
}

async function addDirectory() {
  const name = window.prompt('请输入目录名称：');
  if (name === null) return;
  try {
    const data = await api('/api/directories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    state.directories.push(data.directory);
    selectDirectory(data.directory.id, { selectFirst: false });
    showToast('目录已创建');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function renameDirectory(directory) {
  const name = window.prompt('请输入新的目录名称：', directory.name);
  if (name === null || name === directory.name) return;
  try {
    const data = await api(`/api/directories/${encodeURIComponent(directory.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
    const index = state.directories.findIndex((item) => item.id === directory.id);
    state.directories[index] = data.directory;
    renderDirectories();
    renderList();
    renderDirectoryOptions(elements.directory.value);
    showToast('目录名称已更新');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteDirectory(directory) {
  const count = state.snippets.filter((snippet) => snippet.directoryId === directory.id).length;
  const message = count
    ? `确定删除“${directory.name}”及其中的 ${count} 段代码吗？此操作无法撤销。`
    : `确定删除空目录“${directory.name}”吗？`;
  if (!window.confirm(message)) return;
  try {
    await api(`/api/directories/${encodeURIComponent(directory.id)}`, { method: 'DELETE' });
    const index = state.directories.findIndex((item) => item.id === directory.id);
    state.directories.splice(index, 1);
    state.snippets = state.snippets.filter((snippet) => snippet.directoryId !== directory.id);
    state.selectedId = null;
    const next = state.directories[Math.min(index, state.directories.length - 1)];
    state.selectedDirectoryId = next?.id || null;
    renderDirectories();
    renderList();
    if (next) selectDirectory(next.id);
    else showEmptyEditor();
    showToast(count ? `目录和 ${count} 段代码已删除` : '目录已删除');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function toggleDirectorySort() {
  if (state.directories.length < 2 || state.sortSaving) return;
  state.directorySortMode = !state.directorySortMode;
  if (state.directorySortMode) state.snippetSortMode = false;
  renderDirectories();
  renderList();
}

function toggleSnippetSort() {
  if (currentSnippets().length < 2 || state.sortSaving) return;
  state.snippetSortMode = !state.snippetSortMode;
  if (state.snippetSortMode) state.directorySortMode = false;
  renderDirectories();
  renderList();
}

function dragAfterElement(container, pointerY, selector) {
  return [...container.querySelectorAll(`${selector}:not(.dragging)`)].reduce(
    (closest, element) => {
      const box = element.getBoundingClientRect();
      const offset = pointerY - box.top - (box.height / 2);
      return offset < 0 && offset > closest.offset ? { offset, element } : closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element;
}

function handleSortDragOver(event, type, container, selector) {
  if (state.draggingType !== type || state.sortSaving) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const dragging = container.querySelector('.dragging');
  if (!dragging) return;
  const after = dragAfterElement(container, event.clientY, selector);
  container.insertBefore(dragging, after);
}

async function persistDirectoryOrder() {
  if (state.sortSaving) return;
  const ids = [...elements.directoryList.querySelectorAll('[data-directory-id]')]
    .map((row) => row.dataset.directoryId);
  const currentIds = state.directories.map((directory) => directory.id);
  if (ids.join('|') === currentIds.join('|')) return;
  const previous = [...state.directories];
  state.sortSaving = true;
  updateSortControls();
  try {
    const data = await api('/api/directories/order', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    });
    state.directories = data.directories;
    showToast('目录顺序已保存，手机端会同步显示');
  } catch (error) {
    state.directories = previous;
    showToast(error.message, 'error');
  } finally {
    state.sortSaving = false;
    renderDirectories();
    renderList();
  }
}

async function persistSnippetOrder() {
  if (state.sortSaving || !state.selectedDirectoryId) return;
  const directoryId = state.selectedDirectoryId;
  const ids = [...elements.list.querySelectorAll('[data-snippet-id]')]
    .map((row) => row.dataset.snippetId);
  const currentIds = currentSnippets().map((snippet) => snippet.id);
  if (ids.join('|') === currentIds.join('|')) return;
  const previous = [...state.snippets];
  state.sortSaving = true;
  updateSortControls();
  try {
    const data = await api('/api/snippets/order', {
      method: 'PUT',
      body: JSON.stringify({ directoryId, ids }),
    });
    let orderedIndex = 0;
    state.snippets = state.snippets.map((snippet) => (
      snippet.directoryId === directoryId ? data.snippets[orderedIndex++] : snippet
    ));
    showToast('代码顺序已保存，手机端会同步显示');
  } catch (error) {
    state.snippets = previous;
    showToast(error.message, 'error');
  } finally {
    state.sortSaving = false;
    renderList();
  }
}

function openMoveDialog(snippet) {
  const targets = state.directories.filter((directory) => directory.id !== snippet.directoryId);
  if (!targets.length) {
    showToast('请先创建另一个目录', 'error');
    return;
  }
  state.moveSnippetId = snippet.id;
  elements.moveDescription.textContent = `将“${snippet.title}”移动到：`;
  elements.moveDirectory.replaceChildren();
  targets.forEach((directory) => {
    const option = document.createElement('option');
    option.value = directory.id;
    option.textContent = directory.name;
    elements.moveDirectory.append(option);
  });
  elements.moveDialog.showModal();
  elements.moveDirectory.focus();
}

function closeMoveDialog() {
  state.moveSnippetId = null;
  if (elements.moveDialog.open) elements.moveDialog.close();
}

async function submitSnippetMove(event) {
  event.preventDefault();
  const snippet = state.snippets.find((item) => item.id === state.moveSnippetId);
  const target = state.directories.find((directory) => directory.id === elements.moveDirectory.value);
  if (!snippet || !target) return;
  const sourceIndex = currentSnippets().findIndex((item) => item.id === snippet.id);
  elements.confirmMoveButton.disabled = true;
  try {
    const data = await api(`/api/snippets/${encodeURIComponent(snippet.id)}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ directoryId: target.id }),
    });
    state.snippets = data.snippets;
    closeMoveDialog();
    renderDirectories();
    if (state.selectedId === snippet.id) {
      state.selectedId = null;
      const remaining = currentSnippets();
      if (remaining.length) selectSnippet(remaining[Math.min(sourceIndex, remaining.length - 1)].id);
      else {
        renderList();
        showEmptyEditor();
      }
    } else {
      renderList();
    }
    showToast(`已移动到“${target.name}”，并排在目录末尾`);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    elements.confirmMoveButton.disabled = false;
  }
}

async function loadLibrary() {
  try {
    const data = await api('/api/library');
    state.directories = data.directories;
    state.snippets = data.snippets;
    if (state.directories.length) selectDirectory(state.directories[0].id);
    else {
      renderDirectories();
      renderList();
      showEmptyEditor();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    title: elements.title.value,
    directoryId: elements.directory.value,
    language: elements.language.value,
    description: elements.description.value,
    code: elements.code.value,
  };
  const isNew = state.creating;
  const previousDirectoryId = state.snippets.find((item) => item.id === state.selectedId)?.directoryId;
  const url = isNew ? '/api/snippets' : `/api/snippets/${encodeURIComponent(state.selectedId)}`;
  elements.saveState.textContent = '正在保存…';
  try {
    const data = await api(url, { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(payload) });
    if (isNew) state.snippets.push(data.snippet);
    else if (previousDirectoryId !== data.snippet.directoryId) {
      state.snippets = state.snippets.filter((item) => item.id !== data.snippet.id);
      state.snippets.push(data.snippet);
    }
    else {
      const index = state.snippets.findIndex((item) => item.id === state.selectedId);
      state.snippets[index] = data.snippet;
    }
    state.selectedDirectoryId = data.snippet.directoryId;
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
    const directoryId = snippet.directoryId;
    const index = currentSnippets().findIndex((item) => item.id === snippet.id);
    state.snippets = state.snippets.filter((item) => item.id !== snippet.id);
    state.selectedId = null;
    const remaining = state.snippets.filter((item) => item.directoryId === directoryId);
    renderDirectories();
    renderList();
    if (remaining.length) selectSnippet(remaining[Math.min(index, remaining.length - 1)].id);
    else showEmptyEditor();
    showToast('代码已删除');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

elements.addDirectoryButton.addEventListener('click', addDirectory);
elements.directorySortButton.addEventListener('click', toggleDirectorySort);
elements.addButton.addEventListener('click', newSnippet);
elements.snippetSortButton.addEventListener('click', toggleSnippetSort);
elements.directoryList.addEventListener('dragover', (event) => {
  handleSortDragOver(event, 'directory', elements.directoryList, '.directory-admin-row');
});
elements.directoryList.addEventListener('drop', (event) => {
  if (state.draggingType !== 'directory') return;
  event.preventDefault();
  persistDirectoryOrder();
});
elements.list.addEventListener('dragover', (event) => {
  handleSortDragOver(event, 'snippet', elements.list, '.admin-list-row');
});
elements.list.addEventListener('drop', (event) => {
  if (state.draggingType !== 'snippet') return;
  event.preventDefault();
  persistSnippetOrder();
});
elements.moveForm.addEventListener('submit', submitSnippetMove);
elements.cancelMoveButton.addEventListener('click', closeMoveDialog);
elements.moveDialog.addEventListener('cancel', () => {
  state.moveSnippetId = null;
});
elements.emptyAddButton.addEventListener('click', () => {
  if (!state.directories.length) addDirectory();
  else if (currentDirectory()) newSnippet();
  else selectDirectory(state.directories[0].id);
});
elements.code.addEventListener('input', updateLineCount);
loadLibrary();
