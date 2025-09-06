// Background service worker: handle bookmarks API requests and broadcast changes to content scripts.

const TARGET_URL_MATCH = 'https://home-new-tab.vercel.app/*';

// If somehow executed outside an extension context, abort gracefully
if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
  // Not in extension context; do nothing
  self.addEventListener && self.addEventListener('install', () => {});
  // Exit early
} else {

console.debug('[Home New Tab Ext] Background service worker active');

// RPC handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.__ntb_bg !== true) return; // not ours
  const { id, method, params } = message;

  const wrap = async () => {
    try {
      const result = await api(method, params || {});
      sendResponse({ id, ok: true, result });
    } catch (err) {
      sendResponse({ id, ok: false, error: String(err && err.message || err) });
    }
  };
  wrap();
  return true; // async
});

function mapNodeToItem(node){
  if (!node) return null;
  if (node.url){
    return { id: node.id, type: 'link', title: node.title || node.url, url: node.url };
  }
  return {
    id: node.id,
    type: 'folder',
    title: node.title || 'Folder',
    children: Array.isArray(node.children) ? node.children.map(mapNodeToItem).filter(Boolean) : []
  };
}

async function getToolbarNode(){
  // Try well-known Chrome id '1' first
  try {
    const byId = await chrome.bookmarks.get('1');
    if (Array.isArray(byId) && byId[0]) return byId[0];
  } catch {}
  // Fallback to tree traversal
  try {
    const roots = await chrome.bookmarks.getTree();
    const root = roots && roots[0];
    const bar = root && Array.isArray(root.children) ? root.children.find(Boolean) : null;
    return bar || null;
  } catch {
    return null;
  }
}

async function api(method, params){
  switch(method){
    case 'getToolbar': {
      const bar = await getToolbarNode();
      if (!bar) return { id: null, items: [] };
      return { id: bar.id, items: (bar.children || []).map(mapNodeToItem) };
    }
    case 'createLink': {
      const created = await chrome.bookmarks.create({ parentId: params.parentId, title: params.title, url: params.url, index: params.index });
      return mapNodeToItem(created);
    }
    case 'createFolder': {
      const created = await chrome.bookmarks.create({ parentId: params.parentId, title: params.title, index: params.index });
      return mapNodeToItem(created);
    }
    case 'updateNode': {
      const changes = {};
      if (typeof params.title === 'string') changes.title = params.title;
      if (typeof params.url === 'string') changes.url = params.url;
      const updated = await chrome.bookmarks.update(params.id, changes);
      return mapNodeToItem(updated);
    }
    case 'moveNode': {
      const moved = await chrome.bookmarks.move(params.id, { parentId: params.parentId, index: params.index });
      return mapNodeToItem(moved);
    }
    case 'removeNode': {
      await chrome.bookmarks.removeTree(params.id);
      return true;
    }
    default:
      throw new Error('Unknown method: ' + method);
  }
}

// Broadcast bookmark changes to all tabs with our content script injected on the allowed origin
function broadcast(type, payload){
  // Send to all tabs at our origin
  chrome.tabs.query({ url: TARGET_URL_MATCH }, (tabs) => {
    for (const t of tabs) {
      try {
        chrome.tabs.sendMessage(t.id, { __ntb_broadcast: true, type, payload });
      } catch {}
    }
  });
}

chrome.bookmarks.onCreated.addListener((id, node) => broadcast('created', { id, item: mapNodeToItem(node) }));
chrome.bookmarks.onRemoved.addListener((id, info) => broadcast('removed', { id, info }));
chrome.bookmarks.onChanged.addListener((id, changeInfo) => broadcast('changed', { id, changeInfo }));
chrome.bookmarks.onMoved.addListener((id, moveInfo) => broadcast('moved', { id, moveInfo }));

// Ensure content script is injected even if content_scripts didn't fire (redirects, race, etc.)
async function ensureInjected(tabId){
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  console.debug('[Home New Tab Ext] Injected content.js into tab', tabId);
  } catch {}
}

// On completed navigation to our origin, inject content script
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  try {
    const url = new URL(details.url);
    if (url.origin === 'https://home-new-tab.vercel.app') await ensureInjected(details.tabId);
  } catch {}
}, { url: [{ urlMatches: '^https://home-new-tab\.vercel\.app/.*' }] });

// On service worker start, inject into all existing matching tabs
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({ url: TARGET_URL_MATCH }, (tabs) => tabs.forEach(t => ensureInjected(t.id)));
});
chrome.runtime.onStartup.addListener(() => {
  chrome.tabs.query({ url: TARGET_URL_MATCH }, (tabs) => tabs.forEach(t => ensureInjected(t.id)));
});

} // end extension-context guard
