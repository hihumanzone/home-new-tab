/**
 * Homepage Extension - Performance-Optimized Version
 * Designed for low-end devices with minimal overhead
 * No animations, no blur effects, pure performance
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  SEARCH_DEBOUNCE_MS: 150,
  NOTIFICATION_DURATION_MS: 2000,
  FAVICON_SIZE: 32,
  MAX_BOOKMARK_RESULTS: 6,
  MAX_GOOGLE_SUGGESTIONS: 5,
  BOOKMARKS_BAR_ID: '1',
  CACHE_TIMEOUT_MS: 300000, // 5 minutes

  // Notes
  NOTES_STORAGE_KEY: 'newtab_notes_v1',
  NOTES_SAVE_DEBOUNCE_MS: 250,
  NOTES_STATUS_DURATION_MS: 800,
  NOTES_MAX_CHARS: 20000,
};

// Inline SVG icons (minimal size)
const ICONS = {
  BOOKMARK:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2h10a1 1 0 0 1 1 1v12l-6-3-6 3V3a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
  SEARCH:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="4" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M10 10l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  FOLDER:
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

class State {
  constructor() {
    this.bookmarks = [];
    this.currentFolder = null;
    this.bookmarkBar = null;
    this.selectedIndex = -1;
    this.nodeMap = new Map();
    this.searchCache = new Map();
    this.lastSearchQuery = '';
  }

  reset() {
    this.selectedIndex = -1;
  }
}

// ============================================================================
// DOM CACHE
// ============================================================================

class DOM {
  constructor() {
    this.els = {};
  }

  cache() {
    this.els = {
      searchInput: document.getElementById('searchInput'),
      suggestions: document.getElementById('suggestions'),
      bookmarksGrid: document.getElementById('bookmarksGrid'),
      breadcrumb: document.getElementById('breadcrumb'),
      manageNote: document.getElementById('manageNote'),
      notification: document.getElementById('copyNotification'),
      notesArea: document.getElementById('notesArea'),
      notesStatus: document.getElementById('notesStatus'),
      notesClearBtn: document.getElementById('notesClearBtn'),
    };
  }

  get(name) {
    return this.els[name];
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

const Utils = {
  debounce(fn, delay) {
    let timer;
    return function (...args) {
      return new Promise((resolve) => {
        clearTimeout(timer);
        timer = setTimeout(() => resolve(fn.apply(this, args)), delay);
      });
    };
  },

  escapeHtml(text) {
    const el = document.createElement('div');
    el.textContent = text;
    return el.innerHTML;
  },

  getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  },

  getFirstLetter(text) {
    return (text || '?')[0].toUpperCase();
  },

  getFaviconUrl(hostname) {
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=${CONFIG.FAVICON_SIZE}`;
  },

  batchUpdate(element, html) {
    element.innerHTML = html;
  },
};

// ============================================================================
// NOTES MANAGER (LIGHTWEIGHT)
// ============================================================================

class NotesManager {
  load() {
    try {
      return localStorage.getItem(CONFIG.NOTES_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  save(text) {
    try {
      localStorage.setItem(CONFIG.NOTES_STORAGE_KEY, text);
      return true;
    } catch (e) {
      console.error('Notes save error:', e);
      return false;
    }
  }

  clear() {
    try {
      localStorage.removeItem(CONFIG.NOTES_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

// ============================================================================
// BOOKMARK MANAGER
// ============================================================================

class BookmarkManager {
  constructor(state) {
    this.state = state;
  }

  async load() {
    try {
      const tree = await chrome.bookmarks.getTree();
      const root = tree[0];
      const bar =
        root.children.find((n) => n.id === CONFIG.BOOKMARKS_BAR_ID) ||
        root.children[0];

      if (bar) {
        this.state.bookmarkBar = bar;
        this.indexTree(bar);
        return bar;
      }
      return null;
    } catch (error) {
      console.error('Bookmark load error:', error);
      throw error;
    }
  }

  indexTree(node) {
    const flat = [];
    const map = new Map();

    const walk = (n) => {
      map.set(n.id, n);
      if (n.url) flat.push(n);
      if (n.children) n.children.forEach(walk);
    };

    walk(node);
    this.state.bookmarks = flat;
    this.state.nodeMap = map;
  }

  async getFolder(id) {
    try {
      const data = await chrome.bookmarks.getSubTree(id);
      return data[0] || null;
    } catch (error) {
      console.error('Folder fetch error:', error);
      return null;
    }
  }

  buildPath(folder) {
    const path = [];
    let node = folder;

    while (node && node.id !== CONFIG.BOOKMARKS_BAR_ID) {
      path.unshift(node);
      node = node.parentId ? this.state.nodeMap.get(node.parentId) : null;
    }

    return path;
  }

  search(query) {
    const q = query.toLowerCase();
    return this.state.bookmarks
      .filter(
        (b) =>
          (b.title || '').toLowerCase().includes(q) ||
          (b.url || '').toLowerCase().includes(q)
      )
      .slice(0, CONFIG.MAX_BOOKMARK_RESULTS);
  }
}

// ============================================================================
// SEARCH MANAGER
// ============================================================================

class SearchManager {
  constructor(bookmarkManager, state) {
    this.bookmarkManager = bookmarkManager;
    this.state = state;
    this.debouncedGoogle = Utils.debounce(
      this.fetchGoogle.bind(this),
      CONFIG.SEARCH_DEBOUNCE_MS
    );
    this.requestId = 0;
  }

  async fetchGoogle(query) {
    try {
      const res = await fetch(
        `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(
          query
        )}`
      );

      if (!res.ok) return [];

      const data = await res.json();
      return (data[1] || []).slice(0, CONFIG.MAX_GOOGLE_SUGGESTIONS);
    } catch (error) {
      console.error('Google suggestions error:', error);
      return [];
    }
  }

  async search(query, callback) {
    const id = ++this.requestId;

    const cacheKey = query.toLowerCase();
    const cached = this.state.searchCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_TIMEOUT_MS) {
      callback(cached.bookmarks, cached.google);
      return;
    }

    const bookmarks = this.bookmarkManager.search(query);
    callback(bookmarks, []);

    try {
      const google = await this.debouncedGoogle(query);
      if (id === this.requestId) {
        this.state.searchCache.set(cacheKey, {
          bookmarks,
          google,
          timestamp: Date.now(),
        });
        callback(bookmarks, google);
      }
    } catch (error) {
      if (id === this.requestId) {
        callback(bookmarks, []);
      }
    }
  }
}

// ============================================================================
// RENDERER
// ============================================================================

class Renderer {
  constructor(bookmarkManager) {
    this.bookmarkManager = bookmarkManager;
  }

  renderBookmark(b) {
    const hostname = Utils.getHostname(b.url);
    const favicon = Utils.getFaviconUrl(hostname);
    const letter = Utils.getFirstLetter(b.title || hostname);
    const title = Utils.escapeHtml(b.title || hostname);
    const url = Utils.escapeHtml(b.url || '#');

    return `<a href="${url}" target="_blank" class="bookmark-item" title="${title}">
      <div class="bookmark-icon">
        <img src="${favicon}" class="bookmark-favicon" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
        <div class="bookmark-letter" style="display:none;">${letter}</div>
      </div>
      <div class="bookmark-title">${title}</div>
    </a>`;
  }

  renderFolder(f) {
    const title = Utils.escapeHtml(f.title || 'Folder');
    return `<div class="bookmark-item" data-folder-id="${f.id}" title="${title}">
      <div class="bookmark-icon">${ICONS.FOLDER}</div>
      <div class="bookmark-title">${title}</div>
    </div>`;
  }

  renderGrid(folder) {
    if (!folder.children || folder.children.length === 0) {
      return '<div class="empty-state">This folder is empty</div>';
    }

    return folder.children
      .map((item) => (item.url ? this.renderBookmark(item) : this.renderFolder(item)))
      .join('');
  }

  renderSuggestionBookmark(b) {
    const title = Utils.escapeHtml(b.title || b.url || 'Bookmark');
    const url = Utils.escapeHtml(b.url || '#');
    return `<div class="suggestion-item" data-url="${url}" role="option" aria-selected="false">
      <div class="suggestion-icon">${ICONS.BOOKMARK}</div>
      <span class="suggestion-text">${title}</span>
    </div>`;
  }

  renderSuggestionSearch(s) {
    const escaped = Utils.escapeHtml(s);
    return `<div class="suggestion-item" data-search="${escaped}" role="option" aria-selected="false">
      <div class="suggestion-icon">${ICONS.SEARCH}</div>
      <span class="suggestion-text">${escaped}</span>
    </div>`;
  }

  renderSuggestions(bookmarks, google) {
    return (
      bookmarks.map((b) => this.renderSuggestionBookmark(b)).join('') +
      google.map((s) => this.renderSuggestionSearch(s)).join('')
    );
  }

  renderBreadcrumb(folder) {
    if (!folder || folder.id === CONFIG.BOOKMARKS_BAR_ID) return '';

    const path = this.bookmarkManager.buildPath(folder);
    if (path.length === 0) return '';

    let html =
      '<span class="breadcrumb-item" data-folder-id="1" aria-current="false">Bookmarks Bar</span>';

    path.forEach((item, i) => {
      html += ' <span class="breadcrumb-separator">›</span> ';
      if (i === path.length - 1) {
        html += `<span aria-current="page" style="color:var(--text-primary)">${Utils.escapeHtml(
          item.title
        )}</span>`;
      } else {
        html += `<span class="breadcrumb-item" data-folder-id="${item.id}" aria-current="false">${Utils.escapeHtml(
          item.title
        )}</span>`;
      }
    });

    return html;
  }
}

// ============================================================================
// EVENT CONTROLLER
// ============================================================================

class Controller {
  constructor(state, dom, bookmarkManager, searchManager, renderer, notesManager) {
    this.state = state;
    this.dom = dom;
    this.bookmarkManager = bookmarkManager;
    this.searchManager = searchManager;
    this.renderer = renderer;

    this.notesManager = notesManager;
    this.notesDirty = false;
    this.notesSaveTimer = 0;
    this.notesStatusTimer = 0;
  }

  // --------------------
  // Notes
  // --------------------

  autoResizeNotes() {
    const area = this.dom.get('notesArea');
    if (!area) return;

    const styles = getComputedStyle(area);
    const minHeight = parseInt(styles.minHeight, 10) || 0;
    const maxHeight = parseInt(styles.maxHeight, 10) || Infinity;

    area.style.height = 'auto';
    const newHeight = Math.min(Math.max(area.scrollHeight, minHeight), maxHeight);
    area.style.height = `${newHeight}px`;
    area.style.overflowY = area.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  setupNotes() {
    const area = this.dom.get('notesArea');
    const clearBtn = this.dom.get('notesClearBtn');
    const status = this.dom.get('notesStatus');

    if (!area || !clearBtn || !status) return;

    area.value = this.notesManager.load();
    status.textContent = '';

    // Initial auto-resize
    this.autoResizeNotes();

    const scheduleSave = () => {
      if (area.value.length > CONFIG.NOTES_MAX_CHARS) {
        area.value = area.value.slice(0, CONFIG.NOTES_MAX_CHARS);
      }

      this.notesDirty = true;

      // Auto-resize on input
      this.autoResizeNotes();

      clearTimeout(this.notesSaveTimer);
      this.setNotesStatus('Saving…');

      this.notesSaveTimer = setTimeout(() => {
        const ok = this.notesManager.save(area.value);
        this.notesDirty = false;
        this.setNotesStatus(ok ? 'Saved' : 'Not saved');
      }, CONFIG.NOTES_SAVE_DEBOUNCE_MS);
    };

    area.addEventListener('input', scheduleSave);

    area.addEventListener('blur', () => {
      if (!this.notesDirty) return;
      clearTimeout(this.notesSaveTimer);
      const ok = this.notesManager.save(area.value);
      this.notesDirty = false;
      this.setNotesStatus(ok ? 'Saved' : 'Not saved');
    });

    clearBtn.addEventListener('click', () => {
      area.value = '';
      this.notesManager.clear();
      this.notesDirty = false;
      this.setNotesStatus('Cleared');
      this.autoResizeNotes();
    });
  }

  setNotesStatus(text) {
    const status = this.dom.get('notesStatus');
    if (!status) return;

    status.textContent = text || '';

    clearTimeout(this.notesStatusTimer);
    if (text) {
      this.notesStatusTimer = setTimeout(() => {
        status.textContent = '';
      }, CONFIG.NOTES_STATUS_DURATION_MS);
    }
  }

  // --------------------
  // Search + bookmarks
  // --------------------

  setupSearch() {
    const input = this.dom.get('searchInput');

    input.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      this.state.reset();

      if (!query) {
        this.hideSuggestions();
        return;
      }

      this.state.lastSearchQuery = query;
      this.searchManager.search(query, (bookmarks, google) => {
        if (this.state.lastSearchQuery === query) {
          this.showSuggestions(bookmarks, google);
        }
      });
    });

    input.addEventListener('keydown', (e) => this.handleKeyboard(e));
  }

  clearSearch() {
    const input = this.dom.get('searchInput');
    input.value = '';
    this.hideSuggestions();
    this.state.reset();
  }

  handleKeyboard(e) {
    const sugs = this.dom.get('suggestions');
    const items = sugs.querySelectorAll('.suggestion-item');
    const input = this.dom.get('searchInput');

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (items.length > 0) {
          this.state.selectedIndex = Math.min(
            this.state.selectedIndex + 1,
            items.length - 1
          );
          this.updateSelection(items);
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (items.length > 0) {
          this.state.selectedIndex = Math.max(this.state.selectedIndex - 1, -1);
          this.updateSelection(items);
        }
        break;

      case 'Tab':
        if (sugs.classList.contains('active') && items.length > 0) {
          e.preventDefault();
          this.state.selectedIndex = (this.state.selectedIndex + 1) % items.length;
          this.updateSelection(items);
        }
        break;

      case 'Enter': {
        const query = input.value.trim();
        if (this.state.selectedIndex >= 0 && items[this.state.selectedIndex]) {
          e.preventDefault();
          items[this.state.selectedIndex].click();
          this.clearSearch();
        } else if (query) {
          e.preventDefault();
          this.directSearch(query);
          this.clearSearch();
        }
        break;
      }

      case 'Escape':
        this.hideSuggestions();
        this.dom.get('searchInput').blur();
        break;
    }
  }

  directSearch(query) {
    if (!query) return;

    const match = this.state.bookmarks.find(
      (b) =>
        (b.title || '').toLowerCase() === query.toLowerCase() ||
        (b.url || '').toLowerCase().includes(query.toLowerCase())
    );

    if (match) {
      window.open(match.url, '_blank');
    } else {
      window.open(
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        '_blank'
      );
    }
  }

  updateSelection(items) {
    items.forEach((item, i) => {
      const selected = i === this.state.selectedIndex;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected) item.scrollIntoView({ block: 'nearest' });
    });
  }

  showSuggestions(bookmarks, google) {
    const html = this.renderer.renderSuggestions(bookmarks, google);
    if (html) {
      Utils.batchUpdate(this.dom.get('suggestions'), html);
      this.dom.get('suggestions').classList.add('active');
      this.state.reset();
    } else {
      this.hideSuggestions();
    }
  }

  hideSuggestions() {
    this.dom.get('suggestions').classList.remove('active');
    this.dom.get('suggestions').innerHTML = '';
  }

  displayBookmarks(folder) {
    const html = this.renderer.renderGrid(folder);
    Utils.batchUpdate(this.dom.get('bookmarksGrid'), html);
    this.state.currentFolder = folder;
    this.updateBreadcrumb();
  }

  updateBreadcrumb() {
    const html = this.renderer.renderBreadcrumb(this.state.currentFolder);
    Utils.batchUpdate(this.dom.get('breadcrumb'), html);
  }

  setupClipboard() {
    const note = this.dom.get('manageNote');

    const copy = async () => {
      try {
        await navigator.clipboard.writeText('chrome://bookmarks/');
        this.showNotification();
      } catch (error) {
        console.error('Clipboard error:', error);
      }
    };

    note.addEventListener('click', copy);
    note.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        copy();
      }
    });
  }

  showNotification() {
    const notif = this.dom.get('notification');
    notif.classList.add('show');
    setTimeout(
      () => notif.classList.remove('show'),
      CONFIG.NOTIFICATION_DURATION_MS
    );
  }

  setupListeners() {
    const input = this.dom.get('searchInput');
    const sugs = this.dom.get('suggestions');
    const grid = this.dom.get('bookmarksGrid');
    const crumb = this.dom.get('breadcrumb');

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !sugs.contains(e.target)) {
        this.hideSuggestions();
      }
    });

    sugs.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;

      const url = item.getAttribute('data-url');
      const search = item.getAttribute('data-search');

      if (url) {
        window.open(url, '_blank');
      } else if (search) {
        window.open(
          `https://www.google.com/search?q=${encodeURIComponent(search)}`,
          '_blank'
        );
      }
      this.clearSearch();
    });

    sugs.addEventListener('mousemove', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;
      const items = [...sugs.querySelectorAll('.suggestion-item')];
      const idx = items.indexOf(item);
      if (idx !== -1 && idx !== this.state.selectedIndex) {
        this.state.selectedIndex = idx;
        this.updateSelection(items);
      }
    });

    grid.addEventListener('click', async (e) => {
      const folderEl = e.target.closest('.bookmark-item[data-folder-id]');
      if (!folderEl) return;
      const id = folderEl.getAttribute('data-folder-id');
      const folder = await this.bookmarkManager.getFolder(id);
      if (folder) this.displayBookmarks(folder);
    });

    crumb.addEventListener('click', async (e) => {
      const item = e.target.closest('.breadcrumb-item');
      if (!item) return;
      const id = item.getAttribute('data-folder-id');

      if (id === CONFIG.BOOKMARKS_BAR_ID) {
        this.displayBookmarks(this.state.bookmarkBar);
      } else {
        const folder = await this.bookmarkManager.getFolder(id);
        if (folder) this.displayBookmarks(folder);
      }
    });

    window.addEventListener('focus', () => input.focus());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) input.focus();
    });
  }
}

// ============================================================================
// APPLICATION
// ============================================================================

class App {
  constructor() {
    this.state = new State();
    this.dom = new DOM();
    this.bookmarkManager = new BookmarkManager(this.state);
    this.searchManager = new SearchManager(this.bookmarkManager, this.state);
    this.renderer = new Renderer(this.bookmarkManager);
    this.notesManager = new NotesManager();
    this.controller = new Controller(
      this.state,
      this.dom,
      this.bookmarkManager,
      this.searchManager,
      this.renderer,
      this.notesManager
    );
  }

  async init() {
    try {
      this.dom.cache();

      const bar = await this.bookmarkManager.load();

      if (bar) {
        this.controller.displayBookmarks(bar);
      }

      this.controller.setupSearch();
      this.controller.setupNotes();
      this.controller.setupClipboard();
      this.controller.setupListeners();

      this.dom.get('searchInput').focus();
      setTimeout(() => this.dom.get('searchInput').focus(), 100);
    } catch (error) {
      console.error('Init error:', error);
      Utils.batchUpdate(
        this.dom.get('bookmarksGrid'),
        '<div class="empty-state">Failed to load bookmarks. Please refresh.</div>'
      );
    }
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});