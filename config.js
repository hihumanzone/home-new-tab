export const CONFIG = {
  // Bookmarks
  BOOKMARKS_BAR_ID: '1',

  // Favicons
  FAVICON_SIZES: [32, 64, 48],
  FAVICON_CACHE_KEY: 'newtab_favicon_cache_v1',
  FAVICON_CACHE_EXPIRY_MS: 86400000,
  FAVICON_TIMEOUT_MS: 5000,

  // Notes
  NOTES_STORAGE_KEY: 'newtab_notes_v2',
  NOTES_BACKUP_KEY: 'newtab_notes_backup_v1',
  NOTES_SAVE_DEBOUNCE_MS: 250,
  NOTES_STATUS_DURATION_MS: 1200,
  NOTES_MAX_CHARS: 20000,
  NOTES_TITLE_MAX_CHARS: 48,

  // UI
  NOTIFICATION_DURATION_MS: 2000,
};

export const ICONS = {
  FOLDER:
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/></svg>',
  BOOKMARK:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  CHEVRON_RIGHT:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
};

