// Main application initialization module
// Coordinates between all other modules and handles app startup

(() => {
  'use strict';

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Ensure all modules are loaded
    if (!window.EXT || !window.searchModule || !window.shortcutsModule || !window.uiModule || !window.utils) {
      console.error('Not all required modules are loaded');
      return;
    }

    // Initialize the UI event handlers
    window.uiModule.setupEventHandlers();

    // Initial render
    window.uiModule.render();

    // Setup extension integration if available
    if (window.EXT) {
      // The extension module will handle its own initialization when it receives messages
      console.log('Extension integration enabled');
    }

    console.log('Home New Tab app initialized successfully');
  }
})();