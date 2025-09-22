// Search functionality module
// Handles search suggestions, voice search, and bookmark search

// Wait for utils to be available
(function() {
  if (!window.utils) {
    setTimeout(arguments.callee, 10);
    return;
  }

// Use shared utility functions directly
const $ = window.utils.$;
const $$ = window.utils.$$;
const on = window.utils.on;
const escapeHTML = window.utils.escapeHTML;

// Search functionality module
// Handles search suggestions, voice search, and bookmark search

// Voice icons for different states
var VOICE_ICONS = {
  mic: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
  `,
  stop: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    </svg>
  `
};
  mic: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
  `,
  stop: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    </svg>
  `
};

// URL validation
const isValidUrl = (str) => {
  if (!str || str.length > 1000) return null;
  if (str.includes(' ') || str.includes('\n') || str.includes('\t')) return null;
  try {
    const url = new URL(str.startsWith('http') ? str : 'https://' + str);
    return url.href;
  } catch {
    const url = 'https://' + str;
    try { new URL(url); return url; } catch { return null; }
  }
};

// Search helper functions
const getTopBookmarkSuggestion = () => {
  const top = document.getElementById('suggest').querySelector('li');
  return top?.dataset.type === 'bookmark' && top.dataset.url ? top.dataset.url : null;
};

const submitSearch = () => {
  const topUrl = getTopBookmarkSuggestion();
  const q = document.getElementById('q');
  const v = q.value.trim();
  if (topUrl) { window.location.replace(topUrl); return; }
  const url = isValidUrl(v);
  if (url) window.location.replace(url);
  else window.location.replace(`https://www.google.com/search?q=${encodeURIComponent(v)}`);
};

// Suggestion configuration and state
const SUGGESTIONS_CONFIG = { 
  maxItems: 8, 
  timeout: 3000, 
  fallbackSuggestions: [
    "news","weather","maps","translate","time","calculator","currency converter",
    "nearby restaurants","youtube","gmail"
  ] 
};

let activeIndex = -1, lastQuery = '', suggestionRequestId = 0;

const SUGG_ICONS = {
  bookmark: `
    <svg class="s-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>
  `,
  search: `
    <svg class="s-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="6"></circle>
      <path d="M16 16l5 5"></path>
    </svg>
  `
};

// Bookmark search functionality
const flattenLinks = (items) => {
  const out = [];
  const walk = (arr) => {
    for (const it of arr || []) {
      if (!it) continue;
      if (it.type === 'link' && it.url) out.push({ id: it.id, title: String(it.title||''), url: it.url });
      else if (it.type === 'folder' && Array.isArray(it.children)) walk(it.children);
    }
  };
  walk(items || []);
  return out;
};

// Bookmark search index for better performance
let bookmarkIndex = [];
let lastBookmarkHash = '';

const invalidateBookmarkIndex = () => {
  lastBookmarkHash = '';
  bookmarkIndex = [];
};

const buildBookmarkIndex = () => {
  const items = window.shortcutsModule ? window.shortcutsModule.state.items : [];
  const links = flattenLinks(items);
  const currentHash = JSON.stringify(links.map(l => ({ title: l.title, url: l.url })));
  
  // Only rebuild if bookmarks have changed
  if (currentHash === lastBookmarkHash) return bookmarkIndex;
  
  lastBookmarkHash = currentHash;
  bookmarkIndex = links.map(l => {
    let host = '';
    try { 
      const url = new URL(l.url);
      host = url.hostname.replace(/^www\\./,'').toLowerCase();
    } catch {}
    
    const title = (l.title || '').toLowerCase();
    const label = l.title || host || l.url;
    
    return {
      title,
      url: l.url,
      label,
      host,
      searchTokens: [title, host, label.toLowerCase()].filter(Boolean)
    };
  }).filter(item => item.title || item.host);
  
  return bookmarkIndex;
};

/**
 * Fast bookmark search using pre-built index
 * Searches through titles and hostnames with scoring
 * @param {string} text - Search query
 * @param {number} limit - Maximum results to return
 * @returns {Array} Scored bookmark results
 */
const searchBookmarks = (text, limit = 5) => {
  const q = (text||'').trim().toLowerCase();
  if (!q) return [];
  
  // Ensure index is built and get it
  const index = buildBookmarkIndex();
  
  const scored = [];
  for (const item of index) {
    let score = 0;
    const { title, host, searchTokens } = item;
    
    // Exact matches get highest score
    if (title === q || host === q) {
      score += 10;
    }
    // Prefix matches get high score
    else if (title.startsWith(q) || host.startsWith(q)) {
      score += 8;
    }
    // Substring matches get medium score
    else {
      for (const token of searchTokens) {
        if (token.includes(q)) {
          score += 3;
          break;
        }
      }
    }
    
    if (score > 0) {
      scored.push({ ...item, score });
    }
  }
  
  // Sort by score (descending) then by label length (ascending)
  return scored
    .sort((a, b) => b.score - a.score || a.label.length - b.label.length)
    .slice(0, limit);
};

// Web suggestions functionality
const fetchWebSuggestions = async (query, requestId) => {
  if (!query || query.length > 200) return [];
  
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
    const resp = await Promise.race([
      fetch(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), SUGGESTIONS_CONFIG.timeout))
    ]);
    
    if (!resp.ok) throw new Error('fetch failed');
    const json = await resp.json();
    
    // Check if this is still the current request
    if (requestId !== suggestionRequestId) return [];
    
    return Array.isArray(json[1]) ? json[1].slice(0, SUGGESTIONS_CONFIG.maxItems) : [];
  } catch {
    return [];
  }
};

const updateSuggestions = async (query) => {
  const sugg = document.getElementById('suggest');
  const q = document.getElementById('q');
  
  if (!query?.trim()) {
    sugg.classList.remove('show');
    activeIndex = -1;
    updateAriaExpanded(false);
    return;
  }
  
  // Generate unique request ID to prevent stale responses
  const requestId = ++suggestionRequestId;
  
  try {
    // Get bookmarks - they should already be shown by showInstantBookmarks
    const bookmarks = searchBookmarks(query, 5);
    
    // Fetch web suggestions asynchronously
    const webSuggestions = await fetchWebSuggestions(query, requestId);
    
    // Check if this response is still current
    if (requestId !== suggestionRequestId) return;
    
    // Merge web suggestions with bookmarks, avoiding duplicates
    const bookmarkTexts = new Set(bookmarks.map(b => b.label.toLowerCase()));
    const uniqueWebSuggestions = webSuggestions
      .filter(s => s && s.trim() && !bookmarkTexts.has(s.toLowerCase()))
      .slice(0, Math.max(1, SUGGESTIONS_CONFIG.maxItems - bookmarks.length));
    
    const allSuggestions = [
      ...bookmarks.map(b => ({ type: 'bookmark', text: b.label, url: b.url })),
      ...uniqueWebSuggestions.map(s => ({ type: 'search', text: s }))
    ];
    
    if (allSuggestions.length === 0) {
      // Only update if we have web suggestions to add
      sugg.classList.remove('show');
      updateAriaExpanded(false);
      return;
    }
    
    // On error, just show bookmarks if we haven't already
    const html = allSuggestions
      .map(item => `
        <li data-type="${item.type}" ${item.url ? `data-url="${escapeHTML(item.url)}"` : ''} role="option">
          ${SUGG_ICONS[item.type]}
          <span>${escapeHTML(item.text)}</span>
        </li>
      `)
      .join('');
    
    sugg.innerHTML = html;
    sugg.classList.add('show');
    activeIndex = -1;
    updateAriaExpanded(true);
    
  } catch (err) {
    // On error, just show bookmarks
    const bookmarks = searchBookmarks(query, 5);
    if (bookmarks.length > 0) {
      const html = bookmarks
        .map(b => `
          <li data-type="bookmark" data-url="${escapeHTML(b.url)}" role="option">
            ${SUGG_ICONS.bookmark}
            <span>${escapeHTML(b.label)}</span>
          </li>
        `)
        .join('');
      
      sugg.innerHTML = html;
      sugg.classList.add('show');
      updateAriaExpanded(true);
    } else {
      sugg.classList.remove('show');
      updateAriaExpanded(false);
    }
    activeIndex = -1;
  }
};

const showInstantBookmarks = (query) => {
  const sugg = document.getElementById('suggest');
  const bookmarks = searchBookmarks(query, 5);
  
  if (bookmarks.length > 0) {
    const html = bookmarks
      .map(b => `
        <li data-type="bookmark" data-url="${escapeHTML(b.url)}" role="option">
          ${SUGG_ICONS.bookmark}
          <span>${escapeHTML(b.label)}</span>
        </li>
      `)
      .join('');
    
    sugg.innerHTML = html;
    sugg.classList.add('show');
    updateAriaExpanded(true);
    activeIndex = -1;
  }
};

const updateAriaExpanded = (expanded) => {
  document.getElementById('q').setAttribute('aria-expanded', String(expanded));
};

// Debounced input handler
let inputTimeout = null;
const handleInput = (e) => {
  const value = e.target.value.trim();
  
  // Clear previous timeout
  clearTimeout(inputTimeout);
  
  if (!value) {
    document.getElementById('suggest').classList.remove('show');
    activeIndex = -1;
    updateAriaExpanded(false);
    return;
  }
  
  // Show instant bookmarks immediately
  showInstantBookmarks(value);
  
  // Debounce web suggestions
  inputTimeout = setTimeout(() => {
    if (value === document.getElementById('q').value.trim()) {
      updateSuggestions(value);
    }
  }, 200);
};

// Combined input handler for better performance and clarity
const handleSearchInput = (e) => {
  const sugg = document.getElementById('suggest');
  const items = Array.from(sugg.querySelectorAll('li'));
  const total = items.length;
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = activeIndex < total - 1 ? activeIndex + 1 : 0;
    items.forEach((li, i) => li.classList.toggle('active', i === activeIndex));
    return;
  }
  
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = activeIndex > 0 ? activeIndex - 1 : total - 1;
    items.forEach((li, i) => li.classList.toggle('active', i === activeIndex));
    return;
  }
  
  if (e.key === 'Escape') {
    sugg.classList.remove('show');
    activeIndex = -1;
    updateAriaExpanded(false);
    e.target.blur();
    return;
  }
  
  if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIndex >= 0 && items[activeIndex]) {
      const active = items[activeIndex];
      const type = active.dataset.type;
      if (type === 'bookmark' && active.dataset.url) {
        window.location.replace(active.dataset.url);
        return;
      }
      const text = active.querySelector('span')?.textContent?.trim();
      if (text) {
        e.target.value = text;
        sugg.classList.remove('show');
        updateAriaExpanded(false);
        submitSearch();
      }
    } else {
      submitSearch();
    }
    return;
  }
  
  // For other keys, handle input
  if (!['ArrowDown', 'ArrowUp', 'Escape', 'Enter'].includes(e.key)) {
    // Use setTimeout to get the updated value after the input event
    setTimeout(() => handleInput(e), 0);
  }
};

// Voice search functionality
let rec = null;
let isListening = false;

const handleVoiceSearch = () => {
  const voice = document.getElementById('voice');
  const q = document.getElementById('q');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SR) { 
    alert("Voice search isn't supported in this browser."); 
    return; 
  }

  if (isListening && rec) {
    try { rec.stop(); } catch {}
    return;
  }

  try {
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    isListening = true;
    voice.classList.add('recording');
    voice.innerHTML = VOICE_ICONS.stop;
    voice.title = 'Stop';
    voice.setAttribute('aria-label', 'Stop');

    rec.onresult = (ev) => {
      try {
        const text = Array.from(ev.results).map(r => (r[0]?.transcript || '')).join(' ').trim();
        if (text) {
          q.value = text;
          q.focus();
          const len = q.value.length; 
          q.setSelectionRange(len, len);
        }
      } catch {}
    };

    rec.onerror = () => {};
    rec.onend = () => {
      isListening = false; 
      rec = null;
      voice.classList.remove('recording');
      voice.innerHTML = VOICE_ICONS.mic;
      voice.title = 'Search by voice';
      voice.setAttribute('aria-label', 'Search by voice');
    };

    rec.start();
  } catch {
    isListening = false; 
    rec = null;
    voice.classList.remove('recording');
    voice.innerHTML = VOICE_ICONS.mic;
    voice.title = 'Search by voice';
    voice.setAttribute('aria-label', 'Search by voice');
  }
};

// Export functions for use by other modules
window.searchModule = {
  handleSearchInput,
  handleVoiceSearch,
  invalidateBookmarkIndex,
  submitSearch,
  VOICE_ICONS
};

})(); // End dependency wait wrapper