import { CONFIG } from './config.js';

class BookmarkManager {
  constructor() {
    this.bookmarkBar = null;
    this.allBookmarks = [];
    this.nodeMap = new Map();
  }

  async load() {
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
    const q = query.toLowerCase();
    return this.allBookmarks
      .filter((b) => b.title?.toLowerCase().includes(q) || b.url?.toLowerCase().includes(q))
      .slice(0, CONFIG.MAX_BOOKMARK_RESULTS);
  }
}

export { BookmarkManager };