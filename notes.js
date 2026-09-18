import { CONFIG } from './config.js';
import { Storage } from './storage.js';
import { generateId, clamp } from './utils.js';

class NotesManager {
  constructor() {
    this.state = { notes: [], activeId: null };
    this.editingId = null;
    this.lastDeletedNote = null;
    // Last known synced state (from storage). Used for three-way merges
    // so a stale tab never silently overwrites changes made in another tab.
    this._base = null;
  }

  static clone(state) {
    return state ? JSON.parse(JSON.stringify(state)) : state;
  }

  static _noteKey(note) {
    return JSON.stringify([note.title, note.content, note.updatedAt || 0]);
  }

  static _sameOrder(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((n, i) => n.id === b[i].id);
  }

  static _ensureTimestamps(state) {
    let changed = false;
    for (const n of state?.notes || []) {
      if (typeof n.updatedAt !== 'number') {
        n.updatedAt = 0;
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Three-way merge of note states.
   * - Per-note content/title: last-writer-wins via updatedAt, with
   *   delete-vs-edit resolved in favour of the edit (to avoid data loss).
   * - Deletes propagate: an id removed on one side stays removed unless the
   *   other side modified that note since the base snapshot.
   * - Order: keeps the side that reordered relative to base (remote wins ties).
   * - activeId: keeps local if it changed locally, otherwise takes remote.
   */
  static merge(base, local, remote) {
    const b = base || { notes: [], activeId: null };
    const l = local || { notes: [], activeId: null };
    const r = remote || { notes: [], activeId: null };

    const bMap = new Map((b.notes || []).map((n) => [n.id, n]));
    const lMap = new Map((l.notes || []).map((n) => [n.id, n]));
    const rMap = new Map((r.notes || []).map((n) => [n.id, n]));

    const allIds = new Set([...bMap.keys(), ...lMap.keys(), ...rMap.keys()]);
    const mergedById = new Map();

    for (const id of allIds) {
      const bn = bMap.get(id);
      const ln = lMap.get(id);
      const rn = rMap.get(id);

      if (ln && rn && bn) {
        const localChanged = NotesManager._noteKey(ln) !== NotesManager._noteKey(bn);
        const remoteChanged = NotesManager._noteKey(rn) !== NotesManager._noteKey(bn);
        if (!localChanged && !remoteChanged) {
          mergedById.set(id, ln);
        } else if (localChanged && !remoteChanged) {
          mergedById.set(id, ln);
        } else if (!localChanged && remoteChanged) {
          mergedById.set(id, rn);
        } else {
          // Both changed: last-writer-wins by updatedAt (local wins ties
          // so in-progress typing, which just bumped updatedAt, is kept).
          mergedById.set(id, (ln.updatedAt || 0) >= (rn.updatedAt || 0) ? ln : rn);
        }
      } else if (ln && !rn && bn) {
        // Deleted remotely. Keep local copy only if it was edited since base.
        if (NotesManager._noteKey(ln) !== NotesManager._noteKey(bn)) {
          mergedById.set(id, ln);
        }
      } else if (!ln && rn && bn) {
        // Deleted locally. Keep remote copy only if it was edited since base.
        if (NotesManager._noteKey(rn) !== NotesManager._noteKey(bn)) {
          mergedById.set(id, rn);
        }
      } else if (!ln && !rn) {
        // Deleted on both sides (or never existed on one side) -> drop.
      } else {
        // New note (not in base): added locally and/or remotely -> keep.
        // Same id added on both sides: LWW.
        if (ln && rn) {
          mergedById.set(id, (ln.updatedAt || 0) >= (rn.updatedAt || 0) ? ln : rn);
        } else {
          mergedById.set(id, ln || rn);
        }
      }
    }

    // Ordering: prefer the side that reordered relative to base.
    const baseIds = (b.notes || []).map((n) => n.id);
    const localIds = (l.notes || []).map((n) => n.id).filter((id) => mergedById.has(id));
    const remoteIds = (r.notes || []).map((n) => n.id).filter((id) => mergedById.has(id));
    const baseFiltered = baseIds.filter((id) => mergedById.has(id));

    const localReordered = JSON.stringify(localIds) !== JSON.stringify(baseFiltered);
    const remoteReordered = JSON.stringify(remoteIds) !== JSON.stringify(baseFiltered);

    let orderedIds;
    if (localReordered && !remoteReordered) {
      orderedIds = localIds;
    } else if (remoteReordered && !localReordered) {
      orderedIds = remoteIds;
    } else if (remoteReordered && localReordered) {
      // Both reordered: remote wins, then append any local-only ids.
      orderedIds = [...remoteIds];
      for (const id of localIds) {
        if (!orderedIds.includes(id)) orderedIds.push(id);
      }
    } else {
      // Neither reordered: use remote order, append local additions.
      orderedIds = [...remoteIds];
      for (const id of localIds) {
        if (!orderedIds.includes(id)) orderedIds.push(id);
      }
    }
    // Include any merged ids missing from both orders (safety net).
    for (const id of mergedById.keys()) {
      if (!orderedIds.includes(id)) orderedIds.push(id);
    }

    const notes = orderedIds.map((id) => mergedById.get(id)).filter(Boolean);

    // activeId: local wins if it changed locally, else remote.
    let activeId = null;
    const localActiveChanged = (l.activeId || null) !== (b.activeId || null);
    if (localActiveChanged && mergedById.has(l.activeId)) {
      activeId = l.activeId;
    } else if (mergedById.has(r.activeId)) {
      activeId = r.activeId;
    } else if (mergedById.has(l.activeId)) {
      activeId = l.activeId;
    } else if (notes.length) {
      activeId = notes[0].id;
    }

    return { notes, activeId };
  }

  async init() {
    await Storage.migrate(CONFIG.NOTES_STORAGE_KEY);
    await Storage.migrate(CONFIG.NOTES_BACKUP_KEY);

    const saved = await Storage.get(CONFIG.NOTES_STORAGE_KEY);

    if (saved?.notes?.length) {
      this.state = saved;
      NotesManager._ensureTimestamps(this.state);
      if (!this.state.notes.some((n) => n.id === this.state.activeId)) {
        this.state.activeId = this.state.notes[0].id;
      }
    } else {
      this.addNote();
    }

    this._base = NotesManager.clone(this.state);
    await this.save();
  }

  _touch(note) {
    if (note) note.updatedAt = Date.now();
  }

  async save() {
    // Read-modify-write so a stale tab merges instead of clobbering
    // notes added/edited in another tab.
    try {
      const remote = await Storage.get(CONFIG.NOTES_STORAGE_KEY);
      if (remote?.notes) {
        NotesManager._ensureTimestamps(remote);
        const merged = NotesManager.merge(this._base, this.state, remote);
        this.state = merged;
        // Keep selection valid after merge.
        if (!this.state.notes.some((n) => n.id === this.state.activeId) && this.state.notes.length) {
          this.state.activeId = this.state.notes[0].id;
        }
      }
    } catch {
      // Fall through and write local state on read errors.
    }

    const ok = await Storage.set(CONFIG.NOTES_STORAGE_KEY, this.state);
    this._base = NotesManager.clone(this.state);
    return ok;
  }

  /**
   * Merge an externally-changed state (from another tab) into this tab.
   * @param {object} remoteState state read from storage
   * @param {object} opts { preserveActiveId: boolean } keep local selection
   * @returns {boolean} true if local state changed
   */
  applyExternal(remoteState, opts = {}) {
    if (!remoteState?.notes) return false;
    NotesManager._ensureTimestamps(remoteState);

    const before = JSON.stringify(this.state);
    const merged = NotesManager.merge(this._base, this.state, remoteState);

    if (opts.preserveActiveId && this.state.activeId && merged.notes.some((n) => n.id === this.state.activeId)) {
      merged.activeId = this.state.activeId;
    }

    this.state = merged;
    // Remote is now the last known synced state; local edits remain
    // represented by the difference between state and _base.
    this._base = NotesManager.clone(remoteState);

    // If we are mid-rename of a note that no longer exists, cancel editing.
    if (this.editingId && !this.state.notes.some((n) => n.id === this.editingId)) {
      this.editingId = null;
    }

    return JSON.stringify(this.state) !== before;
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
    note.updatedAt = Date.now();
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
      updatedAt: Date.now(),
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

  moveNote(id, targetIndex) {
    const fromIdx = this.state.notes.findIndex((n) => n.id === id);
    if (fromIdx === -1) return false;

    const clampedIdx = Math.max(0, Math.min(targetIndex, this.state.notes.length - 1));
    if (fromIdx === clampedIdx) return false;

    const [moved] = this.state.notes.splice(fromIdx, 1);
    this.state.notes.splice(clampedIdx, 0, moved);
    return true;
  }

  moveActiveNote(offset) {
    const fromIdx = this.state.notes.findIndex((n) => n.id === this.state.activeId);
    if (fromIdx === -1) return false;

    return this.moveNote(this.state.activeId, fromIdx + offset);
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
      const next = clamp(content, CONFIG.NOTES_MAX_CHARS);
      if (next !== this.active.content) {
        this.active.content = next;
        this._touch(this.active);
      }
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
      if (title) {
        note.title = title;
        this._touch(note);
      }
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
    const now = Date.now();
    for (const n of data.notes) {
      if (typeof n.updatedAt !== 'number') n.updatedAt = now;
      if (!n.id) n.id = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    this.state = data;
    if (!this.state.notes.some((n) => n.id === this.state.activeId)) {
      this.state.activeId = this.state.notes[0].id;
    }
    await this.save();
  }
}

export { NotesManager };
