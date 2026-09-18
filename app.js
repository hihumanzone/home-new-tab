import { CONFIG } from './config.js';
import { $, debounce } from './utils.js';
import { BookmarkManager } from './bookmarks.js';
import { faviconManager } from './favicon.js';
import { NotesManager } from './notes.js';
import { Renderer } from './renderer.js';
import { Storage } from './storage.js';

class App {
  constructor() {
    this.bookmarks = new BookmarkManager();
    this.favicon = faviconManager;
    this.notes = new NotesManager();

    this.currentFolder = null;
    this.saveTimer = null;
    this.statusTimer = null;
    this.clockTimer = null;
    this.notesResizeCache = null;

    this.dom = {};
  }

  async init() {
    this.cacheDom();
    this.initClock();

    try {
      const bar = await this.bookmarks.load();
      if (bar) this.displayFolder(bar);

      await this.notes.init();
      this.renderNotes();

      this.bindEvents();

      // Ensure no in-page element holds focus on load so the browser retains focus on the address bar
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    } catch (error) {
      console.error('Init error:', error);
      this.dom.bookmarksGrid.innerHTML =
        '<div class="empty-state">Failed to load bookmarks. <span class="empty-state retry-btn" id="retryBtn">Retry</span></div>';
      document.getElementById('retryBtn')?.addEventListener('click', () => this.init());
    }
  }

  initClock() {
    const update = () => {
      const now = new Date();
      const rawHours = now.getHours();
      const hours12 = rawHours % 12 || 12;
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const ampm = rawHours >= 12 ? 'PM' : 'AM';

      if (this.dom.clock) {
        this.dom.clock.innerHTML = `${hours12}:${minutes} <span class="clock-ampm">${ampm}</span>`;
        this.dom.clock.setAttribute('aria-label', `${hours12}:${minutes} ${ampm}`);
      }

      if (this.dom.date) {
        this.dom.date.textContent = now.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
      }

      if (this.dom.greeting) {
        let greeting = 'Good evening';
        if (rawHours >= 5 && rawHours < 12) greeting = 'Good morning';
        else if (rawHours >= 12 && rawHours < 17) greeting = 'Good afternoon';
        else if (rawHours >= 17 && rawHours < 22) greeting = 'Good evening';
        else greeting = 'Good night';
        this.dom.greeting.textContent = greeting;
      }
    };

    update();
    this.clockTimer = setInterval(update, 1000);
  }

  cacheDom() {
    this.dom = {
      clock: $('clock'),
      date: $('date'),
      greeting: $('greeting'),
      bookmarksGrid: $('bookmarksGrid'),
      breadcrumb: $('breadcrumb'),
      manageBookmarksBtn: $('manageBookmarksBtn'),
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

      let targetFolder = null;
      if (this.currentFolder?.id) {
        targetFolder =
          this.currentFolder.id === CONFIG.BOOKMARKS_BAR_ID
            ? bar
            : await this.bookmarks.getFolder(this.currentFolder.id);
      }

      this.displayFolder(targetFolder || bar);
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


  renderNotes() {
    this.dom.notes.tabs.innerHTML = Renderer.notesTabs(
      this.notes.state.notes,
      this.notes.state.activeId,
      this.notes.editingId
    );
    this.dom.notes.area.value = this.notes.active?.content || '';
    this.autoResizeNotes();

    if (this.dom.notes.undoBtn) {
      this.dom.notes.undoBtn.style.display = this.notes.lastDeletedNote?.note ? 'inline-flex' : 'none';
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

  // --------------- Cross-tab notes sync ---------------

  listenNotesSync() {
    Storage.onChanged(CONFIG.NOTES_STORAGE_KEY, (newValue) => {
      if (!newValue?.notes) return;
      this.applyExternalNotes(newValue);
    });
  }

  applyExternalNotes(remoteState) {
    const area = this.dom.notes.area;
    const wasAreaFocused = document.activeElement === area;
    const areaSel =
      wasAreaFocused && typeof area.selectionStart === 'number'
        ? { start: area.selectionStart, end: area.selectionEnd }
        : null;

    // Stash in-progress rename draft so re-render doesn't eat keystrokes.
    const editingId = this.notes.editingId;
    let renameDraft = null;
    if (editingId) {
      const input = this.dom.notes.tabs.querySelector(
        `.notes-tab-input[data-note-id="${editingId}"]`
      );
      if (input) {
        renameDraft = {
          value: input.value,
          focused: document.activeElement === input,
          start: input.selectionStart,
          end: input.selectionEnd,
        };
      }
    }

    // While the user is actively using notes here, keep local tab selection
    // instead of yanking them to the other tab's selected note.
    const preserveActiveId = wasAreaFocused || !!this.saveTimer || !!editingId;

    let changed = false;
    try {
      changed = this.notes.applyExternal(remoteState, { preserveActiveId });
    } catch (err) {
      console.error('Failed to merge notes from another tab:', err);
      return;
    }
    if (!changed) return;

    this.renderNotes();

    // Restore rename draft (local in-progress title wins until committed).
    if (editingId && this.notes.editingId === editingId && renameDraft) {
      const input = this.dom.notes.tabs.querySelector(
        `.notes-tab-input[data-note-id="${editingId}"]`
      );
      if (input) {
        if (input.value !== renameDraft.value) input.value = renameDraft.value;
        if (renameDraft.focused) {
          input.focus({ preventScroll: true });
          try {
            input.setSelectionRange(renameDraft.start, renameDraft.end);
          } catch {
            // Ignore selection errors
          }
        }
      }
    }

    // renderNotes() already set area.value to merged content; restore caret
    // so remote updates don't interrupt local typing.
    if (wasAreaFocused) {
      area.focus({ preventScroll: true });
      if (areaSel) {
        const max = area.value.length;
        try {
          area.setSelectionRange(Math.min(areaSel.start, max), Math.min(areaSel.end, max));
        } catch {
          // Ignore selection errors
        }
      }
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
    this.listenNotesSync();
    const { bookmarksGrid, breadcrumb, notes: n } = this.dom;

    // Bookmarks grid click & keyboard
    bookmarksGrid.addEventListener('click', (e) => {
      const folder = e.target.closest('[data-folder-id]');
      if (folder) this.navigateToFolder(folder.dataset.folderId);
    });

    bookmarksGrid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const folder = e.target.closest('[data-folder-id]');
        if (folder) {
          e.preventDefault();
          this.navigateToFolder(folder.dataset.folderId);
        }
      }
    });

    // Breadcrumb click & keyboard
    breadcrumb.addEventListener('click', (e) => {
      const item = e.target.closest('.breadcrumb-item');
      if (item) this.navigateToFolder(item.dataset.folderId);
    });

    breadcrumb.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const item = e.target.closest('.breadcrumb-item');
        if (item) {
          e.preventDefault();
          this.navigateToFolder(item.dataset.folderId);
        }
      }
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
      this.notes.updateContent('');
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

    // Bookmarks management
    const openBookmarksManager = (e) => {
      e.preventDefault();
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: 'chrome://bookmarks' });
      } else {
        window.open('chrome://bookmarks', '_blank');
      }
    };

    this.dom.manageBookmarksBtn?.addEventListener('click', openBookmarksManager);

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
  }
}

document.addEventListener('DOMContentLoaded', () => new App().init());