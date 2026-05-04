/**
 * Homepage Extension - Performance-Optimized Version
 * Minimal overhead, no animations, pure performance
 */

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  // Search
  SEARCH_DEBOUNCE_MS: 150,
  MAX_BOOKMARK_RESULTS: 6,
  MAX_GOOGLE_SUGGESTIONS: 5,
  SEARCH_CACHE_TIMEOUT_MS: 300000,

  // Bookmarks
  BOOKMARKS_BAR_ID: '1',

  // Favicons
  FAVICON_SIZES: [32, 16, 48, 64],
  FAVICON_CACHE_KEY: 'newtab_favicon_cache_v1',
  FAVICON_CACHE_EXPIRY_MS: 86400000,
  FAVICON_TIMEOUT_MS: 5000,

  // Notes
  NOTES_STORAGE_KEY: 'newtab_notes_v2',
  NOTES_SAVE_DEBOUNCE_MS: 250,
  NOTES_STATUS_DURATION_MS: 800,
  NOTES_MAX_CHARS: 20000,
  NOTES_TITLE_MAX_CHARS: 48,

  // UI
  NOTIFICATION_DURATION_MS: 2000,
};

const ICONS = {
  BOOKMARK: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h10a1 1 0 0 1 1 1v12l-6-3-6 3V3a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5"/></svg>',
  SEARCH: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M10 10l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  FOLDER: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z" stroke="currentColor" stroke-width="1.5"/></svg>',
};

// ============================================================================
// UTILITIES
// ============================================================================
const $ = (id) => document.getElementById(id);

const Utils = {
  debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      return new Promise((resolve) => {
        timer = setTimeout(() => resolve(fn(...args)), delay);
      });
    };
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  escapeAttr: (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),

  parseUrl(url) {
    try {
      const u = new URL(url);
      return { hostname: u.hostname, origin: u.origin };
    } catch {
      return { hostname: '', origin: '' };
    }
  },

  getFirstLetter: (text) => (text || '?')[0].toUpperCase(),

  generateId: () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,

  clamp: (str, max) => (str.length <= max ? str : str.slice(0, max)),

  loadImage(url, timeout = CONFIG.FAVICON_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => {
        img.src = '';
        resolve(null);
      }, timeout);

      img.onload = () => {
        clearTimeout(timer);
        resolve(img.naturalWidth > 0 ? { img, url } : null);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = url;
    });
  },
};

// ============================================================================
// STORAGE
// ============================================================================
class Storage {
  static get(key, fallback = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// FAVICON MANAGER
// ============================================================================
class FaviconManager {
  constructor() {
    this.cache = this.loadCache();
    this.pending = new Map();
  }

  getSources(hostname, origin) {
    const sources = [];

    if (origin) {
      sources.push({ url: `${origin}/favicon.ico`, type: 'direct' });
      sources.push({ url: `${origin}/favicon.png`, type: 'direct' });
    }

    sources.push({ url: `https://icons.duckduckgo.com/ip3/${hostname}.ico`, type: 'duckduckgo' });

    for (const size of CONFIG.FAVICON_SIZES) {
      sources.push({ url: `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`, type: 'google', size });
    }

    return sources;
  }

  async resolve(hostname, origin) {
    const cached = this.cache[hostname];
    if (cached) return cached.url;

    let pending = this.pending.get(hostname);
    if (pending) return pending;

    pending = this.fetchBestFavicon(hostname, origin);
    this.pending.set(hostname, pending);

    try {
      return await pending;
    } finally {
      this.pending.delete(hostname);
    }
  }

  async fetchBestFavicon(hostname, origin) {
    const promises = this.getSources(hostname, origin).map(({ url, type }) =>
      Utils.loadImage(url).then((result) => {
        if (!result) return null;

        const { img } = result;
        if (type === 'google' && img.naturalWidth === 16 && img.naturalHeight === 16) {
          return null;
        }
        if (type === 'duckduckgo' && img.naturalWidth === 48 && img.naturalHeight === 48) {
          return null;
        }

        return url;
      })
    );

    try {
      const results = await Promise.all(promises);
      const bestUrl = results.find(Boolean) || null;
      this.setCache(hostname, bestUrl);
      return bestUrl;
    } catch {
      this.setCache(hostname, null);
      return null;
    }
  }

  setCache(hostname, url) {
    this.cache[hostname] = { url, ts: Date.now() };
    this.saveCache();
  }

  async applyToElement(img, url, hostname) {
    const letterEl = img.nextElementSibling;
    const { origin } = Utils.parseUrl(url);

    // Show letter placeholder initially
    img.style.display = 'none';
    if (letterEl) letterEl.style.display = 'block';

    try {
      const faviconUrl = await this.resolve(hostname, origin);
      if (faviconUrl) {
        img.src = faviconUrl;
        img.style.display = 'block';
        if (letterEl) letterEl.style.display = 'none';
      }
    } catch {
      // ignore
    }
  }
}

// ============================================================================
// NOTES MANAGER
// ============================================================================
class NotesManager {
  constructor() {
    this.state = { notes: [], activeId: null };
    this.editingId = null;
  }

  init() {
    const saved = Storage.get(CONFIG.NOTES_STORAGE_KEY);

    if (saved?.notes?.length) {
      this.state = saved;
      if (!this.state.notes.some((n) => n.id === this.state.activeId)) {
        this.state.activeId = this.state.notes[0].id;
      }
    } else {
      this.addNote();
    }

    this.save();
  }

  save() {
    return Storage.set(CONFIG.NOTES_STORAGE_KEY, this.state);
  }

  get active() {
    return this.state.notes.find((n) => n.id === this.state.activeId) || null;
  }

  addNote() {
    const note = {
      id: Utils.generateId(),
      title: `Note ${this.state.notes.length + 1}`,
      content: '',
    };
    this.state.notes.push(note);
    this.state.activeId = note.id;
    return note;
  }

  setActive(id) {
    if (this.state.notes.some((n) => n.id === id)) {
      this.state.activeId = id;
      return true;
    }
    return false;
  }

  deleteActive() {
    const idx = this.state.notes.findIndex((n) => n.id === this.state.activeId);
    if (idx === -1) return false;

    this.state.notes.splice(idx, 1);

    if (!this.state.notes.length) {
      this.addNote();
    } else {
      this.state.activeId = this.state.notes[Math.max(0, idx - 1)].id;
    }
    return true;
  }

  updateContent(content) {
    if (this.active) {
      this.active.content = Utils.clamp(content, CONFIG.NOTES_MAX_CHARS);
    }
  }

  beginRename(id) {
    if (this.state.notes.some((n) => n.id === id)) {
      this.editingId = id;
      return true;
    }
    return false;
  }

  finishRename(commit, newTitle) {
    if (!this.editingId) return false;

    const note = this.state.notes.find((n) => n.id === this.editingId);
    if (note && commit) {
      const title = Utils.clamp(newTitle.trim(), CONFIG.NOTES_TITLE_MAX_CHARS);
      note.title = title || note.title;
    }

    this.editingId = null;
    return true;
  }
}

// ============================================================================
// BOOKMARK MANAGER
// ============================================================================
class BookmarkManager {
  constructor() {
    this.bookmarkBar = null;
    this.allBookmarks = [];
    this.nodeMap = new Map();
  }

  async load() {
    const tree = await chrome.bookmarks.getTree();
    const root = tree[0];
    this.bookmarkBar = root.children.find((n) => n.id === CONFIG.BOOKMARKS_BAR_ID) || root.children[0];

    if (this.bookmarkBar) {
      this.indexTree(this.bookmarkBar);
    }
    return this.bookmarkBar;
  }

  indexTree(node) {
    const walk = (n) => {
      this.nodeMap.set(n.id, n);
      if (n.url) this.allBookmarks.push(n);
      n.children?.forEach(walk);
    };
    walk(node);
  }

  async getFolder(id) {
    try {
      const [folder] = await chrome.bookmarks.getSubTree(id);
      return folder;
    } catch {
      return null;
    }
  }

  buildPath(folder) {
    const path = [];
    let node = folder;

    while (node && node.id !== CONFIG.BOOKMARKS_BAR_ID) {
      path.unshift(node);
      node = this.nodeMap.get(node.parentId);
    }
    return path;
  }

  search(query) {
    const q = query.toLowerCase();
    return this.allBookmarks
      .filter((b) => b.title?.toLowerCase().includes(q) || b.url?.toLowerCase().includes(q))
      .slice(0, CONFIG.MAX_BOOKMARK_RESULTS);
  }
}

// ============================================================================
// SEARCH MANAGER
// ============================================================================
class SearchManager {
  constructor(bookmarkManager) {
    this.bookmarks = bookmarkManager;
    this.cache = new Map();
    this.requestId = 0;
    this.fetchSuggestions = Utils.debounce(this.doFetch.bind(this), CONFIG.SEARCH_DEBOUNCE_MS);
  }

  async doFetch(query) {
    try {
      const res = await fetch(
        `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data[1] || []).slice(0, CONFIG.MAX_GOOGLE_SUGGESTIONS);
    } catch {
      return [];
    }
  }

  async search(query, callback) {
    const id = ++this.requestId;
    const cacheKey = query.toLowerCase();
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.ts < CONFIG.SEARCH_CACHE_TIMEOUT_MS) {
      callback(cached.bookmarks, cached.google);
      return;
    }

    const bookmarks = this.bookmarks.search(query);
    callback(bookmarks, []);

    const google = await this.fetchSuggestions(query);
    if (id === this.requestId) {
      this.cache.set(cacheKey, { bookmarks, google, ts: Date.now() });
      callback(bookmarks, google);
    }
  }
}

// ============================================================================
// RENDERER
// ============================================================================
class Renderer {
  static bookmark(b) {
    const { hostname } = Utils.parseUrl(b.url);
    const letter = Utils.getFirstLetter(b.title || hostname);
    const title = Utils.escapeHtml(b.title || hostname);
    const url = Utils.escapeHtml(b.url || '#');
    const siteUrl = Utils.escapeAttr(b.url || '');

    return `
      <a href="${url}" target="_blank" class="bookmark-item" title="${title}">
        <div class="bookmark-icon">
          <img class="bookmark-favicon" alt="" data-url="${siteUrl}" data-host="${hostname}" style="display:none">
          <div class="bookmark-letter" aria-hidden="true">${letter}</div>
        </div>
        <div class="bookmark-title">${title}</div>
      </a>`;
  }

  static folder(f) {
    const title = Utils.escapeHtml(f.title || 'Folder');
    return `
      <div class="bookmark-item" data-folder-id="${f.id}" title="${title}">
        <div class="bookmark-icon">${ICONS.FOLDER}</div>
        <div class="bookmark-title">${title}</div>
      </div>`;
  }

  static grid(folder) {
    if (!folder.children?.length) {
      return '<div class="empty-state">This folder is empty</div>';
    }
    return folder.children.map((item) => (item.url ? this.bookmark(item) : this.folder(item))).join('');
  }

  static suggestion(item) {
    if (item.url) {
      const title = Utils.escapeHtml(item.title || item.url);
      const url = Utils.escapeHtml(item.url);
      return `
        <div class="suggestion-item" data-url="${url}" role="option">
          <div class="suggestion-icon">${ICONS.BOOKMARK}</div>
          <span class="suggestion-text">${title}</span>
        </div>`;
    }
    const text = Utils.escapeHtml(item);
    return `
      <div class="suggestion-item" data-search="${text}" role="option">
        <div class="suggestion-icon">${ICONS.SEARCH}</div>
        <span class="suggestion-text">${text}</span>
      </div>`;
  }

  static suggestions(bookmarks, google) {
    return bookmarks.map((b) => this.suggestion(b)).join('') + google.map((s) => this.suggestion(s)).join('');
  }

  static breadcrumb(path) {
    if (!path.length) return '';

    let html = '<span class="breadcrumb-item" data-folder-id="1">Bookmarks Bar</span>';

    path.forEach((item, i) => {
      html += ' <span class="breadcrumb-separator">›</span> ';
      if (i === path.length - 1) {
        html += `<span style="color:var(--text-primary)">${Utils.escapeHtml(item.title)}</span>`;
      } else {
        html += `<span class="breadcrumb-item" data-folder-id="${item.id}">${Utils.escapeHtml(item.title)}</span>`;
      }
    });

    return html;
  }

  static notesTabs(notes, activeId, editingId) {
    return notes
      .map((n) => {
        const active = n.id === activeId ? ' active' : '';
        const editing = n.id === editingId ? ' editing' : '';
        const title = Utils.escapeHtml(n.title);
        const value = Utils.escapeAttr(n.title);

        return `
          <button class="notes-tab${active}${editing}" role="tab" data-note-id="${n.id}" title="${title}">
            <span class="notes-tab-label">${title}</span>
            <input class="notes-tab-input" data-note-id="${n.id}" value="${value}" spellcheck="false">
          </button>`;
      })
      .join('');
  }
}

// ============================================================================
// APP CONTROLLER
// ============================================================================
class App {
  constructor() {
    this.bookmarks = new BookmarkManager();
    this.search = new SearchManager(this.bookmarks);
    this.favicon = new FaviconManager();
    this.notes = new NotesManager();

    this.currentFolder = null;
    this.selectedIndex = -1;
    this.lastQuery = '';

    // Timers
    this.saveTimer = null;
    this.statusTimer = null;

    // DOM elements
    this.dom = {};
  }

  async init() {
    this.cacheDom();

    try {
      const bar = await this.bookmarks.load();
      if (bar) this.displayFolder(bar);

      this.notes.init();
      this.renderNotes();

      this.bindEvents();
      this.dom.searchInput.focus();
    } catch (error) {
      console.error('Init error:', error);
      this.dom.bookmarksGrid.innerHTML = '<div class="empty-state">Failed to load. Please refresh.</div>';
    }
  }

  cacheDom() {
    this.dom = {
      searchInput: $('searchInput'),
      suggestions: $('suggestions'),
      bookmarksGrid: $('bookmarksGrid'),
      breadcrumb: $('breadcrumb'),
      notification: $('copyNotification'),
      notesArea: $('notesArea'),
      notesStatus: $('notesStatus'),
      notesTabs: $('notesTabs'),
      notesNewBtn: $('notesNewBtn'),
      notesDeleteBtn: $('notesDeleteBtn'),
      notesClearBtn: $('notesClearBtn'),
    };
  }

  // -------------------------
  // Bookmarks & Navigation
  // -------------------------

  displayFolder(folder) {
    this.currentFolder = folder;
    this.dom.bookmarksGrid.innerHTML = Renderer.grid(folder);
    this.dom.breadcrumb.innerHTML = Renderer.breadcrumb(this.bookmarks.buildPath(folder));
    this.loadFavicons();
  }

  loadFavicons() {
    const faviconElements = this.dom.bookmarksGrid.querySelectorAll('.bookmark-favicon');

    faviconElements.forEach((img) => {
      const url = img.dataset.url;
      const hostname = img.dataset.host;
      if (url && hostname) {
        this.favicon.applyToElement(img, url, hostname);
      }
    });
  }

  async navigateToFolder(id) {
    const folder = id === CONFIG.BOOKMARKS_BAR_ID
      ? this.bookmarks.bookmarkBar
      : await this.bookmarks.getFolder(id);

    if (folder) this.displayFolder(folder);
  }

  // -------------------------
  // Search
  // -------------------------

  handleSearchInput(query) {
    this.selectedIndex = -1;

    if (!query) {
      this.hideSuggestions();
      return;
    }

    this.lastQuery = query;
    this.search.search(query, (bookmarks, google) => {
      if (this.lastQuery === query) {
        this.showSuggestions(bookmarks, google);
      }
    });
  }

  showSuggestions(bookmarks, google) {
    const html = Renderer.suggestions(bookmarks, google);
    if (html) {
      this.dom.suggestions.innerHTML = html;
      this.dom.suggestions.classList.add('active');
    } else {
      this.hideSuggestions();
    }
  }

  hideSuggestions() {
    this.dom.suggestions.classList.remove('active');
    this.dom.suggestions.innerHTML = '';
    this.selectedIndex = -1;
  }

  updateSelection() {
    const items = this.dom.suggestions.querySelectorAll('.suggestion-item');
    items.forEach((item, i) => {
      const selected = i === this.selectedIndex;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-selected', selected);
      if (selected) item.scrollIntoView({ block: 'nearest' });
    });
  }

  executeSearch(query) {
    const match = this.bookmarks.allBookmarks.find(
      (b) => b.title?.toLowerCase() === query.toLowerCase() || b.url?.toLowerCase().includes(query.toLowerCase())
    );

    window.open(match ? match.url : `https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
  }

  handleSearchKeydown(e) {
    const items = this.dom.suggestions.querySelectorAll('.suggestion-item');
    const isActive = this.dom.suggestions.classList.contains('active');

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (items.length) {
          this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
          this.updateSelection();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (items.length) {
          this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
          this.updateSelection();
        }
        break;

      case 'Tab':
        if (isActive && items.length) {
          e.preventDefault();
          this.selectedIndex = (this.selectedIndex + 1) % items.length;
          this.updateSelection();
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
          items[this.selectedIndex].click();
        } else if (this.dom.searchInput.value.trim()) {
          this.executeSearch(this.dom.searchInput.value.trim());
        }
        this.clearSearch();
        break;

      case 'Escape':
        this.hideSuggestions();
        this.dom.searchInput.blur();
        break;
    }
  }

  clearSearch() {
    this.dom.searchInput.value = '';
    this.hideSuggestions();
  }

  // -------------------------
  // Notes
  // -------------------------

  renderNotes() {
    this.dom.notesTabs.innerHTML = Renderer.notesTabs(
      this.notes.state.notes,
      this.notes.state.activeId,
      this.notes.editingId
    );
    this.dom.notesArea.value = this.notes.active?.content || '';
    this.autoResizeNotes();
  }

  autoResizeNotes() {
    const area = this.dom.notesArea;
    const { minHeight, maxHeight } = getComputedStyle(area);
    const min = parseInt(minHeight) || 0;
    const max = parseInt(maxHeight) || Infinity;

    area.style.height = 'auto';
    area.style.height = `${Math.min(Math.max(area.scrollHeight, min), max)}px`;
    area.style.overflowY = area.scrollHeight > max ? 'auto' : 'hidden';
  }

  setNotesStatus(text) {
    this.dom.notesStatus.textContent = text;
    clearTimeout(this.statusTimer);

    if (text) {
      this.statusTimer = setTimeout(() => {
        this.dom.notesStatus.textContent = '';
      }, CONFIG.NOTES_STATUS_DURATION_MS);
    }
  }

  saveNotes(status = 'Saved') {
    this.notes.save();
    this.setNotesStatus(status);
  }

  scheduleNoteSave() {
    this.notes.updateContent(this.dom.notesArea.value);
    this.autoResizeNotes();
    this.setNotesStatus('Saving…');

    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNotes(), CONFIG.NOTES_SAVE_DEBOUNCE_MS);
  }

  beginRename(id) {
    if (!this.notes.beginRename(id)) return;

    this.renderNotes();

    const input = this.dom.notesTabs.querySelector(`.notes-tab-input[data-note-id="${id}"]`);
    if (input) {
      input.focus();
      input.select();
    }
  }

  finishRename(commit) {
    if (!this.notes.editingId) return;

    const input = this.dom.notesTabs.querySelector(`.notes-tab-input[data-note-id="${this.notes.editingId}"]`);
    this.notes.finishRename(commit, input?.value || '');
    this.renderNotes();
    this.saveNotes();
  }

  // -------------------------
  // UI Helpers
  // -------------------------

  showNotification() {
    this.dom.notification.classList.add('show');
    setTimeout(() => this.dom.notification.classList.remove('show'), CONFIG.NOTIFICATION_DURATION_MS);
  }

  // -------------------------
  // Event Bindings
  // -------------------------

  bindEvents() {
    const { searchInput, suggestions, bookmarksGrid, breadcrumb, notesArea, notesTabs, notesNewBtn, notesDeleteBtn, notesClearBtn } = this.dom;

    // Search
    searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value.trim()));
    searchInput.addEventListener('keydown', (e) => this.handleSearchKeydown(e));

    // Suggestions
    suggestions.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;

      const url = item.dataset.url;
      const search = item.dataset.search;

      if (url) window.open(url, '_blank');
      else if (search) window.open(`https://www.google.com/search?q=${encodeURIComponent(search)}`, '_blank');

      this.clearSearch();
    });

    suggestions.addEventListener('mousemove', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;

      const items = [...suggestions.querySelectorAll('.suggestion-item')];
      const idx = items.indexOf(item);
      if (idx !== -1 && idx !== this.selectedIndex) {
        this.selectedIndex = idx;
        this.updateSelection();
      }
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !suggestions.contains(e.target)) {
        this.hideSuggestions();
      }
    });

    // Bookmarks grid
    bookmarksGrid.addEventListener('click', (e) => {
      const folder = e.target.closest('[data-folder-id]');
      if (folder) this.navigateToFolder(folder.dataset.folderId);
    });

    // Breadcrumb
    breadcrumb.addEventListener('click', (e) => {
      const item = e.target.closest('.breadcrumb-item');
      if (item) this.navigateToFolder(item.dataset.folderId);
    });

    // Notes area
    notesArea.addEventListener('input', () => this.scheduleNoteSave());
    notesArea.addEventListener('blur', () => {
      clearTimeout(this.saveTimer);
      this.notes.updateContent(notesArea.value);
      this.saveNotes();
    });

    // Notes tabs
    notesTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.notes-tab');
      if (!tab) return;

      if (this.notes.editingId) return;

      const id = tab.dataset.noteId;
      if (id === this.notes.state.activeId) {
        this.beginRename(id);
      } else {
        this.finishRename(true);
        this.notes.setActive(id);
        this.renderNotes();
        this.saveNotes();
      }
    });

    notesTabs.addEventListener('keydown', (e) => {
      const input = e.target.closest('.notes-tab-input');
      if (!input) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        this.finishRename(true);
        this.dom.notesArea.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.finishRename(false);
        this.dom.notesArea.focus();
      }
    });

    notesTabs.addEventListener('focusout', (e) => {
      const input = e.target.closest('.notes-tab-input');
      if (input && this.notes.editingId) {
        this.finishRename(true);
      }
    }, true);


    // Notes buttons
    notesNewBtn.addEventListener('click', () => {
      this.finishRename(true);
      this.notes.addNote();
      this.renderNotes();
      this.saveNotes();
    });

    notesDeleteBtn.addEventListener('click', () => {
      this.finishRename(true);
      this.notes.deleteActive();
      this.renderNotes();
      this.saveNotes();
    });

    notesClearBtn.addEventListener('click', () => {
      this.finishRename(true);
      if (this.notes.active) this.notes.active.content = '';
      notesArea.value = '';
      this.autoResizeNotes();
      this.saveNotes('Cleared');
    });

    // Focus management
    window.addEventListener('focus', () => searchInput.focus());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) searchInput.focus();
    });
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => new App().init());
