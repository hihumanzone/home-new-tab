import { CONFIG } from './config.js';
import { Storage } from './storage.js';
import { loadImage, parseUrl, debounce } from './utils.js';

class FaviconManager {
  #debouncedSaveCache;

  constructor() {
    this.cache = this.#loadCache();
    this.pending = new Map();
    this.#debouncedSaveCache = debounce(() => Storage.set(CONFIG.FAVICON_CACHE_KEY, this.cache), 500);
  }

  #loadCache() {
    const data = Storage.get(CONFIG.FAVICON_CACHE_KEY, {});
    const now = Date.now();
    const valid = {};

    for (const [key, entry] of Object.entries(data)) {
      if (entry && now - entry.ts < CONFIG.FAVICON_CACHE_EXPIRY_MS) {
        valid[key] = entry;
      }
    }

    return valid;
  }

  #saveCache() {
    this.#debouncedSaveCache();
  }

  #getSources(hostname, origin) {
    const sources = [];

    if (origin) {
      sources.push({ url: `${origin}/favicon.ico`, type: 'direct' });
    }

    sources.push({ url: `https://icons.duckduckgo.com/ip3/${hostname}.ico`, type: 'duckduckgo' });

    for (const size of CONFIG.FAVICON_SIZES) {
      sources.push({
        url: `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`,
        type: 'google',
        size,
      });
    }

    return sources;
  }

  async #resolve(hostname, origin) {
    const cached = this.cache[hostname];
    if (cached) return cached.url;

    let pending = this.pending.get(hostname);
    if (pending) return pending;

    pending = this.#fetchBestFavicon(hostname, origin);
    this.pending.set(hostname, pending);

    try {
      return await pending;
    } finally {
      this.pending.delete(hostname);
    }
  }

  async #fetchBestFavicon(hostname, origin) {
    const promises = this.#getSources(hostname, origin).map(({ url, type }) =>
      loadImage(url).then((result) => {
        if (!result) return null;

        const { img } = result;
        if (type === 'google' && img.naturalWidth === 16 && img.naturalHeight === 16) {
          return null;
        }
        if (type === 'duckduckgo' && img.naturalWidth === 48 && img.naturalHeight === 48) {
          return null;
        }

        return url;
      })
    );

    try {
      const results = await Promise.all(promises);
      const bestUrl = results.find(Boolean) || null;
      this.#setCache(hostname, bestUrl);
      return bestUrl;
    } catch {
      this.#setCache(hostname, null);
      return null;
    }
  }

  #setCache(hostname, url) {
    this.cache[hostname] = { url, ts: Date.now() };
    this.#saveCache();
  }

  loadFaviconsForContainer(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.querySelectorAll('.bookmark-favicon').forEach((img) => {
      const url = img.dataset.url;
      const hostname = img.dataset.host;
      this.#showLetter(img);
      if (url && hostname) {
        this.#applyToElement(img, url, hostname);
      }
    });
  }

  #showLetter(img) {
    const letterEl = img.nextElementSibling;
    img.style.display = 'none';
    if (letterEl) letterEl.style.display = 'block';
  }

  async #applyToElement(img, url, hostname) {
    const letterEl = img.nextElementSibling;
    const { origin } = parseUrl(url);

    try {
      const faviconUrl = await this.#resolve(hostname, origin);
      if (faviconUrl) {
        img.src = faviconUrl;
        img.style.display = 'block';
        if (letterEl) letterEl.style.display = 'none';
      }
    } catch {
      // ignore
    }
  }
}

export const faviconManager = new FaviconManager();