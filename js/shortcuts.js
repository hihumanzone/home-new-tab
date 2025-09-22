// Shortcuts/bookmarks management and storage module
// Handles shortcut data, storage, import/export, and state management

// Wait for utils to be available
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

// Storage management
const store = {
  key: 'shortcuts.v1',
  load() {
    if (EXT.isConnected()) return null;
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.items) ? parsed.items : null;
    } catch { return null; }
  },
  save(items) {
    if (EXT.isConnected()) return;
    try { localStorage.setItem(this.key, JSON.stringify({ items })); } catch {}
  },
  export(items) {
    const payload = { version: 1, exportedAt: new Date().toISOString(), items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const pad = (n)=> String(n).padStart(2,'0');
    const d = new Date();
    const name = `shortcuts-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  },
  async import(file) {
    const text = await file.text();
    const json = JSON.parse(text);
    return sanitizeImport(json);
  }
};

// Utility functions
const uid = (p='id') => `${p}_${Math.random().toString(36).slice(2,9)}${Date.now().toString(36)}`;

// Default shortcuts data
const defaultItems = () => ([
  { id: uid('fld'), type: 'folder', title: 'Work', children: [
    { id: uid('sc'), type: 'link', title: 'Gmail', url: 'https://mail.google.com' },
    { id: uid('sc'), type: 'link', title: 'Drive', url: 'https://drive.google.com' }
  ]},
  { id: uid('sc'), type: 'link', title: 'YouTube', url: 'https://youtube.com' },
  { id: uid('sc'), type: 'link', title: 'Maps', url: 'https://maps.google.com' },
  { id: uid('sc'), type: 'link', title: 'Translate', url: 'https://translate.google.com' }
]);

// Application state
const state = {
  items: store.load() || defaultItems(),
  edit: false,
  folderEdit: false,
  folderOpen: null
};

// Extension refresh function
async function refreshFromExtension() {
  try {
    const data = await EXT.getToolbar();
    if (data && Array.isArray(data.items)) {
      state.items = data.items;
      render();
    }
  } catch {}
}
window.__extRefresh = refreshFromExtension;

// Data manipulation helpers
const findById = (id, list=state.items, parent=null) => {
  for (let i=0;i<list.length;i++) {
    const item = list[i];
    if (item.id === id) return { item, parent, index: i, list };
    if (item.type === 'folder' && Array.isArray(item.children)) {
      const found = findById(id, item.children, item);
      if (found) return found;
    }
  }
  return null;
};

const listForContext = (ctx) => (!ctx || ctx === 'root') ? state.items : (findById(ctx)?.item?.children || []);

const setListForContext = (ctx, newList) => {
  if (!ctx || ctx === 'root') state.items = newList;
  else { const f = findById(ctx); if (f?.item?.type === 'folder') f.item.children = newList; }
};

const removeById = (id) => {
  const found = findById(id);
  if (!found) return null;
  const [removed] = found.list.splice(found.index, 1);
  return removed || found.item;
};

// Favicon helper
const faviconFor = (url) => { 
  try { 
    const u = new URL(url); 
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(u.origin)}`; 
  } catch { 
    return ''; 
  } 
};

// Icon templates
const deleteIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M3 6h18"/>
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
  </svg>
`;

const folderIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2z"/>
  </svg>
`;

// Import sanitization
const sanitizeImport = (json) => {
  if (!json) return [];
  let items = json;
  if (typeof json === 'object' && Array.isArray(json.items)) items = json.items;
  if (!Array.isArray(items)) return [];
  
  const walk = (arr) => {
    const out = [];
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue;
      if (it.type === 'link' && typeof it.url === 'string' && it.url.trim()) {
        out.push({
          id: uid('sc'),
          type: 'link',
          title: String(it.title || it.url || 'Link').slice(0, 100),
          url: it.url.slice(0, 2000)
        });
      } else if (it.type === 'folder') {
        const children = Array.isArray(it.children) ? walk(it.children) : [];
        if (children.length > 0) {
          out.push({
            id: uid('fld'),
            type: 'folder',
            title: String(it.title || 'Folder').slice(0, 100),
            children
          });
        }
      }
    }
    return out;
  };
  return walk(items);
};

// HTML generation for tiles
const tileHTML = (it, idx, editable=false) => {
  if (it.type === 'folder') {
    const count = (it.children || []).length;
    return `
      <li class="tile folder" role="listitem" data-id="${it.id}" data-type="folder" data-index="${idx}" draggable="${editable ? 'true':'false'}" title="${escapeHTML(it.title)}">
        <div class="favicon folder-ico" aria-hidden="true">${folderIcon}</div>
        <div class="label">${escapeHTML(it.title)}</div>
        <div class="count">${count}</div>
        <button class="action edit" title="Edit folder" aria-label="Edit folder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 21h4l11-11a2.5 2.5 0 0 0-4-4L4 17v4z"></path>
          </svg>
        </button>
        <button class="action remove" title="Delete" aria-label="Delete">
          ${deleteIcon}
        </button>
      </li>
    `;
  } else {
    const icon = faviconFor(it.url);
    return `
      <li class="tile link" role="listitem" data-id="${it.id}" data-type="link" data-index="${idx}" draggable="${editable ? 'true':'false'}" title="${escapeHTML(it.title)} • ${escapeHTML(it.url)}">
        <div class="favicon" aria-hidden="true">
          ${icon ? `<img src="${icon}" alt="">` : `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="4"></circle>
            </svg>
          `}
        </div>
        <div class="label">${escapeHTML(it.title)}</div>
        <button class="action edit" title="Edit shortcut" aria-label="Edit shortcut">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 21h4l11-11a2.5 2.5 0 0 0-4-4L4 17v4z"></path>
          </svg>
        </button>
        <button class="action remove" title="Delete" aria-label="Delete">
          ${deleteIcon}
        </button>
      </li>
    `;
  }
};

// Drag and drop functionality
const reorderWithin = (ctx, draggedId, beforeId=null) => {
  const list = listForContext(ctx).slice();
  const fromIdx = list.findIndex(x => x.id === draggedId);
  if (fromIdx < 0) return false;
  const [item] = list.splice(fromIdx, 1);
  let toIdx = beforeId ? list.findIndex(x => x.id === beforeId) : list.length;
  if (toIdx < 0) toIdx = list.length;
  list.splice(toIdx, 0, item);
  setListForContext(ctx, list);
  return true;
};

const moveToFolder = (itemId, targetFolderId) => {
  const item = removeById(itemId);
  if (!item) return false;
  const folder = findById(targetFolderId)?.item;
  if (!folder || folder.type !== 'folder') return false;
  if (!Array.isArray(folder.children)) folder.children = [];
  folder.children.push(item);
  return true;
};

const clearDropHighlights = () => { 
  $$('.tile.drop-into, .tile.drop-before, .tile.drop-after').forEach(el => 
    el.classList.remove('drop-into','drop-before','drop-after')
  ); 
};

// Export the shortcuts module
window.shortcutsModule = {
  // State and data
  state,
  store,
  
  // Functions
  refreshFromExtension,
  findById,
  listForContext,
  setListForContext,
  removeById,
  faviconFor,
  sanitizeImport,
  tileHTML,
  reorderWithin,
  moveToFolder,
  clearDropHighlights,
  uid,
  
  // Icons
  deleteIcon,
  folderIcon
};

})(); // End dependency wait wrapper