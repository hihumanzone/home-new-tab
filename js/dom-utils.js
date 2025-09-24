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