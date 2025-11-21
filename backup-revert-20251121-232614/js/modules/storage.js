const STORAGE_KEY = 'songbook';
const ORDER_KEY = 'toc-order';
const NOTATION_KEY = 'songbook-notation';
const DEFAULTS_VERSION_KEY = 'songbook-defaults-version';

// Increment this whenever you change data/lyrics.json or data/chords.json
// Bump this when changing the default data files so stored user data is
// cleared and new defaults are loaded. Updated to prefer the instrumentalist
// export file if present in the repo.
export const CURRENT_DEFAULTS_VERSION = '2025-11-03-v2';

export function loadSavedSongs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed.songs)) {
      return parsed.songs;
    }
    return null;
  } catch (error) {
    console.warn('Błąd odczytu zapisanych danych:', error);
    return null;
  }
}

export function saveSongs(songs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  } catch (error) {
    console.error('Błąd zapisu danych:', error);
    throw error;
  }
}

export function clearSavedSongs() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ORDER_KEY);
  localStorage.removeItem(NOTATION_KEY);
}

export function getSavedDefaultsVersion() {
  try {
    return localStorage.getItem(DEFAULTS_VERSION_KEY);
  } catch (error) {
    console.warn('Błąd odczytu wersji domyślnych danych:', error);
    return null;
  }
}

export function setSavedDefaultsVersion(version) {
  try {
    localStorage.setItem(DEFAULTS_VERSION_KEY, version);
  } catch (error) {
    console.warn('Błąd zapisu wersji domyślnych danych:', error);
  }
}

export function loadSavedOrder() {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Błąd odczytu kolejności TOC:', error);
    return [];
  }
}

export function saveOrder(orderIds) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(orderIds));
  } catch (error) {
    console.warn('Błąd zapisu kolejności TOC:', error);
  }
}

export function getNotationPreference() {
  try {
    return localStorage.getItem(NOTATION_KEY);
  } catch (error) {
    console.warn('Błąd odczytu notacji akordów:', error);
    return null;
  }
}

export function setNotationPreference(value) {
  try {
    localStorage.setItem(NOTATION_KEY, value);
  } catch (error) {
    console.warn('Błąd zapisu notacji akordów:', error);
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function loadDefaultSongs({ includeChords = true } = {}) {
  try {
    // If a custom exported JSON (instrumentalist) exists in the data/ folder,
    // prefer it. This lets the repository contain an updated exported file
    // which will be used as the app defaults without overwriting other data
    // files.
    try {
      // Prefer a user-provided `dane.json` file in the repository root first,
      // then `data/dane.json` (for users who put it under `data/`). This
      // ensures the file you placed at project root is used as the primary
      // source for chords/lyrics/etc.
      try {
        const rootDane = await fetchJson('dane.json');
        if (rootDane && Array.isArray(rootDane.songs) && rootDane.songs.length) {
          const mapped = rootDane.songs.map((song, idx) => ({
            id: song.id || `song-${idx + 1}`,
            title: song.title || `Utwór ${idx + 1}`,
            lyrics: typeof song.lyrics === 'string' ? song.lyrics : '',
            chords: includeChords ? (typeof song.chords === 'string' ? song.chords : '') : '',
            number: typeof song.number === 'number' ? song.number : idx + 1,
            notes: typeof song.notes === 'string' ? song.notes : '',
            tab: typeof song.tab === 'string' ? song.tab : '',
          }));
          mapped.sort((a, b) => (a.number || 0) - (b.number || 0));
          return mapped;
        }
      } catch (err) {
        // ignore and try data/dane.json
      }

      try {
        const dane = await fetchJson('data/dane.json');
        if (dane && Array.isArray(dane.songs) && dane.songs.length) {
          const mapped = dane.songs.map((song, idx) => ({
            id: song.id || `song-${idx + 1}`,
            title: song.title || `Utwór ${idx + 1}`,
            lyrics: typeof song.lyrics === 'string' ? song.lyrics : '',
            chords: includeChords ? (typeof song.chords === 'string' ? song.chords : '') : '',
            number: typeof song.number === 'number' ? song.number : idx + 1,
            notes: typeof song.notes === 'string' ? song.notes : '',
            tab: typeof song.tab === 'string' ? song.tab : '',
          }));
          mapped.sort((a, b) => (a.number || 0) - (b.number || 0));
          return mapped;
        }
      } catch (err) {
        // ignore and try other custom files
      }
      const custom = await fetchJson('data/spiewnik-instrumentalist-2025-11-03-17-36-01.json');
      if (custom && Array.isArray(custom.songs) && custom.songs.length) {
        // Map the exported format to the shape expected by the app
        const mapped = custom.songs.map((song, idx) => ({
          id: song.id || `song-${idx + 1}`,
          title: song.title || `Utwór ${idx + 1}`,
          lyrics: typeof song.lyrics === 'string' ? song.lyrics : '',
          chords: includeChords ? (typeof song.chords === 'string' ? song.chords : '') : '',
          number: typeof song.number === 'number' ? song.number : idx + 1,
          notes: typeof song.notes === 'string' ? song.notes : '',
        }));

        mapped.sort((a, b) => (a.number || 0) - (b.number || 0));
        return mapped;
      }
    } catch (err) {
      // ignore and fall back to original default files
    }
    const lyricsPromise = fetchJson('data/lyrics.json');
    const chordsPromise = includeChords ? fetchJson('data/chords.json') : Promise.resolve(null);

    const [lyricsData, chordsData] = await Promise.all([lyricsPromise, chordsPromise]);

    const chordsMap = includeChords ? chordsData?.chords || {} : {};
    const songs = (lyricsData?.songs || []).map((song) => ({
      id: song.id,
      title: song.title,
      lyrics: song.lyrics,
      chords: includeChords ? chordsMap[song.id] || '' : '',
      number: song.number,
      notes: typeof song.notes === 'string' ? song.notes : '',
    }));

    songs.sort((a, b) => (a.number || 0) - (b.number || 0));
    return songs;
  } catch (error) {
    console.error('Nie udało się wczytać danych JSON:', error);
    return [];
  }
}
