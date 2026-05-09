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
}
