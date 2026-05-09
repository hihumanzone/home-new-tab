import { CONFIG } from './config.js';
import { Storage } from './storage.js';
import { generateId, clamp } from './utils.js';

class NotesManager {
  constructor() {
    this.state = { notes: [], activeId: null };
    this.editingId = null;
    this.lastDeletedNote = null;
  }

  async init() {
    await Storage.migrate(CONFIG.NOTES_STORAGE_KEY);
    await Storage.migrate(CONFIG.NOTES_BACKUP_KEY);

    const saved = await Storage.get(CONFIG.NOTES_STORAGE_KEY);

    if (saved?.notes?.length) {
      this.state = saved;
      if (!this.state.notes.some((n) => n.id === this.state.activeId)) {
        this.state.activeId = this.state.notes[0].id;
      }
    } else {
      this.addNote();
    }

    await this.save();
  }

  async save() {
    return Storage.set(CONFIG.NOTES_STORAGE_KEY, this.state);
  }

  async backupBeforeDelete() {
    this.lastDeletedNote = this.active
      ? { note: { ...this.active }, idx: this.state.notes.findIndex((n) => n.id === this.state.activeId) }
      : null;
    await Storage.set(CONFIG.NOTES_BACKUP_KEY, this.lastDeletedNote);
  }

  async restoreDeleted() {
    if (!this.lastDeletedNote?.note) return false;
    const { note, idx } = this.lastDeletedNote;
    this.state.notes.splice(Math.min(idx, this.state.notes.length), 0, note);
    this.state.activeId = note.id;
    this.lastDeletedNote = null;
    await Storage.set(CONFIG.NOTES_BACKUP_KEY, null);
    return true;
  }

  get active() {
    return this.state.notes.find((n) => n.id === this.state.activeId) || null;
  }

  addNote() {
    const note = {
      id: generateId(),
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
      this.active.content = clamp(content, CONFIG.NOTES_MAX_CHARS);
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
      const title = clamp(newTitle?.trim() || '', CONFIG.NOTES_TITLE_MAX_CHARS);
      note.title = title || note.title;
    }

    this.editingId = null;
    return true;
  }

  exportToFile() {
    const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'newtab-notes-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async importFromFile(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data?.notes?.length) throw new Error('Invalid notes file');
    this.state = data;
    if (!this.state.notes.some((n) => n.id === this.state.activeId)) {
      this.state.activeId = this.state.notes[0].id;
    }
    await this.save();
  }
}

export { NotesManager };
