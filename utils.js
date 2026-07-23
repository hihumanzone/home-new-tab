import { CONFIG } from './config.js';

export const $ = (id) => document.getElementById(id);

export const escapeHtml = (text) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const escapeAttr = (text) => escapeHtml(text);

export function parseUrl(url) {
  try {
    const u = new URL(url);
    return { hostname: u.hostname, origin: u.origin };
  } catch {
    return { hostname: '', origin: '' };
  }
}

export const getFirstLetter = (text) => (text || '?')[0].toUpperCase();
export const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const clamp = (str, max) => (str.length <= max ? str : str.slice(0, max));

export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    return new Promise((resolve) => {
      timer = setTimeout(() => resolve(fn(...args)), delay);
    });
  };
}

export function loadImage(url, timeout = CONFIG.FAVICON_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      resolve(null);
    }, timeout);

    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 0 ? { img, url } : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}
