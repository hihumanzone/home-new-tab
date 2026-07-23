import { CONFIG } from './config.js';

class BookmarkManager {
  constructor() {
    this.bookmarkBar = null;
    this.allBookmarks = [];
    this.nodeMap = new Map();
  }

  async load() {
    this.allBookmarks = [];
    this.nodeMap.clear();
    const tree = await chrome.bookmarks.getTree();
    const root = tree[0];
    this.bookmarkBar = root.children.find((n) => n.id === CONFIG.BOOKMARKS_BAR_ID) || root.children[0];

    if (this.bookmarkBar) {
      this.#indexTree(this.bookmarkBar);
    }
    return this.bookmarkBar;
  }

  #indexTree(node) {
    const walk = (n) => {
      this.nodeMap.set(n.id, n);
      if (n.url) this.allBookmarks.push(n);
      n.children?.forEach(walk);
    };
    walk(node);
  }

  async getFolder(id) {
    try {
      const [folder] = await chrome.bookmarks.getSubTree(id);
      return folder;
    } catch {
      return null;
    }
  }

  buildPath(folder) {
    const path = [];
    let node = folder;

    while (node && node.id !== CONFIG.BOOKMARKS_BAR_ID) {
      path.unshift(node);
      node = this.nodeMap.get(node.parentId);
    }
    return path;
  }

  search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const getScore = (b) => {
      const title = (b.title || '').toLowerCase();
      const url = (b.url || '').toLowerCase();
      const titleMatch = title.includes(q);
      const urlMatch = url.includes(q);

      if (titleMatch) {
        if (title === q) return 100;
        if (title.startsWith(q)) return 80;
        return 60;
      }
      if (urlMatch) {
        if (url === q) return 40;
        return 20;
      }
      return 0;
    };

    return this.allBookmarks
      .map((b) => ({ bookmark: b, score: getScore(b) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.bookmark)
      .slice(0, CONFIG.MAX_BOOKMARK_RESULTS);
  }
}

export { BookmarkManager };