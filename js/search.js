/**
 * Search functionality including suggestions and voice search
 */

export const VOICE_ICONS = {
  mic: `
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="10" rx="3" fill="currentColor"/>
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `,
  stop: `
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2"/>
    </svg>
  `
};

export const SUGG_ICONS = {
  bookmark: `
    <svg class="s-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-7-4-7 4V4z"/>
    </svg>
  `,
  query: `
    <svg class="s-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  `
};

export const SUGGESTIONS_CONFIG = { 
  maxItems: 8, 
  timeout: 3000, 
  fallbackSuggestions: [
    "news", "weather", "maps", "translate", "time", "calculator", 
    "currency converter", "nearby restaurants", "youtube", "gmail"
  ] 
};

export function isValidUrl(text) {
  const t = (text || '').trim();
  if (!t) return null;
  
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(t)) return `https://${t}`;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(t)) return `http://${t}`;
  if (/^\d+\.\d+\.\d+\.\d+(:\d+)?(\/.*)?$/.test(t)) return `http://${t}`;
  
  return null;
}

export function createVoiceSearch(voiceBtn) {
  let rec = null;
  let isListening = false;

  return function handleVoiceClick() {
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
      voiceBtn.classList.add('recording');
      voiceBtn.innerHTML = VOICE_ICONS.stop;
      voiceBtn.title = 'Stop';
      voiceBtn.setAttribute('aria-label', 'Stop');

      rec.onresult = (ev) => {
        try {
          const text = Array.from(ev.results).map(r => (r[0]?.transcript || '')).join(' ').trim();
          if (text) {
            const q = document.getElementById('q');
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
        voiceBtn.classList.remove('recording');
        voiceBtn.innerHTML = VOICE_ICONS.mic;
        voiceBtn.title = 'Search by voice';
        voiceBtn.setAttribute('aria-label', 'Search by voice');
      };

      rec.start();
    } catch {
      isListening = false; 
      rec = null;
      voiceBtn.classList.remove('recording');
      voiceBtn.innerHTML = VOICE_ICONS.mic;
      voiceBtn.title = 'Search by voice';
      voiceBtn.setAttribute('aria-label', 'Search by voice');
    }
  };
}

export function createSuggestionSystem(qInput, suggElement) {
  let activeIndex = -1;
  let lastQuery = '';
  let suggestionRequestId = 0;

  const updateAriaExpanded = (expanded) => {
    qInput.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (!expanded) {
      qInput.removeAttribute('aria-activedescendant');
    }
  };

  const setActive = (idx) => {
    const items = Array.from(suggElement.querySelectorAll('li'));
    if (!items.length) { 
      activeIndex = -1; 
      qInput.removeAttribute('aria-activedescendant'); 
      return; 
    }
    
    items.forEach((li, i) => { 
      const a = i === idx; 
      li.classList.toggle('active', a); 
      li.setAttribute('aria-selected', a ? 'true' : 'false');
      if (a) li.id = li.id || `suggestion-${i}`;
    });
    
    activeIndex = idx; 
    if (idx >= 0) {
      items[idx].scrollIntoView({ block: 'nearest' });
      qInput.setAttribute('aria-activedescendant', items[idx].id);
    } else {
      qInput.removeAttribute('aria-activedescendant');
    }
  };

  const searchBookmarks = (query, limit = SUGGESTIONS_CONFIG.maxItems) => {
    // This would need to be implemented based on the actual bookmark data
    // For now, return empty array
    return [];
  };

  const renderSuggestions = (suggestions) => {
    suggElement.innerHTML = suggestions.map((s, i) => `
      <li data-type="${s.type}" ${s.url ? `data-url="${s.url}"` : ''} 
          role="option" aria-selected="false" id="suggestion-${i}">
        ${SUGG_ICONS[s.type] || ''}
        <span>${s.label}</span>
      </li>
    `).join('');
    
    if (suggestions.length > 0) {
      suggElement.classList.add('show');
      updateAriaExpanded(true);
    }
  };

  const handleKeyboard = (e) => {
    const items = Array.from(suggElement.querySelectorAll('li'));
    const isOpen = suggElement.classList.contains('show') && items.length > 0;
    
    switch (e.key) {
      case 'ArrowDown':
        if (!isOpen) { 
          if (qInput.value.trim()) updateSuggestions(qInput.value); 
        } else { 
          setActive((activeIndex + 1) % items.length); 
        }
        e.preventDefault(); 
        break;
      case 'ArrowUp':
        if (isOpen) { 
          setActive(activeIndex <= 0 ? items.length - 1 : activeIndex - 1); 
          e.preventDefault(); 
        }
        break;
      case 'Enter':
        if (isOpen && activeIndex >= 0 && items[activeIndex]) {
          const li = items[activeIndex];
          const type = li.dataset.type;
          if (type === 'bookmark' && li.dataset.url) {
            suggElement.classList.remove('show'); 
            activeIndex = -1; 
            updateAriaExpanded(false);
            window.location.replace(li.dataset.url);
            return;
          }
          const t = li.querySelector('span')?.textContent?.trim();
          if (t) { 
            qInput.value = t; 
            suggElement.classList.remove('show'); 
            updateAriaExpanded(false); 
            // Would trigger search submit here
          }
          e.preventDefault();
        }
        break;
      case 'Escape':
        if (isOpen) {
          suggElement.classList.remove('show');
          activeIndex = -1;
          updateAriaExpanded(false);
          e.preventDefault();
        }
        break;
    }
  };

  const updateSuggestions = (query) => {
    // Implementation would go here
    // For now, just hide suggestions
    suggElement.classList.remove('show');
    activeIndex = -1;
    updateAriaExpanded(false);
  };

  return {
    handleKeyboard,
    updateSuggestions,
    setActive,
    renderSuggestions,
    searchBookmarks,
    hidesuggestions: () => {
      suggElement.classList.remove('show');
      activeIndex = -1;
      updateAriaExpanded(false);
    }
  };
}