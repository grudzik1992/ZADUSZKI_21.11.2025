// Lazy loader and initializer for AlphaTab (renders Guitar Pro files and provides playback)
// Exports: initAlphaTab(container, arrayBuffer, options) -> Promise<alphaTabApi>

// Preferred URLs to try in order. Try a local vendor copy first (recommended
// for development/testing), then CDNs. Put a UMD build at
// `/vendor/alphatab/alphaTab.min.js` to prefer a local file and avoid CDN/CORS
// issues during development.
const ALPHATAB_CDNS = [
  '/vendor/alphatab/alphaTab.min.js',
  'https://cdn.jsdelivr.net/npm/alphatab@1.16.1/dist/alphaTab.min.js',
  'https://unpkg.com/alphatab@1.16.1/dist/alphaTab.min.js',
];

let _scriptLoaded = false;
let _loadingPromise = null;

function _detectAlphaTabGlobal() {
  // AlphaTab may expose a few variants depending on build; check common globals
  return window.alphaTab || window.AlphaTab || window.AlphaTabApi || null;
}

function loadScriptUrl(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(url);
    s.onerror = (e) => reject(new Error(`Failed to load script ${url}`));
    document.head.appendChild(s);
  });
}

async function loadAlphaTabScript() {
  if (_scriptLoaded) return Promise.resolve();
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = (async () => {
    // If already present on window, skip loading
    if (_detectAlphaTabGlobal()) {
      _scriptLoaded = true;
      return;
    }
    let lastErr = null;
    for (const url of ALPHATAB_CDNS) {
      try {
        await loadScriptUrl(url);
        // short delay to let the script register globals synchronously
        await new Promise((r) => setTimeout(r, 10));
        const g = _detectAlphaTabGlobal();
        if (g) {
          _scriptLoaded = true;
          return;
        }
        lastErr = new Error(`Script loaded but AlphaTab global not found for ${url}`);
      } catch (err) {
        lastErr = err;
        // try next CDN
      }
    }
    throw lastErr || new Error('Unable to load AlphaTab script from configured CDNs');
  })();
  return _loadingPromise;
}

export async function initAlphaTab(container, arrayBuffer, options = {}) {
  await loadAlphaTabScript();
  const g = _detectAlphaTabGlobal();
  if (!g) {
    throw new Error('AlphaTab library not available after load');
  }
  // Normalize access to constructor: library might export AlphaTabApi as a property
  const AlphaTabApi = g.AlphaTabApi || window.AlphaTabApi || g;

  // AlphaTab's UMD build may expect a URL for the score file. If the
  // caller passed an ArrayBuffer (our common case when reading a local
  // .gp file), create an object URL so AlphaTab can fetch it as a blob URL
  // instead of attempting to stringify the ArrayBuffer (which yields
  // "[object ArrayBuffer]" and produces a 404). We attach the created
  // object URL to the returned API instance for callers to revoke later.
  let objectUrl = null;
  let fileArg = arrayBuffer;
  try {
    const isArrayBuffer = arrayBuffer instanceof ArrayBuffer;
    const isTypedArray = ArrayBuffer.isView && ArrayBuffer.isView(arrayBuffer);
    if (isArrayBuffer || isTypedArray) {
      const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
      objectUrl = URL.createObjectURL(blob);
      fileArg = objectUrl;
    }
  } catch (e) {
    // non-fatal - if object URL creation fails we fall back to passing
    // the original value and let AlphaTab handle it (it will likely
    // surface an error which the caller can catch).
    console.warn('Could not create object URL for AlphaTab file input', e);
  }

  const cfg = {
    file: fileArg,
    player: {
      enablePlayer: true,
      // soundFont can be a URL to an sf2 file; AlphaTab will fetch it
      soundFont: options.soundFont || options.soundfont || '',
    },
    // show minimal UI inside the provided container
    ui: true,
  };
  // If caller provided a fontPath, inject an @font-face rule named 'alphaTab'
  // pointing to common Bravura font files in that path. AlphaTab expects a
  // font named 'alphaTab' available to render music symbols.
  try {
    const fontPath = options.fontPath || options.fontpath || options.fontDir || '';
    if (fontPath) {
      const markerId = 'alphatab-font-injector';
      if (!document.getElementById(markerId)) {
        const style = document.createElement('style');
        style.id = markerId;
        style.textContent = `@font-face { font-family: 'alphaTab'; src: url('${fontPath}/Bravura.woff2') format('woff2'), url('${fontPath}/Bravura.woff') format('woff'), url('${fontPath}/Bravura.otf') format('truetype'); font-weight: normal; font-style: normal; font-display: swap; }`;
        document.head.appendChild(style);
      }
    }
  } catch (e) {
    // non-fatal; logging for debugging
    console.warn('Could not inject alphaTab font-face:', e);
  }
  try {
    // Some builds expect 'new AlphaTabApi(container, cfg)'
    // Before constructing AlphaTab, try to ensure the injected font is available
    // to reduce "Could not load font 'alphaTab' within 5 seconds" warnings.
    try {
      if ((options.fontPath || options.fontpath) && document && document.fonts && typeof document.fonts.load === 'function') {
        // Wait up to 5s for the font family 'alphaTab' to be usable.
        const waitForFont = async () => {
          try {
            const loaded = await Promise.race([
              document.fonts.load('12px alphaTab'),
              new Promise((res) => setTimeout(() => res(false), 5000)),
            ]);
            // document.fonts.load may resolve to an array; interpret conservatively
            if (!loaded || (Array.isArray(loaded) && loaded.length === 0)) {
              console.warn("alphaTab: font 'alphaTab' not detected within 5s");
            }
          } catch (e) {
            console.warn('alphaTab: font load check failed', e);
          }
        };
        // do not block startup if this fails — run and await
        await waitForFont();
      }
    } catch (e) {
      // ignore font wait errors
    }

    let api;
    try {
      api = new AlphaTabApi(container, cfg);
    } catch (err) {
      // fallback: if global is a namespace with AlphaTabApi property
      if (g && typeof g.AlphaTabApi === 'function') api = new g.AlphaTabApi(container, cfg);
      else throw err;
    }
    // expose created object URL (if any) so callers can revoke it when
    // they destroy the player to avoid leaking blob URLs
    try {
      if (objectUrl) api._objectUrl = objectUrl;
    } catch (e) { /* ignore if read-only or unexpected */ }

    // Some AlphaTab builds do not auto-load the score even when a file URL
    // is provided in the config. If a fileArg (object URL or URL string) was
    // derived from the caller and the API exposes `loadScoreAsync`, attempt
    // to load the score explicitly so `api._score` is populated and playback
    // methods become available.
    try {
      const shouldTryLoad = typeof fileArg === 'string' && fileArg && typeof api.loadScoreAsync === 'function';
      if (shouldTryLoad) {
        try {
          // await loading the score so callers receive a ready API
          await api.loadScoreAsync(fileArg);
          console.debug('AlphaTab: score loaded via loadScoreAsync');
        } catch (loadErr) {
          console.warn('AlphaTab: loadScoreAsync failed', loadErr);
        }
      }
    } catch (e) {
      // non-fatal — continue returning the API even if explicit load failed
      console.warn('AlphaTab: explicit score load check failed', e);
    }

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
