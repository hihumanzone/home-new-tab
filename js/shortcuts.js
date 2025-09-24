/**
 * Shortcuts management and rendering
 */

import { escapeHTML } from './dom-utils.js';
import { state, findById, removeById, listForContext, setListForContext } from './state.js';
import { EXT } from './ext-api.js';

export function getFaviconUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=32`;
  } catch {
    return '';
  }
}

export function renderTile(item, inFolder = false) {
  const isFolder = item.type === 'folder';
  const count = isFolder ? (item.children?.length || 0) : 0;
  const editClass = state.edit || (inFolder && state.folderEdit) ? 'edit' : '';
  
  return `
    <li class="tile ${isFolder ? 'folder' : ''}" 
        data-id="${item.id}" 
        data-type="${item.type}"
        ${!isFolder ? `data-url="${escapeHTML(item.url || '')}"` : ''}>
      
      <div class="favicon">
        ${isFolder ? `
          <div class="folder-ico">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 4h6l2 2h8v12H4V4z" opacity=".8"/>
            </svg>
          </div>
          ${count > 0 ? `<div class="count">${count}</div>` : ''}
        ` : `
          <img src="${getFaviconUrl(item.url)}" alt="" onerror="this.style.display='none'" />
        `}
      </div>
      
      <div class="label">${escapeHTML(item.title)}</div>
      
      <button class="action edit" title="Edit" aria-label="Edit ${item.title}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
      </button>
      
      <button class="action remove" title="Delete" aria-label="Delete ${item.title}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/>
        </svg>
      </button>
    </li>
  `;
}

export function renderShortcuts(containerEl) {
  if (!containerEl) return;
  
  const html = state.items.map(item => renderTile(item)).join('');
  containerEl.innerHTML = html;
  
  // Update edit button state
  const scEdit = document.getElementById('scEdit');
  const scEditIcon = document.getElementById('scEditIcon');
  if (scEdit && scEditIcon) {
    scEdit.setAttribute('aria-pressed', state.edit ? 'true' : 'false');
    scEditIcon.innerHTML = state.edit ? `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    ` : `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    `;
  }
  
  // Update shortcuts container class
  const shortcuts = document.getElementById('shortcuts');
  if (shortcuts) {
    shortcuts.classList.toggle('edit', state.edit);
  }
}

export function renderFolderView(folderId, containerEl, titleEl) {
  const folder = findById(folderId)?.item;
  if (!folder || folder.type !== 'folder') return;
  
  if (titleEl) {
    titleEl.textContent = folder.title;
  }
  
  if (containerEl) {
    const html = (folder.children || []).map(item => renderTile(item, true)).join('');
    containerEl.innerHTML = html;
  }
  
  // Update folder view classes
  const folderView = document.getElementById('folderView');
  if (folderView) {
    folderView.classList.add('show');
    folderView.classList.toggle('edit', state.folderEdit);
  }
  
  const fvToggleEdit = document.getElementById('fvToggleEdit');
  const fvToggleIcon = document.getElementById('fvToggleIcon');
  if (fvToggleEdit && fvToggleIcon) {
    fvToggleEdit.setAttribute('aria-pressed', state.folderEdit ? 'true' : 'false');
    fvToggleIcon.innerHTML = state.folderEdit ? `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    ` : `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    `;
  }
}

export function closeFolder() {
  state.folderOpen = null;
  state.folderEdit = false;
  const folderView = document.getElementById('folderView');
  if (folderView) {
    folderView.classList.remove('show', 'edit');
  }
}

export function openFolder(folderId) {
  state.folderOpen = folderId;
  const fvGrid = document.getElementById('fvGrid');
  const fvTitle = document.getElementById('fvTitle');
  renderFolderView(folderId, fvGrid, fvTitle);
}

export function handleTileClick(e) {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  
  const id = tile.dataset.id;
  const type = tile.dataset.type;
  const url = tile.dataset.url;
  
  // Handle edit/remove button clicks
  if (e.target.closest('.action.edit')) {
    openEditDialog(id);
    return;
  }
  
  if (e.target.closest('.action.remove')) {
    if (confirm('Delete this item?')) {
      handleRemoveItem(id);
    }
    return;
  }
  
  // Handle tile clicks
  if (type === 'folder') {
    openFolder(id);
  } else if (type === 'link' && url) {
    window.location.replace(url);
  }
}

export function handleRemoveItem(id) {
  if (EXT.isConnected()) {
    EXT.removeNode({ id }).then(() => {
      // Refresh from extension
      if (typeof window.__extRefresh === 'function') {
        window.__extRefresh();
      }
    }).catch(() => {
      // Fallback to local removal
      removeById(id);
      render();
    });
  } else {
    removeById(id);
    render();
  }
}

export function openEditDialog(id) {
  const found = findById(id);
  if (!found) return;
  
  const { item } = found;
  
  // This would open the edit dialog
  // Implementation would depend on dialog system
  console.log('Edit item:', item);
}

export function reorderWithin(ctx, draggedId, overId) {
  const list = listForContext(ctx).slice();
  const draggedIdx = list.findIndex(x => x.id === draggedId);
  if (draggedIdx < 0) return;
  
  const [dragged] = list.splice(draggedIdx, 1);
  
  if (overId) {
    const overIdx = list.findIndex(x => x.id === overId);
    const insertIdx = overIdx < 0 ? list.length : overIdx;
    list.splice(insertIdx, 0, dragged);
  } else {
    list.push(dragged);
  }
  
  setListForContext(ctx, list);
}

// Main render function
export function render() {
  const scGrid = document.getElementById('scGrid');
  renderShortcuts(scGrid);
  
  // Re-render folder view if open
  if (state.folderOpen) {
    const fvGrid = document.getElementById('fvGrid');
    const fvTitle = document.getElementById('fvTitle');
    renderFolderView(state.folderOpen, fvGrid, fvTitle);
  }
}