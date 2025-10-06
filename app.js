'use strict';

/* ============================================
   APPLICATION STATE
   ============================================ */
const APP_VERSION = '1.0.0';
const STORAGE_KEY = 'homepageData';

// Application state
const state = {
    currentFolder: null,
    editingShortcutId: null,
    editingFolderId: null,
    draggedItem: null,
    draggedOverItem: null,
    dropPosition: null,
    data: {
        shortcuts: [],
        folders: [],
        itemOrder: {}
    }
};

// SVG Icons library
const icons = {
    folder: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/>
    </svg>`,
    
    globe: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>`,
    
    edit: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>`,
    
    trash: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        <line x1="10" y1="11" x2="10" y2="17"/>
        <line x1="14" y1="11" x2="14" y2="17"/>
    </svg>`,
    
    chevron: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
    </svg>`
};

/* ============================================
   INITIALIZATION
   ============================================ */
document.addEventListener('DOMContentLoaded', init);

function init() {
    loadData();
    state.currentFolder = null; // Always start at root
    renderContent();
    setupEventListeners();
}

function setupEventListeners() {
    // Prevent default drag behavior
    document.body.addEventListener('dragover', e => e.preventDefault());
    document.body.addEventListener('drop', e => e.preventDefault());
    
    // Modal close on background click
    window.addEventListener('click', handleModalBackgroundClick);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Grid drop zone
    const grid = document.getElementById('shortcutsGrid');
    grid.addEventListener('dragover', handleGridDragOver);
    grid.addEventListener('drop', handleGridDrop);
}

/* ============================================
   DATA MANAGEMENT
   ============================================ */
function loadData() {
    try {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            state.data.shortcuts = parsedData.shortcuts || [];
            state.data.folders = parsedData.folders || [];
            state.data.itemOrder = parsedData.itemOrder || {};
        } else {
            initializeDefaultData();
        }
    } catch (error) {
        console.error('Failed to load data:', error);
        initializeDefaultData();
    }
}

function initializeDefaultData() {
    state.data = {
        shortcuts: [
            { id: 1, name: 'Google', url: 'https://google.com', folderId: null },
            { id: 2, name: 'YouTube', url: 'https://youtube.com', folderId: null },
            { id: 3, name: 'GitHub', url: 'https://github.com', folderId: null },
            { id: 4, name: 'Reddit', url: 'https://reddit.com', folderId: null }
        ],
        folders: [],
        itemOrder: {}
    };
    saveData();
}

function saveData() {
    try {
        const dataToSave = {
            shortcuts: state.data.shortcuts,
            folders: state.data.folders,
            itemOrder: state.data.itemOrder
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
        console.error('Failed to save data:', error);
        alert('Failed to save changes. Storage might be full.');
    }
}

/* ============================================
   RENDERING
   ============================================ */
function renderContent() {
    const grid = document.getElementById('shortcutsGrid');
    const items = getOrderedItems(state.currentFolder);
    
    grid.innerHTML = '';
    
    if (items.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <h3>No items yet</h3>
                <p>Add shortcuts or folders to get started</p>
            </div>
        `;
    } else {
        items.forEach((item, index) => {
            const element = item.type === 'folder' 
                ? createFolderElement(item) 
                : createShortcutElement(item);
            element.dataset.index = index;
            grid.appendChild(element);
        });
    }
    
    updateBreadcrumb();
    updateFolderSelects();
}

function getOrderedItems(folderId) {
    const folders = state.data.folders.filter(f => f.parentId === folderId);
    const shortcuts = state.data.shortcuts.filter(s => s.folderId === folderId);
    
    const allItems = [
        ...folders.map(f => ({ ...f, type: 'folder' })),
        ...shortcuts.map(s => ({ ...s, type: 'shortcut' }))
    ];

    const orderKey = folderId === null ? 'root' : folderId.toString();
    const order = state.data.itemOrder[orderKey] || [];
    
    allItems.sort((a, b) => {
        const aIndex = order.indexOf(`${a.type}-${a.id}`);
        const bIndex = order.indexOf(`${b.type}-${b.id}`);
        
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        
        return aIndex - bIndex;
    });
    
    return allItems;
}

/* ============================================
   ELEMENT CREATION
   ============================================ */
function createFolderElement(folder) {
    const div = document.createElement('div');
    div.className = 'folder-item';
    div.draggable = true;
    div.dataset.folderId = folder.id;
    div.dataset.type = 'folder';
    
    div.innerHTML = `
        <div class="drop-indicator left"></div>
        <div class="drop-indicator right"></div>
        <div class="folder-icon">
            <svg class="icon-xl" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/>
            </svg>
        </div>
        <div class="folder-name">${escapeHtml(folder.name)}</div>
        <div class="item-actions">
            <button class="action-btn edit-btn" onclick="editFolder(${folder.id}, event)" title="Edit">
                ${icons.edit}
            </button>
            <button class="action-btn delete-btn" onclick="deleteFolder(${folder.id}, event)" title="Delete">
                ${icons.trash}
            </button>
        </div>
    `;
    
    div.onclick = e => {
        if (!e.target.closest('.action-btn')) {
            navigateToFolder(folder.id);
        }
    };

    setupDragAndDrop(div);
    return div;
}

function createShortcutElement(shortcut) {
    const div = document.createElement('div');
    div.className = 'shortcut-item';
    div.draggable = true;
    div.dataset.shortcutId = shortcut.id;
    div.dataset.type = 'shortcut';
    
    const faviconUrl = getFaviconUrl(shortcut.url);
    
    div.innerHTML = `
        <div class="drop-indicator left"></div>
        <div class="drop-indicator right"></div>
        <div class="shortcut-icon">
            ${faviconUrl ? 
                `<img src="${faviconUrl}" alt="${escapeHtml(shortcut.name)}">` : 
                icons.globe
            }
        </div>
        <div class="shortcut-name">${escapeHtml(shortcut.name)}</div>
        <div class="item-actions">
            <button class="action-btn edit-btn" onclick="editShortcut(${shortcut.id}, event)" title="Edit">
                ${icons.edit}
            </button>
            <button class="action-btn delete-btn" onclick="deleteShortcut(${shortcut.id}, event)" title="Delete">
                ${icons.trash}
            </button>
        </div>
    `;
    
    // Add error handler for favicon images
    if (faviconUrl) {
        const img = div.querySelector('.shortcut-icon img');
        if (img) {
            img.onerror = function() {
                this.parentElement.innerHTML = icons.globe;
            };
        }
    }
    
    div.onclick = e => {
        if (!e.target.closest('.action-btn')) {
            window.open(shortcut.url, '_blank');
        }
    };

    setupDragAndDrop(div);
    return div;
}

function setupDragAndDrop(element) {
    element.addEventListener('dragstart', handleDragStart);
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('drop', handleDrop);
    element.addEventListener('dragenter', handleDragEnter);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('dragend', handleDragEnd);
}

/* ============================================
   DRAG AND DROP
   ============================================ */
function handleDragStart(e) {
    state.draggedItem = {
        type: e.currentTarget.dataset.type,
        id: parseInt(e.currentTarget.dataset.type === 'folder' 
            ? e.currentTarget.dataset.folderId 
            : e.currentTarget.dataset.shortcutId),
        element: e.currentTarget,
        index: parseInt(e.currentTarget.dataset.index)
    };
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const item = e.currentTarget;
    if (item === state.draggedItem.element) return;
    
    clearDropIndicators();
    
    const rect = item.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    
    if (e.clientX < midpoint) {
        item.querySelector('.drop-indicator.left').classList.add('active');
        state.dropPosition = 'before';
    } else {
        item.querySelector('.drop-indicator.right').classList.add('active');
        state.dropPosition = 'after';
    }
    
    state.draggedOverItem = {
        type: item.dataset.type,
        id: parseInt(item.dataset.type === 'folder' 
            ? item.dataset.folderId 
            : item.dataset.shortcutId),
        element: item,
        index: parseInt(item.dataset.index)
    };
    
    // Check for folder drop
    if (item.classList.contains('folder-item') && state.draggedItem.type === 'shortcut') {
        const centerThreshold = 20;
        const centerLeft = rect.left + rect.width / 2 - centerThreshold;
        const centerRight = rect.left + rect.width / 2 + centerThreshold;
        
        if (e.clientX >= centerLeft && e.clientX <= centerRight) {
            item.classList.add('drag-over');
            state.dropPosition = 'into';
        } else {
            item.classList.remove('drag-over');
        }
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    clearDropIndicators();
    
    if (!state.draggedOverItem || state.draggedItem.element === state.draggedOverItem.element) {
        return;
    }
    
    if (state.dropPosition === 'into' && state.draggedOverItem.type === 'folder') {
        moveItemIntoFolder(state.draggedItem, state.draggedOverItem.id);
    } else {
        reorderItems();
    }
}

function handleDragEnter(e) {
    // Handled in dragover
}

function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
        e.currentTarget.querySelectorAll('.drop-indicator').forEach(indicator => {
            indicator.classList.remove('active');
        });
    }
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    clearDropIndicators();
    state.draggedItem = null;
    state.draggedOverItem = null;
    state.dropPosition = null;
}

function handleGridDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleGridDrop(e) {
    if (e.target === e.currentTarget && state.draggedItem) {
        e.preventDefault();
        moveItemToEnd();
    }
}

function clearDropIndicators() {
    document.querySelectorAll('.drop-indicator').forEach(indicator => {
        indicator.classList.remove('active');
    });
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
}

function moveItemIntoFolder(item, targetFolderId) {
    if (item.type === 'shortcut') {
        const shortcut = state.data.shortcuts.find(s => s.id === item.id);
        if (shortcut) {
            shortcut.folderId = targetFolderId;
            saveData();
            renderContent();
        }
    } else if (item.type === 'folder' && targetFolderId !== item.id) {
        const folder = state.data.folders.find(f => f.id === item.id);
        if (folder && !isDescendant(targetFolderId, item.id)) {
            folder.parentId = targetFolderId;
            saveData();
            renderContent();
        }
    }
}

function reorderItems() {
    const items = getOrderedItems(state.currentFolder);
    
    const draggedIndex = items.findIndex(item => 
        item.type === state.draggedItem.type && item.id === state.draggedItem.id
    );
    if (draggedIndex === -1) return;
    
    const [removed] = items.splice(draggedIndex, 1);
    
    let targetIndex = items.findIndex(item => 
        item.type === state.draggedOverItem.type && item.id === state.draggedOverItem.id
    );
    
    if (targetIndex === -1) {
        items.push(removed);
    } else {
        if (state.dropPosition === 'after') {
            targetIndex++;
        }
        items.splice(targetIndex, 0, removed);
    }
    
    const orderKey = state.currentFolder === null ? 'root' : state.currentFolder.toString();
    state.data.itemOrder[orderKey] = items.map(item => `${item.type}-${item.id}`);
    saveData();
    renderContent();
}

function moveItemToEnd() {
    const orderKey = state.currentFolder === null ? 'root' : state.currentFolder.toString();
    const draggedItemKey = `${state.draggedItem.type}-${state.draggedItem.id}`;
    
    if (state.data.itemOrder[orderKey]) {
        state.data.itemOrder[orderKey] = state.data.itemOrder[orderKey].filter(item => item !== draggedItemKey);
        state.data.itemOrder[orderKey].push(draggedItemKey);
        saveData();
        renderContent();
    }
}

/* ============================================
   NAVIGATION
   ============================================ */
function navigateToFolder(folderId) {
    state.currentFolder = folderId;
    renderContent();
}

function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    const path = [];
    let current = state.currentFolder;
    
    while (current !== null) {
        const folder = state.data.folders.find(f => f.id === current);
        if (folder) {
            path.unshift(folder);
            current = folder.parentId;
        } else {
            break;
        }
    }
    
    let html = '<span class="breadcrumb-item" onclick="navigateToFolder(null)">Home</span>';
    
    path.forEach(folder => {
        html += `<span class="breadcrumb-separator">${icons.chevron}</span>`;
        html += `<span class="breadcrumb-item" onclick="navigateToFolder(${folder.id})">${escapeHtml(folder.name)}</span>`;
    });
    
    breadcrumb.innerHTML = html;
}

function updateFolderSelects() {
    const shortcutSelect = document.getElementById('shortcutFolder');
    const parentSelect = document.getElementById('parentFolder');
    
    const options = ['<option value="">Root</option>'];
    
    function addFolderOptions(folders, parentId, level = 0) {
        const children = folders.filter(f => f.parentId === parentId);
        children.forEach(folder => {
            const indent = '&nbsp;&nbsp;'.repeat(level * 2);
            options.push(`<option value="${folder.id}">${indent}${escapeHtml(folder.name)}</option>`);
            addFolderOptions(folders, folder.id, level + 1);
        });
    }
    
    addFolderOptions(state.data.folders, null);
    
    shortcutSelect.innerHTML = options.join('');
    parentSelect.innerHTML = options.join('');
}

/* ============================================
   SHORTCUTS CRUD
   ============================================ */
function openShortcutModal(shortcut = null) {
    state.editingShortcutId = shortcut ? shortcut.id : null;
    document.getElementById('shortcutModalTitle').textContent = shortcut ? 'Edit Shortcut' : 'Add Shortcut';
    document.getElementById('shortcutName').value = shortcut ? shortcut.name : '';
    document.getElementById('shortcutUrl').value = shortcut ? shortcut.url : '';
    document.getElementById('shortcutFolder').value = shortcut ? (shortcut.folderId || '') : (state.currentFolder || '');
    document.getElementById('shortcutModal').classList.add('active');
    
    setTimeout(() => {
        document.getElementById('shortcutName').focus();
    }, 100);
}

function saveShortcut() {
    const name = document.getElementById('shortcutName').value.trim();
    const url = document.getElementById('shortcutUrl').value.trim();
    const folderId = document.getElementById('shortcutFolder').value || null;
    
    if (!name || !url) {
        alert('Please enter both name and URL');
        return;
    }
    
    const validUrl = validateUrl(url);
    if (!validUrl) {
        alert('Please enter a valid URL');
        return;
    }
    
    if (state.editingShortcutId) {
        const shortcut = state.data.shortcuts.find(s => s.id === state.editingShortcutId);
        shortcut.name = name;
        shortcut.url = validUrl;
        shortcut.folderId = folderId ? parseInt(folderId) : null;
    } else {
        const newShortcut = {
            id: Date.now(),
            name: name,
            url: validUrl,
            folderId: folderId ? parseInt(folderId) : null
        };
        state.data.shortcuts.push(newShortcut);
        
        const orderKey = (folderId || state.currentFolder) === null ? 'root' : (folderId || state.currentFolder).toString();
        if (!state.data.itemOrder[orderKey]) {
            state.data.itemOrder[orderKey] = [];
        }
        state.data.itemOrder[orderKey].push(`shortcut-${newShortcut.id}`);
    }
    
    saveData();
    renderContent();
    closeModal('shortcutModal');
}

function editShortcut(id, event) {
    event.stopPropagation();
    const shortcut = state.data.shortcuts.find(s => s.id === id);
    if (shortcut) {
        openShortcutModal(shortcut);
    }
}

function deleteShortcut(id, event) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this shortcut?')) {
        Object.keys(state.data.itemOrder).forEach(key => {
            state.data.itemOrder[key] = state.data.itemOrder[key].filter(item => item !== `shortcut-${id}`);
        });
        
        state.data.shortcuts = state.data.shortcuts.filter(s => s.id !== id);
        saveData();
        renderContent();
    }
}

/* ============================================
   FOLDERS CRUD
   ============================================ */
function openFolderModal(folder = null) {
    state.editingFolderId = folder ? folder.id : null;
    document.getElementById('folderModalTitle').textContent = folder ? 'Edit Folder' : 'Add Folder';
    document.getElementById('folderName').value = folder ? folder.name : '';
    document.getElementById('parentFolder').value = folder ? (folder.parentId || '') : (state.currentFolder || '');
    document.getElementById('folderModal').classList.add('active');
    
    setTimeout(() => {
        document.getElementById('folderName').focus();
    }, 100);
}

function saveFolder() {
    const name = document.getElementById('folderName').value.trim();
    const parentId = document.getElementById('parentFolder').value || null;
    
    if (!name) {
        alert('Please enter a folder name');
        return;
    }
    
    if (state.editingFolderId) {
        const folder = state.data.folders.find(f => f.id === state.editingFolderId);
        folder.name = name;
        if (!isDescendant(parentId ? parseInt(parentId) : null, state.editingFolderId)) {
            folder.parentId = parentId ? parseInt(parentId) : null;
        } else {
            alert('Cannot move folder into its own descendant');
            return;
        }
    } else {
        const newFolder = {
            id: Date.now(),
            name: name,
            parentId: parentId ? parseInt(parentId) : null
        };
        state.data.folders.push(newFolder);
        
        const orderKey = (parentId || state.currentFolder) === null ? 'root' : (parentId || state.currentFolder).toString();
        if (!state.data.itemOrder[orderKey]) {
            state.data.itemOrder[orderKey] = [];
        }
        state.data.itemOrder[orderKey].push(`folder-${newFolder.id}`);
    }
    
    saveData();
    renderContent();
    closeModal('folderModal');
}

function editFolder(id, event) {
    event.stopPropagation();
    const folder = state.data.folders.find(f => f.id === id);
    if (folder) {
        openFolderModal(folder);
    }
}

function deleteFolder(id, event) {
    event.stopPropagation();
    
    const hasSubfolders = state.data.folders.some(f => f.parentId === id);
    const hasShortcuts = state.data.shortcuts.some(s => s.folderId === id);
    
    let message = 'Are you sure you want to delete this folder';
    if (hasSubfolders || hasShortcuts) {
        message += ' and all its contents';
    }
    message += '?';
    
    if (confirm(message)) {
        deleteFolderRecursive(id);
        saveData();
        renderContent();
    }
}

function deleteFolderRecursive(folderId) {
    Object.keys(state.data.itemOrder).forEach(key => {
        state.data.itemOrder[key] = state.data.itemOrder[key].filter(item => item !== `folder-${folderId}`);
    });
    
    const shortcutsToDelete = state.data.shortcuts.filter(s => s.folderId === folderId);
    shortcutsToDelete.forEach(shortcut => {
        Object.keys(state.data.itemOrder).forEach(key => {
            state.data.itemOrder[key] = state.data.itemOrder[key].filter(item => item !== `shortcut-${shortcut.id}`);
        });
    });
    state.data.shortcuts = state.data.shortcuts.filter(s => s.folderId !== folderId);
    
    const subfolders = state.data.folders.filter(f => f.parentId === folderId);
    subfolders.forEach(subfolder => {
        deleteFolderRecursive(subfolder.id);
    });
    
    state.data.folders = state.data.folders.filter(f => f.id !== folderId);
}

/* ============================================
   IMPORT/EXPORT
   ============================================ */
function exportData() {
    const dataStr = JSON.stringify(state.data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `homepage-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (!importedData.shortcuts || !importedData.folders) {
                throw new Error('Invalid data format');
            }
            
            if (confirm('This will replace all your current shortcuts and folders. Continue?')) {
                state.data.shortcuts = importedData.shortcuts;
                state.data.folders = importedData.folders;
                state.data.itemOrder = importedData.itemOrder || {};
                state.currentFolder = null;
                
                saveData();
                renderContent();
                alert('Data imported successfully!');
            }
        } catch (error) {
            alert('Error importing data. Please check the file format.');
            console.error('Import error:', error);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

/* ============================================
   UTILITIES
   ============================================ */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function validateUrl(url) {
    let validUrl = url;
    try {
        new URL(url);
        return validUrl;
    } catch {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            validUrl = 'https://' + url;
            try {
                new URL(validUrl);
                return validUrl;
            } catch {
                return null;
            }
        }
        return null;
    }
}

function getFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
    } catch {
        return '';
    }
}

function isDescendant(parentId, childId) {
    if (parentId === null) return false;
    if (parentId === childId) return true;
    
    const parent = state.data.folders.find(f => f.id === parentId);
    if (!parent) return false;
    
    return isDescendant(parent.parentId, childId);
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    state.editingShortcutId = null;
    state.editingFolderId = null;
}

/* ============================================
   EVENT HANDLERS
   ============================================ */
function handleModalBackgroundClick(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
        state.editingShortcutId = null;
        state.editingFolderId = null;
    }
}

function handleKeyboardShortcuts(e) {
    // ESC to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
        state.editingShortcutId = null;
        state.editingFolderId = null;
    }
    
    // Ctrl+S in modal to save
    if (e.ctrlKey && e.key === 's') {
        const activeModal = document.querySelector('.modal.active');
        if (activeModal) {
            e.preventDefault();
            if (activeModal.id === 'shortcutModal') {
                saveShortcut();
            } else if (activeModal.id === 'folderModal') {
                saveFolder();
            }
        }
    }
}
