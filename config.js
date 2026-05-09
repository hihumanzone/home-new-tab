export const CONFIG = {
  // Search
  SEARCH_DEBOUNCE_MS: 150,
  MAX_BOOKMARK_RESULTS: 6,
  MAX_GOOGLE_SUGGESTIONS: 5,
  SEARCH_CACHE_TIMEOUT_MS: 300000,

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
  NOTES_STATUS_DURATION_MS: 800,
  NOTES_MAX_CHARS: 20000,
  NOTES_TITLE_MAX_CHARS: 48,

  // UI
  NOTIFICATION_DURATION_MS: 2000,
};

export const ICONS = {
  BOOKMARK:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h10a1 1 0 0 1 1 1v12l-6-3-6 3V3a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5"/></svg>',
  SEARCH:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M10 10l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  FOLDER:
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z" stroke="currentColor" stroke-width="1.5"/></svg>',
};
