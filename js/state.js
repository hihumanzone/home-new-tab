/**
 * State management and local storage
 */

import { uid } from './dom-utils.js';
import { EXT } from './ext-api.js';

export const store = {
  key: 'shortcuts.v1',
  
  load() {
    if (EXT.isConnected()) return null;
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.items) ? parsed.items : null;
    } catch { 
      return null; 
    }
  },
  
  save(items) {
    if (EXT.isConnected()) return;
    try { 
      localStorage.setItem(this.key, JSON.stringify({ items })); 
    } catch {}
  },
  
  export(items) {
    const payload = { version: 1, exportedAt: new Date().toISOString(), items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    const name = `shortcuts-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  },
  
  async import(file) {
    const text = await file.text();
    const json = JSON.parse(text);
    return sanitizeImport(json);
  }
};

export function defaultItems() {
  return [
    { id: uid('fld'), type: 'folder', title: 'Work', children: [
      { id: uid('sc'), type: 'link', title: 'Gmail', url: 'https://mail.google.com' },
      { id: uid('sc'), type: 'link', title: 'Drive', url: 'https://drive.google.com' }
    ]},
    { id: uid('sc'), type: 'link', title: 'YouTube', url: 'https://youtube.com' },
    { id: uid('sc'), type: 'link', title: 'Maps', url: 'https://maps.google.com' },
    { id: uid('sc'), type: 'link', title: 'Translate', url: 'https://translate.google.com' }
  ];
}

export const state = {
  items: store.load() || defaultItems(),
  edit: false,
  folderEdit: false,
  folderOpen: null
};

// Helper functions for state manipulation
export function findById(id, list = state.items, parent = null) {
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (item.id === id) return { item, parent, index: i, list };
    if (item.children) {
      const found = findById(id, item.children, item);
      if (found) return found;
    }
  }
  return null;
}

export function removeById(id) {
  const found = findById(id);
  if (!found) return null;
  const { item, list, index } = found;
  list.splice(index, 1);
  store.save(state.items);
  return item;
}

export function listForContext(ctx) {
  return ctx === 'root' ? state.items : (findById(ctx)?.item?.children || []);
}

export function setListForContext(ctx, list) {
  if (ctx === 'root') {
    state.items = list;
  } else {
    const found = findById(ctx);
    if (found?.item) {
      found.item.children = list;
    }
  }
  store.save(state.items);
}

function sanitizeImport(json) {
  const items = json?.items || json || [];
  if (!Array.isArray(items)) return [];
  
  const addLink = (title, url) => {
    const t = String(title || '').trim();
    const u = String(url || '').trim();
    if (!t || !u) return null;
    return { id: uid('sc'), type: 'link', title: t, url: u };
  };
  
  const out = [];
  for (const it of items) {
    if (it?.type === 'folder' && it?.title?.trim()) {
      const folder = { id: uid('fld'), type: 'folder', title: it.title.trim(), children: [] };
      if (Array.isArray(it.children)) {
        for (const sub of it.children) {
          if (sub?.type === 'link') {
            const link = addLink(sub.title, sub.url);
            if (link) folder.children.push(link);
          }
        }
      }
      out.push(folder);
    } else if (it.type === 'link') {
      const link = addLink(it.title, it.url);
      if (link) out.push(link);
    }
  }
  return out;
}