const elements = {
  title: document.querySelector('#viewer-title'),
  language: document.querySelector('#viewer-language'),
  description: document.querySelector('#viewer-description'),
  counter: document.querySelector('#line-counter'),
  lines: document.querySelector('#code-lines'),
  empty: document.querySelector('#empty-code'),
  progress: document.querySelector('#progress-fill'),
  scroll: document.querySelector('#code-scroll'),
  panel: document.querySelector('#code-panel'),
  previous: document.querySelector('#previous-button'),
  next: document.querySelector('#next-button'),
  play: document.querySelector('#play-button'),
  playIcon: document.querySelector('#play-icon'),
  playLabel: document.querySelector('#play-label'),
  reset: document.querySelector('#reset-button'),
  speed: document.querySelector('#speed-select'),
  libraryButton: document.querySelector('#library-button'),
  closeLibraryButton: document.querySelector('#close-library-button'),
  directoryBackButton: document.querySelector('#directory-back-button'),
  drawerEyebrow: document.querySelector('#drawer-eyebrow'),
  drawerTitle: document.querySelector('#drawer-title'),
  drawer: document.querySelector('#library-drawer'),
  backdrop: document.querySelector('#drawer-backdrop'),
  list: document.querySelector('#library-list'),
  fullscreen: document.querySelector('#fullscreen-button'),
  toast: document.querySelector('#toast'),
};

const state = {
  directories: [],
  snippets: [],
  current: null,
  currentDirectoryId: null,
  drawerView: 'directories',
  visibleLines: 0,
  timer: null,
  toastTimer: null,
};

function codeLines() {
  if (!state.current || !state.current.code) return [];
  return state.current.code.split('\n');
}

function snippetsInDirectory(directoryId) {
  return state.snippets.filter((snippet) => snippet.directoryId === directoryId);
}

function progressKey(id) {
  return `codepreview:progress:${id}`;
}

function loadProgress(id, total) {
  try {
    const saved = Number.parseInt(localStorage.getItem(progressKey(id)), 10);
    return Number.isInteger(saved) ? Math.min(Math.max(saved, 1), total) : Math.min(1, total);
  } catch {
    return Math.min(1, total);
  }
}

function saveProgress() {
  if (!state.current) return;
  try {
    localStorage.setItem(progressKey(state.current.id), String(state.visibleLines));
  } catch {
    // The viewer still works when browser storage is disabled.
  }
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2200);
}

function setDrawer(open) {
  elements.drawer.classList.toggle('open', open);
  elements.backdrop.classList.toggle('show', open);
  elements.drawer.setAttribute('aria-hidden', String(!open));
}

function createEmptyState(title, description) {
  const empty = document.createElement('div');
  empty.className = 'library-empty';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const copy = document.createElement('span');
  copy.textContent = description;
  empty.append(heading, copy);
  return empty;
}

function renderDirectories() {
  elements.drawerEyebrow.textContent = 'DIRECTORIES';
  elements.drawerTitle.textContent = '目录';
  elements.directoryBackButton.classList.add('is-hidden');
  if (!state.directories.length) {
    elements.list.append(createEmptyState('还没有目录', '目前还没有可学习的内容。'));
    return;
  }

  state.directories.forEach((directory, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'library-item directory-item';
    if (directory.id === state.currentDirectoryId) button.classList.add('active');

    const number = document.createElement('span');
    number.className = 'library-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('span');
    copy.className = 'library-copy';
    const title = document.createElement('strong');
    title.textContent = directory.name;
    const meta = document.createElement('small');
    meta.textContent = `${snippetsInDirectory(directory.id).length} 段代码`;
    const arrow = document.createElement('span');
    arrow.className = 'directory-arrow';
    arrow.textContent = '›';
    copy.append(title, meta);
    button.append(number, copy, arrow);
    button.addEventListener('click', () => selectDirectory(directory.id));
    elements.list.append(button);
  });
}

function renderSnippets() {
  const directory = state.directories.find((item) => item.id === state.currentDirectoryId);
  if (!directory) {
    state.drawerView = 'directories';
    renderDirectories();
    return;
  }
  elements.drawerEyebrow.textContent = 'CODE LIBRARY';
  elements.drawerTitle.textContent = directory.name;
  elements.directoryBackButton.classList.remove('is-hidden');
  const snippets = snippetsInDirectory(directory.id);
  if (!snippets.length) {
    elements.list.append(createEmptyState('目录中还没有代码', '这个目录目前还是空的。'));
    return;
  }

  snippets.forEach((snippet, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'library-item';
    if (snippet.id === state.current?.id) button.classList.add('active');

    const number = document.createElement('span');
    number.className = 'library-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('span');
    copy.className = 'library-copy';
    const title = document.createElement('strong');
    title.textContent = snippet.title;
    const meta = document.createElement('small');
    const count = snippet.code ? snippet.code.split('\n').length : 0;
    meta.textContent = `${snippet.language || '未设置语言'} · ${count} 行`;
    copy.append(title, meta);
    button.append(number, copy);
    button.addEventListener('click', () => selectSnippet(snippet.id));
    elements.list.append(button);
  });
}

function renderLibrary() {
  elements.list.replaceChildren();
  if (state.drawerView === 'snippets') renderSnippets();
  else renderDirectories();
}

function selectDirectory(id) {
  if (!state.directories.some((directory) => directory.id === id)) return;
  state.currentDirectoryId = id;
  state.drawerView = 'snippets';
  renderLibrary();
}

function renderCode({ scroll = true } = {}) {
  const lines = codeLines();
  elements.lines.replaceChildren();
  const fragment = document.createDocumentFragment();

  lines.slice(0, state.visibleLines).forEach((line, index) => {
    const item = document.createElement('li');
    if (index === state.visibleLines - 1) item.className = 'current-line';
    const code = document.createElement('code');
    code.textContent = line || ' ';
    item.append(code);
    fragment.append(item);
  });
  elements.lines.append(fragment);

  const total = lines.length;
  elements.counter.textContent = `${state.visibleLines} / ${total}`;
  elements.progress.style.width = total ? `${(state.visibleLines / total) * 100}%` : '0%';
  elements.empty.classList.toggle('is-hidden', total > 0);

  const hasLines = total > 0;
  elements.previous.disabled = !hasLines || state.visibleLines <= 1;
  elements.next.disabled = !hasLines || state.visibleLines >= total;
  elements.play.disabled = !hasLines;
  elements.reset.disabled = !hasLines || state.visibleLines <= 1;

  if (scroll) {
    requestAnimationFrame(() => {
      const currentLine = elements.lines.querySelector('.current-line');
      currentLine?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
}

function stopPlayback() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
  elements.play.classList.remove('playing');
  elements.playIcon.textContent = '▶';
  elements.playLabel.textContent = '自动播放';
}

function setVisibleLines(value, options) {
  const total = codeLines().length;
  state.visibleLines = Math.min(Math.max(value, Math.min(1, total)), total);
  saveProgress();
  renderCode(options);
}

function nextLine() {
  const total = codeLines().length;
  if (state.visibleLines >= total) {
    stopPlayback();
    showToast('已经显示到最后一行');
    return;
  }
  setVisibleLines(state.visibleLines + 1);
  if (state.visibleLines >= total) stopPlayback();
}

function previousLine() {
  stopPlayback();
  if (state.visibleLines > 1) setVisibleLines(state.visibleLines - 1);
}

function togglePlayback() {
  if (state.timer) {
    stopPlayback();
    return;
  }
  const total = codeLines().length;
  if (!total) return;
  if (state.visibleLines >= total) setVisibleLines(1, { scroll: false });
  elements.play.classList.add('playing');
  elements.playIcon.textContent = 'Ⅱ';
  elements.playLabel.textContent = '暂停';
  state.timer = window.setInterval(nextLine, Number(elements.speed.value));
}

function selectSnippet(id, { closeDrawer = true } = {}) {
  const snippet = state.snippets.find((item) => item.id === id);
  if (!snippet) return;
  stopPlayback();
  state.current = snippet;
  state.currentDirectoryId = snippet.directoryId;
  state.drawerView = 'snippets';
  const total = codeLines().length;
  state.visibleLines = total ? loadProgress(id, total) : 0;
  elements.title.textContent = snippet.title;
  elements.description.textContent = snippet.description || '逐行阅读这段代码，理解每一步的作用。';
  elements.language.textContent = snippet.language;
  elements.language.classList.toggle('is-hidden', !snippet.language);
  elements.empty.classList.toggle('is-hidden', total > 0);
  elements.scroll.scrollTop = 0;
  renderCode({ scroll: false });
  renderLibrary();
  const url = new URL(window.location.href);
  url.searchParams.set('id', id);
  history.replaceState(null, '', url);
  if (closeDrawer) setDrawer(false);
}

async function loadLibrary() {
  try {
    const response = await fetch('/api/library');
    if (!response.ok) throw new Error('无法读取代码库');
    const data = await response.json();
    state.directories = data.directories;
    state.snippets = data.snippets;
    const requestedId = new URLSearchParams(window.location.search).get('id');
    const requested = state.snippets.find((item) => item.id === requestedId);
    if (requested) selectSnippet(requested.id);
    else {
      state.drawerView = 'directories';
      renderLibrary();
      setDrawer(true);
    }
  } catch (error) {
    showToast(error.message);
    renderLibrary();
    setDrawer(true);
  }
}

elements.libraryButton.addEventListener('click', () => {
  state.drawerView = state.currentDirectoryId ? 'snippets' : 'directories';
  renderLibrary();
  setDrawer(true);
});
elements.directoryBackButton.addEventListener('click', () => {
  state.drawerView = 'directories';
  renderLibrary();
});
elements.closeLibraryButton.addEventListener('click', () => setDrawer(false));
elements.backdrop.addEventListener('click', () => setDrawer(false));
elements.previous.addEventListener('click', previousLine);
elements.next.addEventListener('click', nextLine);
elements.play.addEventListener('click', togglePlayback);
elements.reset.addEventListener('click', () => {
  stopPlayback();
  setVisibleLines(1, { scroll: false });
  elements.scroll.scrollTo({ top: 0, behavior: 'smooth' });
});
elements.speed.addEventListener('change', () => {
  if (state.timer) {
    stopPlayback();
    togglePlayback();
  }
});
elements.fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    showToast('当前浏览器不支持全屏模式');
  }
});
document.addEventListener('fullscreenchange', () => {
  elements.fullscreen.textContent = document.fullscreenElement ? '↙' : '⛶';
  elements.fullscreen.setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextLine();
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') previousLine();
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault();
    togglePlayback();
  }
  if (event.key === 'Escape') setDrawer(false);
});

let touchStartX = 0;
let touchStartY = 0;
elements.panel.addEventListener('touchstart', (event) => {
  touchStartX = event.changedTouches[0].clientX;
  touchStartY = event.changedTouches[0].clientY;
}, { passive: true });
elements.panel.addEventListener('touchend', (event) => {
  const deltaX = event.changedTouches[0].clientX - touchStartX;
  const deltaY = event.changedTouches[0].clientY - touchStartY;
  if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY)) return;
  if (deltaX < 0) nextLine();
  else previousLine();
}, { passive: true });

window.addEventListener('beforeunload', stopPlayback);
loadLibrary();
