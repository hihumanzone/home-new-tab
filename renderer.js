import { ICONS } from './config.js';
import { escapeHtml, escapeAttr, parseUrl, getFirstLetter } from './utils.js';

class Renderer {
  static bookmark(b) {
    const { hostname } = parseUrl(b.url);
    const letter = getFirstLetter(b.title || hostname);
    const title = escapeHtml(b.title || hostname);
    const url = escapeHtml(b.url || '#');
    const siteUrl = escapeAttr(b.url || '');

    return [
      '<a href="', url, '" target="_blank" class="bookmark-item" title="', title, '">',
        '<div class="bookmark-icon">',
          '<img class="bookmark-favicon" alt="" data-url="', siteUrl, '" data-host="', hostname, '" style="display:none">',
          '<div class="bookmark-letter" aria-hidden="true">', letter, '</div>',
        '</div>',
        '<div class="bookmark-title">', title, '</div>',
      '</a>',
    ].join('');
  }

  static folder(f) {
    const title = escapeHtml(f.title || 'Folder');
    return [
      '<div class="bookmark-item" data-folder-id="', f.id, '" title="', title, '" aria-label="Open folder: ', title, '">',
        '<div class="bookmark-icon">', ICONS.FOLDER, '</div>',
        '<div class="bookmark-title">', title, '</div>',
      '</div>',
    ].join('');
  }

  static grid(folder) {
    if (!folder.children?.length) {
      return '<div class="empty-state">This folder is empty</div>';
    }
    return folder.children
      .map((item) => (item.url ? this.bookmark(item) : this.folder(item)))
      .join('');
  }

  static suggestion(item) {
    if (item.url) {
      const title = escapeHtml(item.title || item.url);
      const url = escapeAttr(item.url);
      return [
        '<div class="suggestion-item" data-url="', url, '" role="option">',
          '<div class="suggestion-icon">', ICONS.BOOKMARK, '</div>',
          '<span class="suggestion-text">', title, '</span>',
        '</div>',
      ].join('');
    }
    const text = escapeHtml(item);
    return [
      '<div class="suggestion-item" data-search="', text, '" role="option">',
        '<div class="suggestion-icon">', ICONS.SEARCH, '</div>',
        '<span class="suggestion-text">', text, '</span>',
      '</div>',
    ].join('');
  }

  static suggestions(bookmarks, google) {
    return (
      bookmarks.map((b) => this.suggestion(b)).join('') +
      google.map((s) => this.suggestion(s)).join('')
    );
  }

  static breadcrumb(path) {
    if (!path.length) return '';

    let html = '<span class="breadcrumb-item" data-folder-id="1">Bookmarks Bar</span>';

    path.forEach((item, i) => {
      html += ' <span class="breadcrumb-separator">›</span> ';
      if (i === path.length - 1) {
        html += '<span style="color:var(--text-primary)">' + escapeHtml(item.title) + '</span>';
      } else {
        html += '<span class="breadcrumb-item" data-folder-id="' + item.id + '">' + escapeHtml(item.title) + '</span>';
      }
    });

    return html;
  }

  static notesTabs(notes, activeId, editingId) {
    return notes
      .map((n, index) => {
        const active = n.id === activeId ? ' active' : '';
        const editing = n.id === editingId ? ' editing' : '';
        const isDraggable = n.id !== editingId;
        const title = escapeHtml(n.title);
        const value = escapeAttr(n.title);

        return [
          '<button class="notes-tab', active, editing, '" role="tab" data-note-id="', n.id, '" data-index="', index, '" draggable="', isDraggable, '" title="', title, '" aria-selected="', n.id === activeId, '">',
            '<span class="notes-tab-label">', title, '</span>',
            '<input class="notes-tab-input" data-note-id="', n.id, '" value="', value, '" spellcheck="false">',
          '</button>',
        ].join('');
      })
      .join('');
  }
}

export { Renderer };
