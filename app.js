import { CONFIG } from './config.js';
import { $, debounce } from './utils.js';
import { BookmarkManager } from './bookmarks.js';
import { SearchManager } from './search.js';
import { faviconManager } from './favicon.js';
import { NotesManager } from './notes.js';
import { Renderer } from './renderer.js';

class App {
  constructor() {
    this.bookmarks = new BookmarkManager();
    this.search = new SearchManager(this.bookmarks);
    this.favicon = faviconManager;
    this.notes = new NotesManager();

    this.currentFolder = null;
    this.selectedIndex = -1;
    this.lastQuery = '';

    this.saveTimer = null;
    this.statusTimer = null;
    this.notesResizeCache = null;

    this.dom = {};
  }

  async init() {
    this.cacheDom();

    try {
      const bar = await this.bookmarks.load();
      if (bar) this.displayFolder(bar);

      await this.notes.init();
      this.renderNotes();

      this.bindEvents();
      this.dom.search.input.focus();
    } catch (error) {
      console.error('Init error:', error);
      this.dom.bookmarksGrid.innerHTML =
        '<div class="empty-state">Failed to load. <span class="empty-state retry-btn" id="retryBtn">Retry</span></div>';
      document.getElementById('retryBtn')?.addEventListener('click', () => this.init());
    }
  }

  cacheDom() {
    this.dom = {
      search: {
        input: $('searchInput'),
        suggestions: $('suggestions'),
      },
      bookmarksGrid: $('bookmarksGrid'),
      breadcrumb: $('breadcrumb'),
      notification: $('copyNotification'),
      notes: {
        area: $('notesArea'),
        status: $('notesStatus'),
        tabs: $('notesTabs'),
        newBtn: $('notesNewBtn'),
        deleteBtn: $('notesDeleteBtn'),
        clearBtn: $('notesClearBtn'),
        undoBtn: $('notesUndoBtn'),
        moveLeftBtn: $('notesMoveLeftBtn'),
        moveRightBtn: $('notesMoveRightBtn'),
        exportBtn: $('notesExportBtn'),
        importBtn: $('notesImportBtn'),
        importFile: $('notesImportFile'),
      },
    };

    this.dom.info = {
      btn: $('infoBtn'),
      panel: $('infoPanel'),
      link: $('bookmarksLink'),
    };
  }

  // --------------- Bookmarks & Navigation ---------------

  displayFolder(folder) {
    this.currentFolder = folder;
    this.dom.bookmarksGrid.innerHTML = Renderer.grid(folder);
    this.dom.breadcrumb.innerHTML = Renderer.breadcrumb(this.bookmarks.buildPath(folder));
    this.favicon.loadFaviconsForContainer('#bookmarksGrid');
  }

  async navigateToFolder(id) {
    const folder =
      id === CONFIG.BOOKMARKS_BAR_ID ? this.bookmarks.bookmarkBar : await this.bookmarks.getFolder(id);

    if (folder) this.displayFolder(folder);
  }

  async refreshBookmarks() {
    try {
      const bar = await this.bookmarks.load();
      this.search.cache?.clear();

      let targetFolder = null;
      if (this.currentFolder?.id) {
        targetFolder =
          this.currentFolder.id === CONFIG.BOOKMARKS_BAR_ID
            ? bar
            : await this.bookmarks.getFolder(this.currentFolder.id);
      }

      this.displayFolder(targetFolder || bar);

      const activeQuery = this.dom.search.input?.value.trim();
      if (activeQuery) {
        this.handleSearchInput(activeQuery);
      }
    } catch (err) {
      console.error('Failed to auto-refresh bookmarks:', err);
    }
  }

  listenBookmarkEvents() {
    if (typeof chrome === 'undefined' || !chrome.bookmarks) return;

    const debouncedRefresh = debounce(() => this.refreshBookmarks(), 100);
    const events = [
      chrome.bookmarks.onCreated,
      chrome.bookmarks.onRemoved,
      chrome.bookmarks.onChanged,
      chrome.bookmarks.onMoved,
      chrome.bookmarks.onChildrenReordered,
      chrome.bookmarks.onImportEnded,
    ];

    events.forEach((evt) => {
      evt?.addListener?.(debouncedRefresh);
    });
  }

  // --------------- Search ---------------

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
      this.dom.search.suggestions.innerHTML = html;
      this.dom.search.suggestions.classList.add('active');
      this.dom.search.input.setAttribute('aria-expanded', 'true');
    } else {
      this.hideSuggestions();
    }
  }

  hideSuggestions() {
    const { suggestions, input } = this.dom.search;
    suggestions.classList.remove('active');
    suggestions.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    this.selectedIndex = -1;
  }

  updateSelection() {
    const items = this.dom.search.suggestions.querySelectorAll('.suggestion-item');
    items.forEach((item, i) => {
      const selected = i === this.selectedIndex;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-selected', String(selected));
      if (selected) item.scrollIntoView({ block: 'nearest' });
    });
  }

  openSearchResult(query) {
    const matches = this.bookmarks.search(query);
    const match = matches[0];
    window.open(match ? match.url : `https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
  }

  handleSearchKeydown(e) {
    const items = this.dom.search.suggestions.querySelectorAll('.suggestion-item');
    const isActive = this.dom.search.suggestions.classList.contains('active');

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
        } else if (this.dom.search.input.value.trim()) {
          this.openSearchResult(this.dom.search.input.value.trim());
        }
        this.clearSearch();
        break;

      case 'Escape':
        this.hideSuggestions();
        this.dom.search.input.blur();
        break;
    }
  }

  clearSearch() {
    this.dom.search.input.value = '';
    this.hideSuggestions();
  }

  // --------------- Notes ---------------

  renderNotes() {
    this.dom.notes.tabs.innerHTML = Renderer.notesTabs(
      this.notes.state.notes,
      this.notes.state.activeId,
      this.notes.editingId
    );
    this.dom.notes.area.value = this.notes.active?.content || '';
    this.autoResizeNotes();

    if (this.dom.notes.undoBtn) {
      this.dom.notes.undoBtn.style.display = this.notes.lastDeletedNote?.note ? 'inline-block' : 'none';
    }

    const activeIdx = this.notes.state.notes.findIndex((n) => n.id === this.notes.state.activeId);
    if (this.dom.notes.moveLeftBtn) {
      this.dom.notes.moveLeftBtn.disabled = activeIdx <= 0;
    }
    if (this.dom.notes.moveRightBtn) {
      this.dom.notes.moveRightBtn.disabled =
        activeIdx === -1 || activeIdx >= this.notes.state.notes.length - 1;
    }
  }

  async moveActiveNote(offset) {
    if (this.notes.editingId) return;
    if (this.notes.moveActiveNote(offset)) {
      this.renderNotes();
      await this.saveNotes('Reordered');
    }
  }

  autoResizeNotes() {
    const area = this.dom.notes.area;

    if (!this.notesResizeCache) {
      const style = getComputedStyle(area);
      this.notesResizeCache = {
        min: parseInt(style.minHeight) || 0,
        max: parseInt(style.maxHeight) || Infinity,
      };
    }

    const { min, max } = this.notesResizeCache;
    area.style.height = 'auto';
    const newHeight = Math.min(Math.max(area.scrollHeight, min), max);
    area.style.height = `${newHeight}px`;
    area.style.overflowY = area.scrollHeight > max ? 'auto' : 'hidden';
  }

  #clearResizeCache() {
    this.notesResizeCache = null;
  }

  setNotesStatus(text) {
    this.dom.notes.status.textContent = text;
    clearTimeout(this.statusTimer);

    if (text) {
      this.statusTimer = setTimeout(() => {
        this.dom.notes.status.textContent = '';
      }, CONFIG.NOTES_STATUS_DURATION_MS);
    }
  }

  async saveNotes(status = 'Saved') {
    await this.notes.save();
    this.setNotesStatus(status);
  }

  scheduleNoteSave() {
    this.notes.updateContent(this.dom.notes.area.value);
    this.autoResizeNotes();
    this.setNotesStatus('Saving\u2026');

    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNotes(), CONFIG.NOTES_SAVE_DEBOUNCE_MS);
  }

  beginRename(id) {
    if (!this.notes.beginRename(id)) return;

    this.renderNotes();

    const input = this.dom.notes.tabs.querySelector(`.notes-tab-input[data-note-id="${id}"]`);
    if (input) {
      input.focus();
      input.select();
    }
  }

  finishRename(commit) {
    if (!this.notes.editingId) return;

    const input = this.dom.notes.tabs.querySelector(
      `.notes-tab-input[data-note-id="${this.notes.editingId}"]`
    );
    this.notes.finishRename(commit, input?.value);
    this.renderNotes();
    this.saveNotes();
  }

  async undoDelete() {
    if (await this.notes.restoreDeleted()) {
      this.renderNotes();
      await this.saveNotes('Restored');
    }
  }

  // --------------- UI Helpers ---------------

  showNotification() {
    this.dom.notification.classList.add('show');
    setTimeout(() => this.dom.notification.classList.remove('show'), CONFIG.NOTIFICATION_DURATION_MS);
  }

  // --------------- Event Bindings ---------------

  bindEvents() {
    this.listenBookmarkEvents();
    const { search: s, bookmarksGrid, breadcrumb, notes: n } = this.dom;

    // Search
    s.input.addEventListener('input', () => this.handleSearchInput(s.input.value.trim()));
    s.input.addEventListener('keydown', (e) => this.handleSearchKeydown(e));

    // Suggestions click
    s.suggestions.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;

      const url = item.dataset.url;
      const search = item.dataset.search;

      if (url) window.open(url, '_blank');
      else if (search) window.open(`https://www.google.com/search?q=${encodeURIComponent(search)}`, '_blank');

      this.clearSearch();
    });

    // Suggestions mouse tracking
    s.suggestions.addEventListener('mousemove', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;

      const items = [...s.suggestions.querySelectorAll('.suggestion-item')];
      const idx = items.indexOf(item);
      if (idx !== -1 && idx !== this.selectedIndex) {
        this.selectedIndex = idx;
        this.updateSelection();
      }
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!s.input.contains(e.target) && !s.suggestions.contains(e.target)) {
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
    n.area.addEventListener('input', () => this.scheduleNoteSave());
    n.area.addEventListener('blur', async () => {
      clearTimeout(this.saveTimer);
      this.notes.updateContent(n.area.value);
      await this.saveNotes();
    });

    // Invalidate resize cache on window resize
    window.addEventListener('resize', () => this.#clearResizeCache());

    // Notes tabs
    n.tabs.addEventListener('click', async (e) => {
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
        await this.saveNotes();
      }
    });

    n.tabs.addEventListener('keydown', (e) => {
      const input = e.target.closest('.notes-tab-input');
      if (!input) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        this.finishRename(true);
        n.area.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.finishRename(false);
        n.area.focus();
      }
    });

    n.tabs.addEventListener(
      'focusout',
      (e) => {
        const input = e.target.closest('.notes-tab-input');
        if (input && this.notes.editingId) {
          this.finishRename(true);
        }
      },
      true
    );

    // Notes buttons
    n.newBtn.addEventListener('click', async () => {
      this.finishRename(true);
      this.notes.addNote();
      this.renderNotes();
      await this.saveNotes();
    });

    n.deleteBtn.addEventListener('click', async () => {
      this.finishRename(true);
      await this.notes.backupBeforeDelete();
      this.notes.deleteActive();
      this.renderNotes();
      await this.saveNotes();
    });

    n.clearBtn.addEventListener('click', async () => {
      this.finishRename(true);
      if (this.notes.active) this.notes.active.content = '';
      n.area.value = '';
      this.autoResizeNotes();
      await this.saveNotes('Cleared');
    });

    if (n.undoBtn) {
      n.undoBtn.addEventListener('click', () => this.undoDelete());
    }

    if (n.moveLeftBtn) {
      n.moveLeftBtn.addEventListener('click', () => this.moveActiveNote(-1));
    }
    if (n.moveRightBtn) {
      n.moveRightBtn.addEventListener('click', () => this.moveActiveNote(1));
    }

    // Drag & drop note reordering
    let draggedId = null;

    n.tabs.addEventListener('dragstart', (e) => {
      const tab = e.target.closest('.notes-tab');
      if (!tab || this.notes.editingId) {
        e.preventDefault();
        return;
      }
      draggedId = tab.dataset.noteId;
      tab.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedId);
      }
    });

    n.tabs.addEventListener('dragover', (e) => {
      e.preventDefault();
      const tab = e.target.closest('.notes-tab');
      if (!tab || !draggedId || tab.dataset.noteId === draggedId) return;

      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }

      n.tabs.querySelectorAll('.notes-tab').forEach((t) => {
        if (t !== tab) t.classList.remove('drag-over-left', 'drag-over-right');
      });

      const rect = tab.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        tab.classList.add('drag-over-left');
        tab.classList.remove('drag-over-right');
      } else {
        tab.classList.add('drag-over-right');
        tab.classList.remove('drag-over-left');
      }
    });

    n.tabs.addEventListener('dragleave', (e) => {
      const tab = e.target.closest('.notes-tab');
      if (tab) {
        tab.classList.remove('drag-over-left', 'drag-over-right');
      }
    });

    n.tabs.addEventListener('drop', async (e) => {
      e.preventDefault();
      const targetTab = e.target.closest('.notes-tab');
      if (!targetTab || !draggedId) return;

      const targetIdx = parseInt(targetTab.dataset.index, 10);
      const rect = targetTab.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;

      let destinationIdx = targetIdx;
      if (e.clientX > midX) {
        destinationIdx += 1;
      }

      const fromIdx = this.notes.state.notes.findIndex((item) => item.id === draggedId);
      if (fromIdx !== -1 && fromIdx < destinationIdx) {
        destinationIdx -= 1;
      }

      if (this.notes.moveNote(draggedId, destinationIdx)) {
        this.renderNotes();
        await this.saveNotes('Reordered');
      }
    });

    n.tabs.addEventListener('dragend', () => {
      draggedId = null;
      n.tabs.querySelectorAll('.notes-tab').forEach((t) => {
        t.classList.remove('dragging', 'drag-over-left', 'drag-over-right');
      });
    });

    // Keyboard shortcuts for note reordering (Alt+Left, Alt+Right)
    document.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const isNotesAreaFocused = document.activeElement === n.area;
        const isTabFocused = n.tabs.contains(document.activeElement);
        if (isNotesAreaFocused || isTabFocused) {
          e.preventDefault();
          this.moveActiveNote(e.key === 'ArrowLeft' ? -1 : 1);
        }
      }
    });

    // Info Bar
    this.dom.info.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dom.info.panel.classList.toggle('active');
    });

    this.dom.info.link.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: 'chrome://bookmarks' });
      } else {
        window.open('chrome://bookmarks', '_blank');
      }
    });

    document.addEventListener('click', (e) => {
      if (!this.dom.info.btn.contains(e.target) && !this.dom.info.panel.contains(e.target)) {
        this.dom.info.panel.classList.remove('active');
      }
    });

    if (n.exportBtn) {
      n.exportBtn.addEventListener('click', () => {
        this.notes.exportToFile();
        this.setNotesStatus('Exported');
      });
    }

    if (n.importBtn && n.importFile) {
      n.importBtn.addEventListener('click', () => n.importFile.click());
      n.importFile.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          await this.notes.importFromFile(file);
          this.renderNotes();
          this.setNotesStatus('Imported');
        } catch (err) {
          console.error('Import failed:', err);
          this.setNotesStatus('Import failed');
        }
        n.importFile.value = '';
      });
    }

    // Focus management
    window.addEventListener('focus', () => s.input.focus());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) s.input.focus();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new App().init());