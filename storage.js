export class Storage {
  static async get(key, fallback = null) {
    // Try chrome.storage.local first
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const result = await chrome.storage.local.get(key);
        if (result[key] !== undefined) return result[key];
      } catch {
        // Fall through to localStorage
      }
    }

    // Fallback to localStorage
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  static async set(key, value) {
    let success = false;

    // Write to chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        await chrome.storage.local.set({ [key]: value });
        success = true;
      } catch {
        // Continue to try localStorage
      }
    }

    // Always write to localStorage as fallback / backup
    try {
      localStorage.setItem(key, JSON.stringify(value));
      success = true;
    } catch {
      // Ignore
    }

    return success;
  }

  static async migrate(key) {
    // If data exists in localStorage but not chrome.storage, migrate it
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

    try {
      const localResult = await chrome.storage.local.get(key);
      if (localResult[key] !== undefined) return; // Already migrated

      const legacy = localStorage.getItem(key);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        await chrome.storage.local.set({ [key]: parsed });
      }
    } catch {
      // Ignore migration errors
    }
  }

  /**
   * Subscribe to external changes for a key.
   * Fires callback(newValue) when another tab writes to the same key.
   * Works with chrome.storage.local (extension) and falls back to the
   * window 'storage' event (localStorage). Returns an unsubscribe function.
   */
  static onChanged(key, callback) {
    const cleanups = [];

    if (typeof chrome !== 'undefined' && chrome.storage?.local?.onChanged) {
      const listener = (changes, area) => {
        if (area !== 'local') return;
        if (!Object.prototype.hasOwnProperty.call(changes, key)) return;
        callback(changes[key]?.newValue ?? null);
      };
      chrome.storage.local.onChanged.addListener(listener);
      cleanups.push(() => chrome.storage.local.onChanged.removeListener(listener));
    }

    const storageListener = (e) => {
      if (e.key !== key) return;
      try {
        callback(e.newValue ? JSON.parse(e.newValue) : null);
      } catch {
        // Ignore parse errors
      }
    };
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', storageListener);
      cleanups.push(() => window.removeEventListener('storage', storageListener));
    }

    return () => cleanups.forEach((fn) => {
      try {
        fn();
      } catch {
        // Ignore
      }
    });
  }
}
