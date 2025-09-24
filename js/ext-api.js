/**
 * Extension API for bookmark synchronization
 */

export const EXT = (() => {
  const ORIGIN = location.origin;
  let reqId = 0;
  const pending = new Map();
  let connected = false;
  let toolbarRootId = null;

  function call(method, params = {}, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const id = `rpc_${Date.now()}_${++reqId}`;
      const t = setTimeout(() => {
        pending.delete(id);
        reject(new Error('EXT timeout'));
      }, timeout);
      pending.set(id, { resolve, reject, timer: t });
      try {
        window.postMessage({ __ntb: true, id, method, params }, ORIGIN);
      } catch (e) {
        clearTimeout(t); 
        pending.delete(id); 
        reject(e);
      }
    });
  }

  // Handle extension messages
  function handleMessage(event) {
    if (event.source !== window) return;
    const d = event.data;
    
    if (d && d.__ntb_ready === true) {
      connect(1).then((data) => { 
        if (data && Array.isArray(data.items)) { 
          // Import state management would be needed here
          // For now, we'll handle this in the main app
          window.dispatchEvent(new CustomEvent('ext-ready', { detail: data }));
        } 
      });
      return;
    }
    
    if (d && d.__ntb === true && typeof d.ok === 'boolean') {
      const entry = pending.get(d.id);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(d.id);
        d.ok ? entry.resolve(d.result) : entry.reject(new Error(d.error || 'EXT error'));
      }
    } else if (d && d.__ntb_broadcast === true) {
      notifyChange();
    }
  }

  async function connect(attempts = 5) {
    if (connected) return { id: toolbarRootId, items: [] };
    
    for (let i = 0; i < attempts; i++) {
      try {
        const data = await call('getToolbar', {}, 4000);
        toolbarRootId = data?.id || null;
        connected = !!toolbarRootId;
        if (connected) { return data; }
      } catch (err) {
        // Retry on error
      }
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 600));
    }
    return null;
  }

  const notifyChange = (() => {
    let t = null;
    return () => { 
      clearTimeout(t); 
      t = setTimeout(() => { 
        if (typeof window.__extRefresh === 'function') {
          window.__extRefresh(); 
        }
      }, 120); 
    };
  })();

  // Initialize message listener
  window.addEventListener('message', handleMessage);

  return {
    connect,
    isConnected: () => connected,
    getToolbar: () => call('getToolbar'),
    createLink: (args) => call('createLink', args),
    createFolder: (args) => call('createFolder', args),
    updateNode: (args) => call('updateNode', args),
    moveNode: (args) => call('moveNode', args),
    removeNode: (args) => call('removeNode', args),
    getToolbarRootId: () => toolbarRootId,
    _notifyChange: notifyChange,
  };
})();