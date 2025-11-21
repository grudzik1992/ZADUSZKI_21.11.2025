const THEME_KEY = 'songbook-theme';
const THEME_DARK = 'dark';
const THEME_LIGHT = 'light';

function storedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === THEME_DARK || saved === THEME_LIGHT) {
      return saved;
    }
  } catch (error) {
    console.warn('Błąd odczytu motywu:', error);
  }
  return null;
}

function applyTheme(mode, toggle, persist = true) {
  const useDark = mode === THEME_DARK;
  document.body.classList.toggle('theme-dark', useDark);
  console.debug('[theme] applyTheme', { mode, useDark, hasToggle: !!toggle, persist });
  if (toggle) {
    toggle.dataset.mode = useDark ? THEME_DARK : THEME_LIGHT;
    toggle.setAttribute('aria-pressed', useDark ? 'true' : 'false');
    toggle.textContent = useDark ? '☀️ Tryb dzienny' : '🌙 Tryb nocny';
  }

  if (!persist) return;

  try {
    localStorage.setItem(THEME_KEY, useDark ? THEME_DARK : THEME_LIGHT);
  } catch (error) {
    console.warn('Błąd zapisu motywu:', error);
  }
}

export function initTheme(toggle) {
  const savedTheme = storedTheme();
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const initialTheme =
    savedTheme ||
    (document.body.classList.contains('theme-dark') ? THEME_DARK : null) ||
    (prefersDark ? THEME_DARK : THEME_LIGHT);

  console.debug('[theme] initTheme', { savedTheme, prefersDark, initialTheme, toggleExists: !!toggle });
  applyTheme(initialTheme, toggle, false);

  if (toggle) {
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Przełącz tryb motywu');
    toggle.addEventListener('click', () => {
      const next = toggle.dataset.mode === THEME_DARK ? THEME_LIGHT : THEME_DARK;
      console.debug('[theme] toggle clicked, next=', next);
      applyTheme(next, toggle);
    });
  }

  // Fail-safe: if toggle element wasn't provided or is added later (e.g. by fallback UI),
  // attach a delegated click handler so clicks on `#themeToggle` still toggle theme.
  try {
    if (!toggle) {
      if (!document.__themeDelegatedHandlerAdded) {
        const delegated = (event) => {
          const target = event.target;
          const clicked = target && (target.id === 'themeToggle' || target.closest && target.closest('#themeToggle'));
          if (!clicked) return;
          // ensure we use the actual element (if present) to update aria/text
          const el = document.getElementById('themeToggle');
          const current = document.body.classList.contains('theme-dark') ? THEME_DARK : THEME_LIGHT;
          const next = current === THEME_DARK ? THEME_LIGHT : THEME_DARK;
          console.debug('[theme] delegated toggle click, next=', next, 'elExists=', !!el);
          applyTheme(next, el || null);
        };
        document.addEventListener('click', delegated);
        document.__themeDelegatedHandlerAdded = true;
      }
    }
  } catch (err) {
    // swallow any errors from adding delegated handler
  }

  if (!savedTheme && typeof window.matchMedia === 'function') {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event) => {
      if (storedTheme()) return;
      applyTheme(event.matches ? THEME_DARK : THEME_LIGHT, toggle, false);
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', listener);
    } else if (typeof media.addListener === 'function') {
      media.addListener(listener);
    }
  }

  return {
    applyTheme: (mode, persist = true) => applyTheme(mode, toggle, persist),
  };
}
