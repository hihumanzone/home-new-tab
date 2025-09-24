/**
 * DOM utility functions
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const on = (el, evts, fn) => evts.split(' ').forEach(e => el.addEventListener(e, fn));
export const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

/**
 * Generate a unique ID with optional prefix
 */
export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2,9)}${Date.now().toString(36)}`;

/**
 * Format a date for filename usage (YYYYMMDD-HHMM)
 */
export const formatDateForFilename = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
};

/**
 * Show a temporary notification
 */
export const showNotification = (text, duration = 3000, styles = 'position:fixed;right:8px;bottom:8px;font:12px system-ui;color:#8bbdff;opacity:.6;user-select:none;') => {
  try {
    const el = document.createElement('div');
    el.style.cssText = styles;
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  } catch {}
};

/**
 * Get all DOM elements used throughout the app
 */
export function getDOMElements() {
  return {
    // Search elements
    bar: $('#bar'),
    form: $('#form'),
    q: $('#q'),
    go: $('#go'),
    voice: $('#voice'),
    lensBtn: $('#lensBtn'),
    ai: $('#ai'),
    sugg: $('#suggest'),

    // Shortcuts elements
    sc: $('#shortcuts'),
    scGrid: $('#scGrid'),
    scAdd: $('#scAdd'),
    scAddFolder: $('#scAddFolder'),
    scEdit: $('#scEdit'),
    scEditIcon: $('#scEditIcon'),
    scExport: $('#scExport'),
    scImport: $('#scImport'),
    scImportFile: $('#scImportFile'),

    // Folder view elements
    folderView: $('#folderView'),
    fvGrid: $('#fvGrid'),
    fvTitle: $('#fvTitle'),
    fvBack: $('#fvBack'),
    fvAdd: $('#fvAdd'),
    fvToggleEdit: $('#fvToggleEdit'),
    fvToggleIcon: $('#fvToggleIcon'),

    // Dialog elements
    dialog: $('#scDialog'),
    overlay: $('#scOverlay'),
    scForm: $('#scForm'),
    scDialogTitle: $('#scDialogTitle'),
    inputTitle: $('#scTitle'),
    inputUrl: $('#scUrl'),
    rowUrl: $('#rowUrl'),
    rowLoc: $('#rowLocation'),
    selectLocation: $('#scLocation'),
    scLocationLabel: $('#scLocationLabel'),
    btnCancel: $('#scCancel')
  };
}