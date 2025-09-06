// Bridge between the hosted new tab page and the Chrome bookmarks API
// Exposes a window.postMessage-based RPC for the page to request bookmark bar data
// and to perform bookmark mutations. We only allow access when the page origin
// matches the extension-declared match pattern (https://home-new-tab.vercel.app/*).

(function(){
  if (window.__NTB_CONTENT_ACTIVE__) return; // guard for double-inject
  window.__NTB_CONTENT_ACTIVE__ = true;
  const PAGE_ORIGIN = location.origin;

  function reply(event, id, ok, result, error){
    try { event.source.postMessage({ __ntb: true, id, ok, result, error }, event.origin); } catch(e) {}
  }

  // Relay background broadcasts to the page
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.__ntb_broadcast !== true) return;
    try { window.postMessage({ __ntb_broadcast: true, type: msg.type, payload: msg.payload }, PAGE_ORIGIN); } catch(e) {}
  });

  // Listen for RPC requests from the page and forward to background
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__ntb !== true) return;
    const { id, method, params } = data;
    try {
      chrome.runtime.sendMessage({ __ntb_bg: true, id, method, params }, (resp) => {
        if (!resp) { reply(event, id, false, null, 'No response'); return; }
        if (resp.ok) reply(event, id, true, resp.result);
        else reply(event, id, false, null, resp.error);
      });
    } catch (err) {
      reply(event, id, false, null, String(err && err.message || err));
    }
  });

  // Notify the page that the content script is active
  try { window.postMessage({ __ntb_ready: true }, PAGE_ORIGIN); } catch {}
})();
