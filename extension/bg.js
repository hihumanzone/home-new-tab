// Background service worker: handle bookmarks API requests and broadcast changes to content scripts.

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
  const roots = await chrome.bookmarks.getTree();
  const root = roots && roots[0];
  const bar = root && root.children && root.children[0];
  return bar || null;
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
  chrome.tabs.query({ url: 'https://home-new-tab.vercel.app/*' }, (tabs) => {
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
