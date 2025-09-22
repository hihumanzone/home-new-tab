// Utility functions shared across modules
// Define utility functions once to avoid conflicts

window.utils = {
  $: (sel, root=document) => root.querySelector(sel),
  $$: (sel, root=document) => Array.from(root.querySelectorAll(sel)),
  on: (el, evts, fn) => evts.split(' ').forEach(e => el.addEventListener(e, fn)),
  escapeHTML: (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))
};