// UI module - Handles all DOM manipulation, event handlers, and user interactions
// Depends on search, shortcuts, and extension modules

// Wait for dependencies to be available
(function() {
  if (!window.utils) {
    setTimeout(arguments.callee, 10);
    return;
  }

// Use shared utility functions directly
const $ = window.utils.$;
const $$ = window.utils.$$;
const on = window.utils.on;
const escapeHTML = window.utils.escapeHTML;

// Wait for shortcuts module to be available for the functions we use from it
function waitForShortcutsModule() {
  if (!window.shortcutsModule) {
    setTimeout(waitForShortcutsModule, 10);
    return;
  }
  initUIModule();
}

function initUIModule() {
const state = window.shortcutsModule.state;
const store = window.shortcutsModule.store;
const findById = window.shortcutsModule.findById;
const listForContext = window.shortcutsModule.listForContext;
const setListForContext = window.shortcutsModule.setListForContext;
const removeById = window.shortcutsModule.removeById;
const reorderWithin = window.shortcutsModule.reorderWithin;
const tileHTML = window.shortcutsModule.tileHTML;
const clearDropHighlights = window.shortcutsModule.clearDropHighlights;
const uid = window.shortcutsModule.uid;

// DOM element references
const sc = $('#shortcuts');
const scGrid = $('#scGrid');
const scAdd = $('#scAdd');
const scAddFolder = $('#scAddFolder');
const scEdit = $('#scEdit');
const scEditIcon = $('#scEditIcon');
const scExport = $('#scExport');
const scImport = $('#scImport');
const scImportFile = $('#scImportFile');

const folderView = $('#folderView');
const fvGrid = $('#fvGrid');
const fvTitle = $('#fvTitle');
const fvBack = $('#fvBack');
const fvAdd = $('#fvAdd');
const fvToggleEdit = $('#fvToggleEdit');
const fvToggleIcon = $('#fvToggleIcon');

const dialog = $('#scDialog');
const overlay = $('#scOverlay');
const scForm = $('#scForm');
const scDialogTitle = $('#scDialogTitle');
const inputTitle = $('#scTitle');
const inputUrl = $('#scUrl');
const rowUrl = $('#rowUrl');
const rowLoc = $('#rowLocation');
const selectLocation = $('#scLocation');
const scLocationLabel = $('#scLocationLabel');
const btnCancel = $('#scCancel');

// Dialog state management
let dialogState = { mode: 'link', editId: null };
let dialogFocusableElements = [];
let previousFocusElement = null;

// Focus management functions
const getFocusableElements = (container) => {
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
  ));
};

const trapFocus = (e) => {
  if (e.key !== 'Tab') return;
  
  const firstElement = dialogFocusableElements[0];
  const lastElement = dialogFocusableElements[dialogFocusableElements.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    }
  } else {
    if (document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }
};

// Dialog functions
const buildLocationOptions = () => {
  const options = [['root', 'Top level']];
  for (const it of state.items) { 
    if (it.type === 'folder') options.push([it.id, `Folder: ${it.title}`]); 
  }
  selectLocation.innerHTML = options.map(([v,t]) => `<option value="${v}">${escapeHTML(t)}</option>`).join('');
};

const openDialog = (mode='link', preset = {}, editId = null) => {
  // Store the element that opened the dialog
  previousFocusElement = document.activeElement;
  
  dialogState = { mode, editId };
  scDialogTitle.textContent =
    editId ? (mode === 'folder' ? 'Rename folder' : 'Edit shortcut')
           : (mode === 'folder' ? 'New folder'   : 'Add shortcut');

  rowUrl.style.display = mode === 'link' ? 'flex' : 'none';

  const showLocation = (mode === 'link');
  rowLoc.style.display = showLocation ? 'flex' : 'none';
  if (showLocation) {
    buildLocationOptions();
    scLocationLabel.textContent = editId ? 'Move to' : 'Add to';
    let currentLoc = 'root';
    if (editId) {
      const found = findById(editId);
      if (found) currentLoc = found.parent?.id || 'root';
    } else {
      currentLoc = preset.location ?? (state.folderOpen || 'root');
    }
    selectLocation.value = currentLoc;
  }

  inputTitle.value = preset.title || '';
  inputUrl.value = preset.url || '';
  overlay.classList.add('show');
  dialog.classList.add('show');
  
  // Setup focus trap
  dialogFocusableElements = getFocusableElements(dialog);
  document.addEventListener('keydown', trapFocus);
  
  // Focus first element
  if (dialogFocusableElements.length > 0) {
    dialogFocusableElements[0].focus();
  } else {
    inputTitle.focus();
  }
};

const closeDialog = () => { 
  dialog.classList.remove('show'); 
  overlay.classList.remove('show'); 
  
  // Remove focus trap
  document.removeEventListener('keydown', trapFocus);
  dialogFocusableElements = [];
  
  // Return focus to the element that opened the dialog
  if (previousFocusElement && typeof previousFocusElement.focus === 'function') {
    previousFocusElement.focus();
  }
  previousFocusElement = null;
};

const openEdit = (id) => {
  const found = findById(id);
  if (!found) return;
  const it = found.item;
  if (it.type === 'folder') openDialog('folder', { title: it.title }, it.id);
  else openDialog('link', { title: it.title, url: it.url }, it.id);
};

// Folder management
const openFolder = (folderId) => {
  const f = findById(folderId)?.item;
  if (!f || f.type !== 'folder') return;
  state.folderOpen = folderId;
  state.folderEdit = false;
  fvTitle.textContent = f.title;
  renderGrid(fvGrid, folderId);
  folderView.classList.add('show');
  folderView.setAttribute('aria-hidden', 'false');
  render();
};

const closeFolder = () => {
  state.folderOpen = null;
  state.folderEdit = false;
  folderView.classList.remove('show', 'edit');
  folderView.setAttribute('aria-hidden', 'true');
  render();
};

// Rendering functions
const renderGrid = (gridEl, ctx='root') => {
  const list = listForContext(ctx);
  const editable = ctx === 'root' ? state.edit : state.folderEdit;
  gridEl.dataset.context = ctx;
  gridEl.innerHTML = list.map((it, i) => tileHTML(it, i, editable)).join('');
};

const render = () => {
  renderGrid(scGrid, 'root');
  sc.classList.toggle('edit', state.edit);
  scEdit.setAttribute('aria-pressed', String(state.edit));
  scEditIcon.innerHTML = state.edit
    ? '<path d="M5 12h14M5 6h14M5 18h14"></path>'
    : '<path d="M4 21h4l11-11a2.5 2.5 0 0 0-4-4L4 17v4z"></path>';

  if (state.folderOpen) {
    const f = findById(state.folderOpen)?.item;
    if (!f) { closeFolder(); }
    else {
      fvTitle.textContent = f.title;
      renderGrid(fvGrid, state.folderOpen);
      folderView.classList.toggle('edit', state.folderEdit);
      fvToggleEdit.setAttribute('aria-pressed', String(state.folderEdit));
      fvToggleIcon.innerHTML = state.folderEdit
        ? '<path d="M5 12h14M5 6h14M5 18h14"></path>'
        : '<path d="M4 21h4l11-11a2.5 2.5 0 0 0-4-4L4 17v4z"></path>';
    }
  }
  store.save(state.items);
};

// Drag and drop functionality
let dragInfo = null;
const isGridEditable = (grid) => (grid === scGrid ? state.edit : state.folderEdit);

const attachDnD = (grid) => {
  on(grid, 'dragstart', (e) => {
    const tile = e.target.closest('.tile'); if (!tile) return;
    const currentGrid = tile.closest('ul');
    if (!isGridEditable(currentGrid)) return;
    dragInfo = { id: tile.dataset.id, fromCtx: currentGrid?.dataset?.context || 'root' };
    tile.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', dragInfo.id); } catch {}
  });
  
  on(grid, 'dragend', (e) => {
    const tile = e.target.closest('.tile'); if (tile) tile.classList.remove('dragging');
    dragInfo = null; clearDropHighlights();
  });
  
  on(grid, 'dragover', (e) => {
    const currentGrid = e.currentTarget;
    if (!isGridEditable(currentGrid) || !dragInfo) return;
    e.preventDefault();
    const overTile = e.target.closest('.tile');
    clearDropHighlights();
    if (overTile) {
      const type = overTile.dataset.type;
      if (type === 'folder' && findById(dragInfo.id)?.item.type === 'link') overTile.classList.add('drop-into');
    }
  });
  
  on(grid, 'drop', async (e) => {
    const currentGrid = e.currentTarget;
    if (!isGridEditable(currentGrid) || !dragInfo) return;
    e.preventDefault();

    const toCtx = currentGrid.dataset.context || 'root';
    const overTile = e.target.closest('.tile');
    const dragged = findById(dragInfo.id)?.item;
    if (!dragged) return;

    if (overTile) {
      const overId = overTile.dataset.id;
      const overType = overTile.dataset.type;

      if (overType === 'folder' && dragged.type === 'link') {
        if (EXT.isConnected()) {
          const parentId = overId;
          try { await EXT.moveNode({ id: dragged.id, parentId }); await window.shortcutsModule.refreshFromExtension(); } catch {}
        } else {
          removeById(dragInfo.id);
          const folder = findById(overId)?.item;
          folder.children = folder.children || [];
          folder.children.push(dragged);
          render();
        }
        return;
      }

      if (dragInfo.fromCtx !== toCtx) {
        if (EXT.isConnected()) {
          const parentId = (toCtx === 'root') ? EXT.getToolbarRootId() : toCtx;
          const list = listForContext(toCtx);
          const toIdx = Math.max(0, list.findIndex(x => x.id === overId));
          try { await EXT.moveNode({ id: dragged.id, parentId, index: toIdx }); await window.shortcutsModule.refreshFromExtension(); } catch {}
        } else {
          const extracted = removeById(dragInfo.id); if (!extracted) return;
          const list = listForContext(toCtx).slice();
          const toIdx = list.findIndex(x => x.id === overId);
          list.splice(toIdx < 0 ? list.length : toIdx, 0, extracted);
          setListForContext(toCtx, list); render();
        }
        return;
      } else {
        if (EXT.isConnected()) {
          const parentId = (toCtx === 'root') ? EXT.getToolbarRootId() : toCtx;
          const list = listForContext(toCtx);
          const toIdx = Math.max(0, list.findIndex(x => x.id === overId));
          try { await EXT.moveNode({ id: dragged.id, parentId, index: toIdx }); await window.shortcutsModule.refreshFromExtension(); } catch {}
        } else {
          reorderWithin(toCtx, dragInfo.id, overId); render();
        }
        return;
      }
    } else {
      if (dragInfo.fromCtx !== toCtx) {
        if (EXT.isConnected()) {
          const parentId = (toCtx === 'root') ? EXT.getToolbarRootId() : toCtx;
          try { await EXT.moveNode({ id: dragged.id, parentId }); await window.shortcutsModule.refreshFromExtension(); } catch {}
        } else {
          const extracted = removeById(dragInfo.id); if (!extracted) return;
          const list = listForContext(toCtx).slice(); list.push(extracted);
          setListForContext(toCtx, list); render();
        }
      } else {
        if (EXT.isConnected()) {
          const parentId = (toCtx === 'root') ? EXT.getToolbarRootId() : toCtx;
          try { await EXT.moveNode({ id: dragged.id, parentId }); await window.shortcutsModule.refreshFromExtension(); } catch {}
        } else {
          reorderWithin(toCtx, dragInfo.id, null); render();
        }
      }
    }
  });
};

// Import sanitization
const sanitizeImport = (input) => {
  const out = [];
  const seen = new Set();
  const newId = (isFolder) => {
    let id; do { id = uid(isFolder ? 'fld' : 'sc'); } while (seen.has(id));
    seen.add(id); return id;
  };
  const validUrl = (u) => {
    try { if (!/^https?:\/\//i.test(u)) u = 'https://' + u; const url = new URL(u); return url.href; }
    catch { return null; }
  };
  const addLink = (title, url) => {
    const href = validUrl(url); if (!href) return null;
    return { id: newId(false), type: 'link', title: String(title||new URL(href).hostname.replace(/^www\\./,'')), url: href };
  };
  const each = Array.isArray(input) ? input : (Array.isArray(input?.items) ? input.items : []);
  for (const it of each) {
    if (!it || typeof it !== 'object') continue;
    if (it.type === 'folder') {
      const folder = { id: newId(true), type: 'folder', title: String(it.title || 'Folder'), children: [] };
      const kids = Array.isArray(it.children) ? it.children : [];
      for (const ch of kids) {
        if (ch?.type === 'link') {
          const link = addLink(ch.title, ch.url);
          if (link) folder.children.push(link);
        } else if (ch?.type === 'folder' && Array.isArray(ch.children)) {
          for (const sub of ch.children) {
            if (sub?.type === 'link') {
              const link = addLink(sub.title, sub.url);
              if (link) folder.children.push(link);
            }
          }
        }
      }
      if (folder.children.length) out.push(folder);
    } else if (it.type === 'link') {
      const link = addLink(it.title, it.url);
      if (link) out.push(link);
    }
  }
  return out;
};

// Event handlers setup
const setupEventHandlers = () => {
  // Main shortcuts grid click handler
  on(scGrid, 'click', async (e) => {
    const tile = e.target.closest('.tile'); if (!tile) return;
    const rm = e.target.closest('.remove');
    const ed = e.target.closest('.edit');

    if (rm && state.edit) {
      const id = tile.dataset.id;
      if (EXT.isConnected()) { try { await EXT.removeNode({ id }); await window.shortcutsModule.refreshFromExtension(); } catch {} }
      else { removeById(id); render(); }
      return;
    }
    if (ed && state.edit) { openEdit(tile.dataset.id); return; }
    if (state.edit) return;

    const type = tile.dataset.type;
    const id = tile.dataset.id;
    const found = findById(id)?.item; if (!found) return;

    if (type === 'folder') openFolder(id);
    else if (type === 'link') {
      if (e.metaKey || e.ctrlKey) {
        window.open(found.url, '_blank', 'noopener');
      } else {
        window.location.replace(found.url);
      }
    }
  });

  // Folder view grid click handler
  on(fvGrid, 'click', async (e) => {
    const tile = e.target.closest('.tile'); if (!tile) return;
    const rm = e.target.closest('.remove');
    const ed = e.target.closest('.edit');

    if (rm && state.folderEdit) {
      const id = tile.dataset.id;
      if (EXT.isConnected()) { try { await EXT.removeNode({ id }); await window.shortcutsModule.refreshFromExtension(); } catch {} }
      else { removeById(id); render(); }
      return;
    }
    if (ed && state.folderEdit) { openEdit(tile.dataset.id); return; }
    if (state.folderEdit) return;

    const type = tile.dataset.type;
    const id = tile.dataset.id;
    const found = findById(id)?.item; if (!found) return;

    if (type === 'folder') openFolder(id); // not expected (one-level model), but safe
    else if (type === 'link') {
      if (e.metaKey || e.ctrlKey) {
        window.open(found.url, '_blank', 'noopener');
      } else {
        window.location.replace(found.url);
      }
    }
  });

  // Setup drag and drop for both grids
  attachDnD(scGrid);
  attachDnD(fvGrid);

  // Button event handlers
  on(scAdd, 'click', () => openDialog('link'));
  on(scAddFolder, 'click', () => openDialog('folder'));
  on(scEdit, 'click', () => { state.edit = !state.edit; render(); });

  on(fvBack, 'click', closeFolder);
  on(fvAdd, 'click', () => openDialog('link', { location: state.folderOpen }));
  on(fvToggleEdit, 'click', () => { state.folderEdit = !state.folderEdit; render(); });

  // Dialog event handlers
  on(overlay, 'click', closeDialog);
  on(btnCancel, 'click', closeDialog);
  
  // Form submit handler
  on(scForm, 'submit', async (e) => {
    e.preventDefault();
    const title = inputTitle.value.trim();
    const mode = dialogState.mode;

    if (dialogState.editId) {
      const found = findById(dialogState.editId);
      if (!found) { closeDialog(); return; }

      if (mode === 'folder') {
        if (EXT.isConnected()) {
          try { await EXT.updateNode({ id: found.item.id, title: title || 'Folder' }); await window.shortcutsModule.refreshFromExtension(); } catch {}
        } else {
          found.item.title = title || 'Folder'; render();
        }
        closeDialog(); return;
      }

      let url = inputUrl.value.trim();
      try {
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        new URL(url);
      } catch { alert('Please enter a valid URL.'); return; }
      const name = title || (new URL(url).hostname.replace(/^www\\./,''));
      const currentLoc = found.parent?.id || 'root';
      const newLoc = (rowLoc.style.display !== 'none') ? (selectLocation.value || currentLoc) : currentLoc;

      if (EXT.isConnected()) {
        try {
          await EXT.updateNode({ id: found.item.id, title: name, url });
          if (newLoc !== currentLoc) {
            const parentId = (newLoc === 'root') ? EXT.getToolbarRootId() : newLoc;
            await EXT.moveNode({ id: found.item.id, parentId });
          }
          await window.shortcutsModule.refreshFromExtension();
        } catch {}
      } else {
        if (newLoc === currentLoc) {
          found.item.title = name; found.item.url = url;
        } else {
          const updated = removeById(dialogState.editId);
          if (updated) {
            updated.title = name; updated.url = url;
            if (newLoc === 'root') state.items.push(updated);
            else {
              const folder = findById(newLoc)?.item;
              folder.children = folder.children || [];
              folder.children.push(updated);
            }
          }
        }
        render();
      }
      closeDialog(); return;
    }

    if (mode === 'link') {
      let url = inputUrl.value.trim();
      if (!url) return;
      try {
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        new URL(url);
      } catch { alert('Please enter a valid URL.'); return; }
      const name = title || (new URL(url).hostname.replace(/^www\\./,''));
      const loc = (selectLocation.value || 'root');
      if (EXT.isConnected()) {
        const parentId = (loc === 'root') ? EXT.getToolbarRootId() : loc;
        try { await EXT.createLink({ parentId, title: name, url }); await window.shortcutsModule.refreshFromExtension(); } catch {}
      } else {
        const item = { id: uid('sc'), type: 'link', title: name, url };
        if (loc === 'root') state.items.push(item);
        else {
          const folder = findById(loc)?.item;
          if (folder?.type === 'folder') { folder.children = folder.children || []; folder.children.push(item); }
          else state.items.push(item);
        }
      }
    } else {
      const name = title || 'New folder';
      if (EXT.isConnected()) {
        try { await EXT.createFolder({ parentId: EXT.getToolbarRootId(), title: name }); await window.shortcutsModule.refreshFromExtension(); } catch {}
      } else {
        state.items.push({ id: uid('fld'), type: 'folder', title: name, children: [] });
      }
    }

    if (!EXT.isConnected()) render();
    closeDialog();
    inputTitle.value = ''; inputUrl.value = '';
  });

  // Export/Import handlers
  on(scExport, 'click', () => store.export(state.items));
  on(scImport, 'click', () => {
    if (EXT.isConnected()) { alert('Import is disabled while syncing with bookmarks.'); return; }
    scImportFile.click();
  });
  on(scImportFile, 'change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await store.import(file);
      if (!imported.length) { alert('No shortcuts found in file.'); return; }
      if (confirm('Replace current shortcuts with imported data?\\nPress OK to Replace, Cancel to Merge.')) {
        state.items = imported;
      } else {
        state.items = state.items.concat(imported);
      }
      render();
    } catch (err) {
      console.warn('Import failed:', err);
      alert('Could not import file. Please ensure it is a valid shortcuts JSON.');
    }
    e.target.value = '';
  });

  // Search UI setup  
  const form = $('#form');
  const q = $('#q');
  const go = $('#go');
  const voice = $('#voice');
  const lensBtn = $('#lensBtn');
  const ai = $('#ai');
  const sugg = $('#suggest');
  
  // Initialize voice search icon
  voice.innerHTML = window.searchModule.VOICE_ICONS.mic;
  voice.title = 'Search by voice';
  voice.setAttribute('aria-label', 'Search by voice');

  // Search form handlers
  on(form, 'submit', (e) => {
    e.preventDefault();
    window.searchModule.submitSearch();
  });
  
  on(q, 'keydown', window.searchModule.handleSearchInput);
  
  on(sugg, 'click', (e) => {
    const li = e.target.closest('li'); if (!li) return;
    const type = li.dataset.type;
    if (type === 'bookmark' && li.dataset.url) {
      sugg.classList.remove('show'); 
      window.location.replace(li.dataset.url);
      return;
    }
    const t = li.querySelector('span')?.textContent?.trim();
    if (t) { 
      q.value = t; 
      sugg.classList.remove('show'); 
      window.searchModule.submitSearch(); 
    }
  });
  
  on(sugg, 'blur', () => setTimeout(()=>{ 
    sugg.classList.remove('show'); 
    q.setAttribute('aria-expanded', 'false'); 
  }, 120));

  on(voice, 'click', window.searchModule.handleVoiceSearch);

  on(lensBtn, 'click', () => {
    window.open('https://lens.google.com/', '_blank', 'noopener');
  });

  on(ai, 'click', () => {
    const v = q.value.trim(); 
    const base = 'https://www.google.com/search?udm=50';
    window.location.replace(v ? `${base}&q=${encodeURIComponent(v)}` : base);
  });
};

// Export the UI module
window.uiModule = {
  render,
  setupEventHandlers,
  openFolder,
  closeFolder,
  openDialog,
  closeDialog
};

} // End initUIModule function

// Start waiting for shortcuts module
waitForShortcutsModule();

})(); // End dependency wait wrapper