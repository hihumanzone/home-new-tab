/**
 * Main application entry point
 */

import { getDOMElements, on } from './dom-utils.js';
import { EXT } from './ext-api.js';
import { state, store } from './state.js';
import { VOICE_ICONS, createVoiceSearch, createSuggestionSystem, isValidUrl } from './search.js';
import { render, handleTileClick, closeFolder } from './shortcuts.js';

// Initialize the application
function initializeApp() {
  const elements = getDOMElements();
  
  // Set up voice search
  const handleVoiceClick = createVoiceSearch(elements.voice);
  elements.voice.innerHTML = VOICE_ICONS.mic;
  on(elements.voice, 'click', handleVoiceClick);
  
  // Set up suggestion system
  const suggestionSystem = createSuggestionSystem(elements.q, elements.sugg);
  
  // Set up search functionality
  setupSearch(elements, suggestionSystem);
  
  // Set up shortcuts functionality
  setupShortcuts(elements);
  
  // Set up dialog functionality
  setupDialog(elements);
  
  // Set up keyboard shortcuts
  setupKeyboardShortcuts(elements, suggestionSystem);
  
  // Initial render
  render();
  
  // Set up extension integration
  setupExtensionIntegration();
  
  // Focus search on load
  focusSearch(elements.q);
}

function setupSearch(elements, suggestionSystem) {
  const { form, go, q, lensBtn, ai, sugg } = elements;
  
  // Search form submission
  on(form, 'submit', (e) => {
    const v = q.value.trim();
    if (!v) { 
      e.preventDefault(); 
      q.focus(); 
      return; 
    }
    
    // Check for direct URL
    const url = isValidUrl(v);
    if (url) { 
      e.preventDefault(); 
      window.location.replace(url); 
      return; 
    }
  });
  
  // Search button
  on(go, 'click', () => {
    const v = q.value.trim();
    if (!v) { 
      q.focus(); 
      return; 
    }
    
    const url = isValidUrl(v);
    if (url) { 
      window.location.replace(url); 
      return; 
    }
    
    // Submit form for Google search
    form.submit();
  });
  
  // Google Lens button
  on(lensBtn, 'click', () => {
    window.open('https://lens.google.com/', '_blank', 'noopener');
  });
  
  // AI Mode button
  on(ai, 'click', () => {
    const v = q.value.trim(); 
    const base = 'https://www.google.com/search?udm=50';
    window.location.replace(v ? `${base}&q=${encodeURIComponent(v)}` : base);
  });
  
  // Search input events
  on(q, 'input', (e) => {
    const v = e.target.value.trim();
    if (v) {
      suggestionSystem.updateSuggestions(v);
    } else {
      suggestionSystem.hidesuggestions();
    }
  });
  
  // Suggestion clicks
  on(sugg, 'click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    
    const type = li.dataset.type;
    if (type === 'bookmark' && li.dataset.url) {
      suggestionSystem.hidesuggestions();
      window.location.replace(li.dataset.url);
      return;
    }
    
    const text = li.querySelector('span')?.textContent?.trim();
    if (text) { 
      q.value = text; 
      suggestionSystem.hidesuggestions(); 
      form.submit();
    }
  });
  
  // Hide suggestions on blur
  on(sugg, 'blur', () => {
    setTimeout(() => suggestionSystem.hidesuggestions(), 120);
  });
}

function setupShortcuts(elements) {
  const { scGrid, fvGrid, scAdd, scAddFolder, scEdit, scExport, scImport, scImportFile, fvBack, fvAdd, fvToggleEdit } = elements;
  
  // Shortcuts grid clicks
  on(scGrid, 'click', handleTileClick);
  on(fvGrid, 'click', handleTileClick);
  
  // Shortcut actions
  on(scAdd, 'click', () => openDialog('link'));
  on(scAddFolder, 'click', () => openDialog('folder'));
  on(scEdit, 'click', () => { 
    state.edit = !state.edit; 
    render(); 
  });
  
  // Folder view actions
  on(fvBack, 'click', closeFolder);
  on(fvAdd, 'click', () => openDialog('link', state.folderOpen));
  on(fvToggleEdit, 'click', () => { 
    state.folderEdit = !state.folderEdit; 
    render(); 
  });
  
  // Import/Export
  on(scExport, 'click', () => store.export(state.items));
  on(scImport, 'click', () => {
    if (EXT.isConnected()) { 
      alert('Import is disabled while syncing with bookmarks.'); 
      return; 
    }
    scImportFile.click();
  });
  
  on(scImportFile, 'change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const imported = await store.import(file);
      if (!imported.length) { 
        alert('No shortcuts found in file.'); 
        return; 
      }
      
      if (confirm('Replace current shortcuts with imported data?\nPress OK to Replace, Cancel to Merge.')) {
        state.items = imported;
      } else {
        state.items = state.items.concat(imported);
      }
      render();
    } catch (err) {
      console.warn('Import failed:', err);
      alert('Could not import file. Please ensure it is a valid shortcuts JSON.');
    } finally {
      scImportFile.value = '';
    }
  });
}

function setupDialog(elements) {
  // Dialog implementation would go here
  // For now, just a placeholder
}

function setupKeyboardShortcuts(elements, suggestionSystem) {
  const { q, dialog, folderView } = elements;
  
  // Search keyboard navigation
  on(q, 'keydown', suggestionSystem.handleKeyboard);
  
  // Global keyboard shortcuts
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape') {
      if (dialog.classList.contains('show')) { 
        closeDialog(); 
        return; 
      }
      if (folderView.classList.contains('show')) { 
        closeFolder(); 
        return; 
      }
    }
  });
  
  // Close suggestions when clicking outside
  on(document, 'click', (e) => {
    const isInsideSearch = e.target.closest('.dock');
    if (!isInsideSearch && elements.sugg.classList.contains('show')) {
      suggestionSystem.hidesuggestions();
    }
  });
}

function setupExtensionIntegration() {
  // Handle extension ready event
  window.addEventListener('ext-ready', (e) => {
    const data = e.detail;
    if (data && Array.isArray(data.items)) {
      state.items = data.items;
      const scImport = document.getElementById('scImport');
      if (scImport) {
        scImport.setAttribute('disabled', 'true');
      }
      render();
      
      // Show sync notification
      try { 
        const el = document.createElement('div'); 
        el.style.cssText = 'position:fixed;right:8px;bottom:8px;font:12px system-ui;color:#8bbdff;opacity:.6;user-select:none;'; 
        el.textContent = 'Synced with Bookmarks'; 
        document.body.appendChild(el); 
        setTimeout(() => el.remove(), 3000); 
      } catch {}
    }
  });
  
  // Extension refresh callback
  window.__extRefresh = async function refreshFromExtension() {
    try {
      const data = await EXT.getToolbar();
      if (data && Array.isArray(data.items)) {
        state.items = data.items;
        render();
      }
    } catch {}
  };
  
  // Try to connect to extension
  (async () => {
    const data = await EXT.connect();
    if (data && Array.isArray(data.items)) {
      state.items = data.items;
      const scImport = document.getElementById('scImport');
      if (scImport) {
        scImport.setAttribute('disabled', 'true');
      }
      render();
      
      // Show sync notification
      try { 
        const el = document.createElement('div'); 
        el.style.cssText = 'position:fixed;right:8px;bottom:8px;font:12px system-ui;color:#8bbdff;opacity:.6;user-select:none;'; 
        el.textContent = 'Synced with Bookmarks'; 
        document.body.appendChild(el); 
        setTimeout(() => el.remove(), 3000); 
      } catch {}
    }
  })();
}

function focusSearch(qElement) {
  setTimeout(() => {
    if (qElement && typeof qElement.focus === 'function') {
      qElement.focus();
    }
  }, 100);
}

function openDialog(type, parentId = null) {
  // Dialog implementation would go here
  console.log('Open dialog:', type, parentId);
}

function closeDialog() {
  const dialog = document.getElementById('scDialog');
  const overlay = document.getElementById('scOverlay');
  if (dialog) dialog.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
}

// Handle page visibility and focus
on(window, 'load', () => {
  const q = document.getElementById('q');
  focusSearch(q);
});

on(document, 'visibilitychange', () => {
  if (!document.hidden) {
    const q = document.getElementById('q');
    focusSearch(q);
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}