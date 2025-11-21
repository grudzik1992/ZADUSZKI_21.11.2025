// Lazy loader and initializer for AlphaTab (renders Guitar Pro files and provides playback)
// Exports: initAlphaTab(container, arrayBuffer, options) -> Promise<alphaTabApi>

const ALPHATAB_CDN = 'https://cdn.jsdelivr.net/npm/alphatab@1.16.1/dist/alphaTab.min.js';

let _scriptLoaded = false;
let _loadingPromise = null;

function loadAlphaTabScript() {
  if (_scriptLoaded) return Promise.resolve();
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ALPHATAB_CDN;
    s.async = true;
    s.onload = () => {
      _scriptLoaded = true;
      resolve();
    };
    s.onerror = (e) => reject(new Error('Failed to load AlphaTab script'));
    document.head.appendChild(s);
  });
  return _loadingPromise;
}

export async function initAlphaTab(container, arrayBuffer, options = {}) {
  await loadAlphaTabScript();
  if (typeof window.alphaTab === 'undefined' && typeof window.alphaTab === 'undefined') {
    throw new Error('AlphaTab library not available after load');
  }
  // Create AlphaTabApi instance
  const cfg = {
    file: arrayBuffer,
    player: {
      enablePlayer: true,
      // soundFont can be a URL to an sf2 file; AlphaTab will fetch it
      soundFont: options.soundFont || options.soundfont || '',
    },
    // show minimal UI inside the provided container
    ui: true,
  };
  try {
    const api = new window.alphaTab.AlphaTabApi(container, cfg);
    return api;
  } catch (err) {
    console.error('AlphaTab init error', err);
    throw err;
  }
}

export async function ensureSoundFont(url) {
  // simple fetch check; caller may want to cache it via service worker or IndexedDB
  if (!url) return false;
  try {
    const resp = await fetch(url, { method: 'GET' });
    return resp.ok;
  } catch (err) {
    return false;
  }
}
