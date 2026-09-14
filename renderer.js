import { ICONS } from './config.js';
import { escapeHtml, escapeAttr, parseUrl, getFirstLetter } from './utils.js';

class Renderer {
  static bookmark(b) {
    const { hostname } = parseUrl(b.url);
    const rawTitle = b.title?.trim() || hostname;
    const letter = getFirstLetter(rawTitle);
    const title = escapeHtml(rawTitle);
    const url = escapeHtml(b.url || '#');
    const siteUrl = escapeAttr(b.url || '');

    return [
      '<a href="', url, '" target="_blank" rel="noopener noreferrer" class="bookmark-item" title="', title, '">',
        '<div class="bookmark-icon">',
          '<img class="bookmark-favicon" alt="" data-url="', siteUrl, '" data-host="', hostname, '" style="display:none" loading="lazy">',
          '<div class="bookmark-letter" aria-hidden="true">', letter, '</div>',
        '</div>',
        '<div class="bookmark-title">', title, '</div>',
      '</a>',
    ].join('');
  }

  static folder(f) {
    const rawTitle = f.title?.trim() || 'Folder';
    const title = escapeHtml(rawTitle);
    const count = f.children ? f.children.length : 0;
    const countText = count > 0 ? `<span class="folder-count">${count}</span>` : '';
    return [
      '<div class="bookmark-item bookmark-folder" data-folder-id="', f.id, '" role="button" tabindex="0" title="', title, ' (', count, ' items)" aria-label="Open folder: ', title, '">',
        '<div class="bookmark-icon folder-icon">', ICONS.FOLDER, '</div>',
        '<div class="bookmark-title">', title, '</div>',
        countText,
      '</div>',
    ].join('');
  }

  static grid(folder) {
    if (!folder.children?.length) {
      return '<div class="empty-state"><p>This folder is empty</p></div>';
    }
    return folder.children
      .map((item) => (item.url ? this.bookmark(item) : this.folder(item)))
      .join('');
  }

  static breadcrumb(path) {
    if (!path || !path.length) {
      return '<span class="breadcrumb-current">Bookmarks</span>';
    }

    let html = '<span class="breadcrumb-item" data-folder-id="1" role="button" tabindex="0">Bookmarks</span>';

    path.forEach((item, i) => {
      const itemTitle = escapeHtml(item.title?.trim() || 'Folder');
      html += ` <span class="breadcrumb-separator" aria-hidden="true">${ICONS.CHEVRON_RIGHT}</span> `;
      if (i === path.length - 1) {
        html += '<span class="breadcrumb-current">' + itemTitle + '</span>';
      } else {
        html += '<span class="breadcrumb-item" data-folder-id="' + item.id + '" role="button" tabindex="0">' + itemTitle + '</span>';
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
          '<button class="notes-tab', active, editing, '" role="tab" data-note-id="', n.id, '" data-index="', index, '" draggable="', isDraggable, '" title="', title, ' (Click to rename)" aria-selected="', n.id === activeId, '">',
            '<span class="notes-tab-label">', title, '</span>',
            '<input class="notes-tab-input" data-note-id="', n.id, '" value="', value, '" spellcheck="false" maxlength="48">',
          '</button>',
        ].join('');
      })
      .join('');
  }
}

export { Renderer };

