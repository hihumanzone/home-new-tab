import { CONFIG } from './config.js';
import { debounce } from './utils.js';

class SearchManager {
  constructor(bookmarkManager) {
    this.bookmarks = bookmarkManager;
    this.cache = new Map();
    this.requestId = 0;
    this.fetchSuggestions = debounce(this.#doFetch.bind(this), CONFIG.SEARCH_DEBOUNCE_MS);
  }

  async #doFetch(query) {
    try {
      const res = await fetch(
        `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data[1] || []).slice(0, CONFIG.MAX_GOOGLE_SUGGESTIONS);
    } catch {
      return [];
    }
  }

  async search(query, callback) {
    const id = ++this.requestId;
    const cacheKey = query.toLowerCase();
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.ts < CONFIG.SEARCH_CACHE_TIMEOUT_MS) {
      callback(cached.bookmarks, cached.google);
      return;
    }

    const bookmarks = this.bookmarks.search(query);
    callback(bookmarks, []);

    const google = await this.fetchSuggestions(query);
    if (id === this.requestId) {
      this.cache.set(cacheKey, { bookmarks, google, ts: Date.now() });
      callback(bookmarks, google);
    }
  }
}

export { SearchManager };