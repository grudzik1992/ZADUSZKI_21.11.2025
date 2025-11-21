import { $, $$, normalizeMultiline, trimTrailingEmptyLines } from './dom.js';
import { convertChordNotation, initTransposeControls, normalizeChordFieldDom, resetTransposeForSong } from './transpose.js';

// Utility: parse '123px' -> 123 (number) and clamp helper
function parsePx(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace('px', ''));
  return Number.isFinite(n) ? n : 0;
}

function clampPx(v, min) {
  const n = parsePx(v);
  const m = Number.isFinite(min) ? min : 0;
  return `${Math.max(n || 0, m)}px`;
}

const PLACEHOLDERS = {
  chords: 'Dodaj akordy (opcjonalnie)',
  lyrics: 'Dodaj tekst piosenki...',
  notes: 'Dodaj notatki (widoczne tylko dla wokalisty)...',
  tab: 'Dodaj tabulaturę (opcjonalnie)'
};

const FIELD_LABELS = {
  chords: 'Akordy',
  lyrics: 'Tekst',
  notes: 'Notatki',
  tab: 'Tabulatura',
};

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/(^-|-$)/g, '')
    || `song-${Date.now()}`;
}

function ensureUniqueId(baseId, songsHost) {
  const existing = new Set($$('h2[id]', songsHost).map((h2) => h2.id));
  if (!existing.has(baseId)) return baseId;
  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }
  return candidate;
}

function createEditableField(type, value, { normalize } = { normalize: true }) {
  const wrapper = document.createElement('div');
  wrapper.className = `song-field ${type}-field`;

  const label = document.createElement('div');
  label.className = 'field-label';
  label.textContent = FIELD_LABELS[type] || 'Pole';

  const editable = document.createElement('div');
  // Normalize class name for tab -> 'tablature' so styles/serialization match
  editable.className = type === 'tab' ? 'tablature' : type;
  editable.contentEditable = 'true';
  editable.dataset.placeholder = PLACEHOLDERS[type] || '';
  editable.dataset.field = type;
  editable.setAttribute('role', 'textbox');
  editable.setAttribute('spellcheck', type === 'chords' || type === 'tab' ? 'false' : 'true');

  if (type === 'chords') {
    // IMPORTANT: do not modify user's input during editing. Create the
    // chords field with the raw text and avoid automatic normalization or
    // HTML mutation here. Normalization/transposition may still occur when
    // the user explicitly uses transpose controls.
    const text = value || '';
    editable.textContent = text;
  } else {
    editable.textContent = value || '';
  }

  wrapper.append(label, editable);
  return wrapper;
}

function createSongContent(songData, options) {
  const {
    chords = '',
    lyrics = '',
    notes = '',
    normalizeChords = true,
    showChords = true,
  } = options;

  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 'song-fields';

  if (showChords) {
    const normalizedChords = trimTrailingEmptyLines(normalizeMultiline(chords).split('\n'));
    fieldsWrap.appendChild(createEditableField('chords', normalizedChords, { normalize: normalizeChords }));
  }

  // If a tablature block exists for this song, render it and make it span full width
  if (songData && typeof songData.tab === 'string' && songData.tab.trim()) {
    const tabText = songData.tab || '';
    const tabField = createEditableField('tab', tabText, { normalize: false });
    tabField.classList.add('tablature-field');
    fieldsWrap.appendChild(tabField);
  }

  const normalizedLyrics = trimTrailingEmptyLines(normalizeMultiline(lyrics).split('\n'));
  fieldsWrap.appendChild(createEditableField('lyrics', normalizedLyrics));

  if (!showChords) {
    const normalizedNotes = trimTrailingEmptyLines(normalizeMultiline(notes).split('\n'));
    fieldsWrap.appendChild(createEditableField('notes', normalizedNotes));
  }

  return fieldsWrap;
}

function createTransposeControls() {
  const controls = document.createElement('div');
  controls.className = 'transpose-controls';

  const down = document.createElement('button');
  down.type = 'button';
  down.className = 'transpose-down';
  down.setAttribute('aria-label', 'Transponuj w dół');
  down.textContent = '▼';

  const level = document.createElement('span');
  level.className = 'transpose-level';
  level.title = 'Aktualna transpozycja';
  level.dataset.level = '0';
  level.textContent = '0';

  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'transpose-up';
  up.setAttribute('aria-label', 'Transponuj w górę');
  up.textContent = '▲';

  controls.append(down, level, up);
  // BPM input
  const bpmInput = document.createElement('input');
  bpmInput.type = 'number';
  bpmInput.min = '20';
  bpmInput.max = '300';
  bpmInput.step = '1';
  bpmInput.className = 'bpm-input';
  bpmInput.title = 'Tempo (BPM)';
  bpmInput.placeholder = 'BPM';
  controls.appendChild(bpmInput);

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'song-play-btn';
  playBtn.setAttribute('aria-pressed', 'false');
  playBtn.title = 'Play / Pause auto-scroll';
  playBtn.textContent = '▶';
  controls.appendChild(playBtn);
  // Wire up play/pause for auto-scroll and audio. Toggle aria and dispatch events.
  playBtn.addEventListener('click', () => {
    const isPlaying = playBtn.getAttribute('aria-pressed') === 'true';
    const bpm = Number(bpmInput?.value) || 0;
    const heading = playBtn.closest('.song')?.querySelector('h2');
    const id = heading?.id || playBtn.closest('.song')?.dataset.id || '';
    const detail = { id, bpm };
    if (!isPlaying) {
      playBtn.setAttribute('aria-pressed', 'true');
      playBtn.textContent = '⏸';
      // bubble event to app which will start autoscroll/audio
      playBtn.closest('.song')?.dispatchEvent(new CustomEvent('song:play', { detail, bubbles: true }));
    } else {
      playBtn.setAttribute('aria-pressed', 'false');
      playBtn.textContent = '▶';
      playBtn.closest('.song')?.dispatchEvent(new CustomEvent('song:stop', { detail, bubbles: true }));
    }
  });
  // Per-field font size controls: chords (guitar) and lyrics (microphone)
  const chordsDec = document.createElement('button');
  chordsDec.type = 'button';
  chordsDec.className = 'tab-toggle-btn song-font-chords-decrease';
  chordsDec.title = 'Zmniejsz czcionkę akordów';
  chordsDec.innerHTML = '<span class="icon">🎸</span><span class="label">A-</span>';
  controls.appendChild(chordsDec);

  const chordsInc = document.createElement('button');
  chordsInc.type = 'button';
  chordsInc.className = 'tab-toggle-btn song-font-chords-increase';
  chordsInc.title = 'Zwiększ czcionkę akordów';
  chordsInc.innerHTML = '<span class="icon">🎸</span><span class="label">A+</span>';
  controls.appendChild(chordsInc);

  const lyricsDec = document.createElement('button');
  lyricsDec.type = 'button';
  lyricsDec.className = 'tab-toggle-btn song-font-lyrics-decrease';
  lyricsDec.title = 'Zmniejsz czcionkę tekstu';
  lyricsDec.innerHTML = '<span class="icon">🎤</span><span class="label">A-</span>';
  controls.appendChild(lyricsDec);

  const lyricsInc = document.createElement('button');
  lyricsInc.type = 'button';
  lyricsInc.className = 'tab-toggle-btn song-font-lyrics-increase';
  lyricsInc.title = 'Zwiększ czcionkę tekstu';
  lyricsInc.innerHTML = '<span class="icon">🎤</span><span class="label">A+</span>';
  controls.appendChild(lyricsInc);

  // Reset fonts for this song
  const fontReset = document.createElement('button');
  fontReset.type = 'button';
  fontReset.className = 'tab-toggle-btn song-font-reset';
  fontReset.title = 'Resetuj czcionki tego utworu';
  fontReset.textContent = 'Reset';
  // NOTE: appended later so it appears as the final control
  // Note: Import .txt removed — use the "Dodaj tabulaturę" toggle instead.
  // Add per-song tablature import/save controls (right-aligned, hidden until tablature exists)
  const tabControls = document.createElement('div');
  tabControls.className = 'tab-controls';
  tabControls.style.display = 'none';

  const tabImportInput = document.createElement('input');
  tabImportInput.type = 'file';
  tabImportInput.accept = '.txt';
  tabImportInput.style.display = 'none';

  const tabImportBtn = document.createElement('button');
  tabImportBtn.type = 'button';
  tabImportBtn.className = 'tab-toggle-btn tab-import-global';
  tabImportBtn.textContent = 'Import tab';
  tabImportBtn.title = 'Importuj tabulaturę do tego utworu (.txt)';

  const tabSaveBtn = document.createElement('button');
  tabSaveBtn.type = 'button';
  tabSaveBtn.className = 'tab-toggle-btn tab-save-global';
  tabSaveBtn.textContent = 'Zapisz tab';
  tabSaveBtn.title = 'Zapisz tabulaturę tego utworu';

  tabControls.appendChild(tabImportBtn);
  tabControls.appendChild(tabSaveBtn);
  tabControls.appendChild(tabImportInput);
  // ensure tabControls is part of the controls DOM so it can be repositioned
  controls.appendChild(tabControls);
  // Wire import/save to operate on this song's tablature (closest .song)
  tabImportBtn.addEventListener('click', () => tabImportInput.click());
  tabImportInput.addEventListener('change', () => {
    const file = tabImportInput.files?.[0];
    const controlsNode = tabImportInput.closest('.transpose-controls');
    const songContainer = controlsNode?.closest('.song');
    if (!songContainer || !file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result.replace(/\r\n?/g, '\n') : '';
      const fieldsWrap = songContainer.querySelector('.song-fields');
      if (!fieldsWrap) return;
      let tabWrap = fieldsWrap.querySelector('.song-field.tablature-field');
      if (!tabWrap) {
        tabWrap = createEditableField('tab', text, { normalize: false });
        tabWrap.classList.add('tablature-field');
        fieldsWrap.prepend(tabWrap);
      }
      const inner = tabWrap.querySelector('.tablature') || tabWrap.querySelector('[data-field="tab"]');
      if (inner) {
        inner.textContent = text;
        inner.contentEditable = 'true';
      }
      songContainer.dataset.tab = (text || '').trim();
      tabImportInput.value = '';
    };
    reader.readAsText(file, 'utf-8');
  });

  tabSaveBtn.addEventListener('click', () => {
    const controlsNode = tabSaveBtn.closest('.transpose-controls');
    const songContainer = controlsNode?.closest('.song');
    if (!songContainer) return;
    const fieldsWrap = songContainer.querySelector('.song-fields');
    const tabWrap = fieldsWrap?.querySelector('.song-field.tablature-field');
    const inner = tabWrap ? (tabWrap.querySelector('.tablature') || tabWrap.querySelector('[data-field="tab"]')) : null;
    const val = inner ? (inner.textContent || '').trim() : '';
    songContainer.dataset.tab = val;
    const prev = tabSaveBtn.textContent;
    tabSaveBtn.textContent = 'Zapisano';
    setTimeout(() => { tabSaveBtn.textContent = prev; }, 1200);
  });

  // Add per-song size edit toggle. When active, user can resize
  // chords and lyrics containers vertically. Persist heights to dataset.
  const sizeToggle = document.createElement('button');
  sizeToggle.type = 'button';
  sizeToggle.className = 'tab-toggle-btn song-size-toggle';
  sizeToggle.title = 'Włącz edycję rozmiaru kontenerów (przeciągnij by zmienić)';
  // keep label only (no pencil icon) so the button remains compact and predictable
  sizeToggle.textContent = 'Rozmiar';
  controls.appendChild(sizeToggle);

  // Save / Cancel buttons (hidden until edit mode)
  const saveSizeBtn = document.createElement('button');
  saveSizeBtn.type = 'button';
  saveSizeBtn.className = 'tab-toggle-btn song-size-save';
  saveSizeBtn.textContent = 'Zapisz';
  saveSizeBtn.title = 'Zapisz wprowadzone rozmiary';
  saveSizeBtn.style.display = 'none';
  controls.appendChild(saveSizeBtn);

  const cancelSizeBtn = document.createElement('button');
  cancelSizeBtn.type = 'button';
  cancelSizeBtn.className = 'tab-toggle-btn song-size-cancel';
  cancelSizeBtn.textContent = 'Anuluj';
  cancelSizeBtn.title = 'Anuluj zmiany rozmiaru';
  cancelSizeBtn.style.display = 'none';
  controls.appendChild(cancelSizeBtn);

  sizeToggle.addEventListener('click', () => {
    const controlsNode = sizeToggle.closest('.transpose-controls');
    const songDiv = controlsNode?.closest('.song');
    if (!songDiv) return;
    const chordsEl = songDiv.querySelector('.chords');
    const lyricsEl = songDiv.querySelector('.lyrics');
    const songFields = songDiv.querySelector('.song-fields');

    const isEditing = songDiv.classList.contains('size-edit-mode');
    if (!isEditing) {
      // enter edit mode
      songDiv.classList.add('size-edit-mode');
      sizeToggle.setAttribute('aria-pressed', 'true');
      sizeToggle.title = 'Edytujesz rozmiar (użyj Zapisz lub Anuluj)';

      // store previous inline styles so Cancel can restore
      songDiv.dataset._prevChordsHeight = chordsEl?.style.height || songDiv.dataset.chordsHeight || '';
      songDiv.dataset._prevLyricsHeight = lyricsEl?.style.height || songDiv.dataset.lyricsHeight || '';
      songDiv.dataset._prevGrid = songFields?.style?.gridTemplateColumns || '';

      saveSizeBtn.style.display = '';
      cancelSizeBtn.style.display = '';
    } else {
      // If already editing, toggle acts as noop; instruct user to Save/Cancel
      [chordsEl, lyricsEl].forEach((el) => { if (!el) return; el.style.boxShadow = '0 0 0 4px rgba(78,140,255,0.06)'; setTimeout(() => { el.style.boxShadow = ''; }, 250); });
    }
  });

  // Helper: show modal and return a promise resolved with selected action
  function showOverflowModal({ songDiv, field }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      const content = document.createElement('div');
      content.className = 'modal-content';
      const body = document.createElement('div');
      body.className = 'modal-body';
      const h3 = document.createElement('h3');
      h3.textContent = 'Zawartość nie mieści się w podanym rozmiarze';
      body.appendChild(h3);
      const p = document.createElement('p');
      if (field === 'lyrics') {
        p.textContent = 'Wybierz, czy zawinąć tekst, zwiększyć wysokość, czy anulować.';
      } else {
        p.textContent = 'Zawartość akordów nie mieści się w polu. Możesz zwiększyć wysokość lub anulować.';
      }
      body.appendChild(p);
      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      const cancel = document.createElement('button');
      cancel.textContent = 'Anuluj';
      cancel.addEventListener('click', () => { document.body.removeChild(modal); resolve('cancel'); });
      actions.appendChild(cancel);

      if (field === 'lyrics') {
        const wrapBtn = document.createElement('button');
        wrapBtn.textContent = 'Zawijaj tekst';
        wrapBtn.className = 'primary';
        wrapBtn.addEventListener('click', () => { document.body.removeChild(modal); resolve('wrap'); });
        actions.appendChild(wrapBtn);
      }

      const growBtn = document.createElement('button');
      growBtn.textContent = 'Zwiększ wysokość';
      growBtn.addEventListener('click', () => { document.body.removeChild(modal); resolve('grow'); });
      actions.appendChild(growBtn);

      content.appendChild(body);
      content.appendChild(actions);
      modal.appendChild(content);
      document.body.appendChild(modal);
    });
  }

  // Save handler: persist sizes, but confirm if content would be hidden
  saveSizeBtn.addEventListener('click', async () => {
    const songDiv = saveSizeBtn.closest('.song');
    if (!songDiv) return;
    const chordsEl = songDiv.querySelector('.chords');
    const lyricsEl = songDiv.querySelector('.lyrics');
    const songFields = songDiv.querySelector('.song-fields');

    // compute target heights only from explicit inline style or previously persisted dataset
    // (avoid using getComputedStyle here which can cause false positives when height is 'auto')
    const targetChordsH = chordsEl ? (chordsEl.style.height || songDiv.dataset.chordsHeight || '') : '';
    const targetLyricsH = lyricsEl ? (lyricsEl.style.height || songDiv.dataset.lyricsHeight || '') : '';
    const tolerance = 4; // pixels of tolerance for minor differences/rounding
    const chordsOverflow = chordsEl && parsePx(targetChordsH) > 0 && chordsEl.scrollHeight > (chordsEl.clientHeight + tolerance);
    const lyricsOverflow = lyricsEl && parsePx(targetLyricsH) > 0 && lyricsEl.scrollHeight > (lyricsEl.clientHeight + tolerance);

    // If overflow detected, ask user what to do
    if (lyricsOverflow || chordsOverflow) {
      // prioritize lyrics if both overflow
      if (lyricsOverflow) {
        const choice = await showOverflowModal({ songDiv, field: 'lyrics' });
        if (choice === 'cancel') return; // stay in edit mode
        if (choice === 'wrap') {
          // apply wrapping for lyrics (CSS change only)
          lyricsEl.style.whiteSpace = 'normal';
          songDiv.dataset.lyricsWrapped = '1';
          // persist current inline height (if any)
          songDiv.dataset.lyricsHeight = clampPx(lyricsEl.style.height || getComputedStyle(lyricsEl).height || '', 60);
        } else if (choice === 'grow') {
          // set height to content height
          const h = `${Math.max(lyricsEl.scrollHeight + 8, 60)}px`;
          lyricsEl.style.height = h;
          songDiv.dataset.lyricsHeight = h;
        }
      } else if (chordsOverflow) {
        const choice = await showOverflowModal({ songDiv, field: 'chords' });
        if (choice === 'cancel') return;
        if (choice === 'grow') {
          const h = `${Math.max(chordsEl.scrollHeight + 8, 60)}px`;
          chordsEl.style.height = h;
          songDiv.dataset.chordsHeight = h;
        }
      }
    } else {
      // no overflow — persist heights (clamped to sensible minimum)
      if (chordsEl) songDiv.dataset.chordsHeight = clampPx(chordsEl.style.height || getComputedStyle(chordsEl).height || '', 60);
      if (lyricsEl) songDiv.dataset.lyricsHeight = clampPx(lyricsEl.style.height || getComputedStyle(lyricsEl).height || '', 60);
    }

    // Persist explicit widths if the user resized horizontally (style.width)
    try {
      if (chordsEl) {
        const w = chordsEl.style.width || songDiv.dataset.chordsWidth || '';
        if (w) songDiv.dataset.chordsWidth = clampPx(w, 80);
      }
      if (lyricsEl) {
        const w = lyricsEl.style.width || songDiv.dataset.lyricsWidth || '';
        if (w) songDiv.dataset.lyricsWidth = clampPx(w, 80);
      }
    } catch (err) {
      // ignore
    }


    // if explicit widths/heights exist, set grid to match (optional)
    try {
      const cw = songDiv.dataset.chordsWidth || '';
      const lw = songDiv.dataset.lyricsWidth || '';
      // If explicit widths exist, set grid-template-columns to ensure columns don't overlap
      if (songFields && (cw || lw)) {
        const left = cw || 'auto';
        const right = lw || '1fr';
        songFields.style.gridTemplateColumns = `${left} ${right}`;
      }
    } catch (err) { /* ignore */ }

    // exit edit mode
    saveSizeBtn.style.display = 'none';
    cancelSizeBtn.style.display = 'none';
    songDiv.classList.remove('size-edit-mode');
    sizeToggle.setAttribute('aria-pressed', 'false');
    sizeToggle.title = 'Włącz edycję rozmiaru kontenerów (przeciągnij by zmienić)';
    // cleanup prev markers
    delete songDiv.dataset._prevChordsHeight;
    delete songDiv.dataset._prevLyricsHeight;
    delete songDiv.dataset._prevGrid;
  });

  // Cancel handler: restore previous styles
  cancelSizeBtn.addEventListener('click', () => {
    const songDiv = cancelSizeBtn.closest('.song');
    if (!songDiv) return;
    const chordsEl = songDiv.querySelector('.chords');
    const lyricsEl = songDiv.querySelector('.lyrics');
    const songFields = songDiv.querySelector('.song-fields');

    if (chordsEl) {
      const prev = songDiv.dataset._prevChordsHeight || '';
      if (prev) chordsEl.style.height = prev; else chordsEl.style.removeProperty('height');
    }
    if (lyricsEl) {
      const prev = songDiv.dataset._prevLyricsHeight || '';
      if (prev) lyricsEl.style.height = prev; else lyricsEl.style.removeProperty('height');
    }
    if (songFields) {
      const prevG = songDiv.dataset._prevGrid || '';
      if (prevG) songFields.style.gridTemplateColumns = prevG; else songFields.style.removeProperty('grid-template-columns');
    }

    saveSizeBtn.style.display = 'none';
    cancelSizeBtn.style.display = 'none';
    songDiv.classList.remove('size-edit-mode');
    sizeToggle.setAttribute('aria-pressed', 'false');
    sizeToggle.title = 'Włącz edycję rozmiaru kontenerów (przeciągnij by zmienić)';

    delete songDiv.dataset._prevChordsHeight;
    delete songDiv.dataset._prevLyricsHeight;
    delete songDiv.dataset._prevGrid;
  });

    // Append Reset as the last control so it stays at the end of the toolbar
    try {
      controls.appendChild(fontReset);
    } catch (e) { /* ignore */ }

    return controls;
}

function createSongElement(songData, options, songsHost) {
  const showChords = options.showChords !== false;
  const enableTranspose = options.enableTranspose !== false;
  const notesValue = typeof options.notes === 'string' ? options.notes : songData.notes || '';

  const songDiv = document.createElement('div');
  songDiv.className = 'song';
  songDiv.dataset.upgraded = '1';
  songDiv.dataset.chords = songData.chords || '';
  songDiv.dataset.notes = notesValue || '';
  songDiv.dataset.tab = songData.tab || '';
  // apply per-field fonts if present
  if (songData.font) {
    // back-compat: single font applies to both
    songDiv.dataset.fontChords = songData.font;
    songDiv.dataset.fontLyrics = songData.font;
    songDiv.style.setProperty('--song-chords-font-size', songData.font);
    songDiv.style.setProperty('--song-lyrics-font-size', songData.font);
  }
  if (songData.fontChords) {
    songDiv.dataset.fontChords = songData.fontChords;
    songDiv.style.setProperty('--song-chords-font-size', songData.fontChords);
  }
  if (songData.fontLyrics) {
    songDiv.dataset.fontLyrics = songData.fontLyrics;
    songDiv.style.setProperty('--song-lyrics-font-size', songData.fontLyrics);
  }
  // apply persisted heights if present
  if (songData.chordsHeight) {
    songDiv.dataset.chordsHeight = songData.chordsHeight;
  }
  if (songData.lyricsHeight) {
    songDiv.dataset.lyricsHeight = songData.lyricsHeight;
  }
  if (!showChords) {
    songDiv.classList.add('song--lyrics-only');
  } else {
    songDiv.classList.remove('song--lyrics-only');
  }

  const content = document.createElement('div');
  content.className = 'song-content';

  const heading = document.createElement('h2');
  heading.id = songData.id;
  heading.textContent = `${songData.number}. ${songData.title || 'Bez tytułu'}`;

  const fields = createSongContent(songData, { ...options, notes: notesValue });

  content.appendChild(heading);
  if (enableTranspose) {
    const controls = createTransposeControls();
    content.appendChild(controls);
    // If this song already has tablature data, show the per-song tab controls
    try {
      if (songData && typeof songData.tab === 'string' && songData.tab.trim()) {
        const perSongTabControls = controls.querySelector('.tab-controls');
        if (perSongTabControls) perSongTabControls.style.display = '';
      }
    } catch (e) { /* ignore */ }
      // wire up per-field font controls
      const clamp = (v) => Math.max(10, Math.min(72, v));
      const getCurrent = (prop, fallback) => {
        const current = window.getComputedStyle(songDiv).getPropertyValue(prop) || '';
        if (current && current.trim()) return parseFloat(current.replace('px','')) || fallback;
        return fallback;
      };

      const applyChordsFont = (delta) => {
        const base = getComputedStyle(document.documentElement).getPropertyValue('--base-font-size') || '18px';
        const cur = getCurrent('--song-chords-font-size', parseFloat(base));
        const next = clamp(Math.round((cur + delta) * 10) / 10);
        const val = `${next}px`;
        songDiv.dataset.fontChords = val;
        songDiv.style.setProperty('--song-chords-font-size', val);
      };

      const applyLyricsFont = (delta) => {
        const base = getComputedStyle(document.documentElement).getPropertyValue('--base-font-size') || '18px';
        const cur = getCurrent('--song-lyrics-font-size', parseFloat(base));
        const next = clamp(Math.round((cur + delta) * 10) / 10);
        const val = `${next}px`;
        songDiv.dataset.fontLyrics = val;
        songDiv.style.setProperty('--song-lyrics-font-size', val);
      };

      controls.querySelector('.song-font-chords-decrease')?.addEventListener('click', () => applyChordsFont(-1));
      controls.querySelector('.song-font-chords-increase')?.addEventListener('click', () => applyChordsFont(1));
      controls.querySelector('.song-font-lyrics-decrease')?.addEventListener('click', () => applyLyricsFont(-1));
      controls.querySelector('.song-font-lyrics-increase')?.addEventListener('click', () => applyLyricsFont(1));
      controls.querySelector('.song-font-reset')?.addEventListener('click', () => {
        // Full restore: revert to the original snapshot captured at creation time
        try {
          const orig = songDiv.dataset._origState ? JSON.parse(songDiv.dataset._origState) : {};
          const chordsEl = songDiv.querySelector('.chords');
          const lyricsEl = songDiv.querySelector('.lyrics');
          const songFields = songDiv.querySelector('.song-fields');

          // Fonts
          if (orig.fontChords) {
            songDiv.dataset.fontChords = orig.fontChords;
            songDiv.style.setProperty('--song-chords-font-size', orig.fontChords);
          } else {
            songDiv.style.removeProperty('--song-chords-font-size');
            delete songDiv.dataset.fontChords;
          }
          if (orig.fontLyrics) {
            songDiv.dataset.fontLyrics = orig.fontLyrics;
            songDiv.style.setProperty('--song-lyrics-font-size', orig.fontLyrics);
          } else {
            songDiv.style.removeProperty('--song-lyrics-font-size');
            delete songDiv.dataset.fontLyrics;
          }

          // Widths
          if (chordsEl) {
            if (orig.chordsWidth) {
              chordsEl.style.width = orig.chordsWidth;
              songDiv.dataset.chordsWidth = orig.chordsWidth;
            } else {
              chordsEl.style.removeProperty('width');
              delete songDiv.dataset.chordsWidth;
            }
          }
          if (lyricsEl) {
            if (orig.lyricsWidth) {
              lyricsEl.style.width = orig.lyricsWidth;
              songDiv.dataset.lyricsWidth = orig.lyricsWidth;
            } else {
              lyricsEl.style.removeProperty('width');
              delete songDiv.dataset.lyricsWidth;
            }
          }

          // Heights
          if (chordsEl) {
            if (orig.chordsHeight) {
              chordsEl.style.height = orig.chordsHeight;
              songDiv.dataset.chordsHeight = orig.chordsHeight;
            } else {
              chordsEl.style.removeProperty('height');
              delete songDiv.dataset.chordsHeight;
            }
          }
          if (lyricsEl) {
            if (orig.lyricsHeight) {
              lyricsEl.style.height = orig.lyricsHeight;
              songDiv.dataset.lyricsHeight = orig.lyricsHeight;
            } else {
              lyricsEl.style.removeProperty('height');
              delete songDiv.dataset.lyricsHeight;
            }
          }

          // Grid/template
          if (songFields) {
            if (orig.gridTemplate) {
              songFields.style.gridTemplateColumns = orig.gridTemplate;
            } else {
              songFields.style.removeProperty('grid-template-columns');
            }
          }

          // lyrics wrapping
          if (orig.lyricsWrapped) {
            if (lyricsEl) lyricsEl.style.whiteSpace = 'normal';
            songDiv.dataset.lyricsWrapped = orig.lyricsWrapped;
          } else {
            if (lyricsEl) lyricsEl.style.removeProperty('white-space');
            delete songDiv.dataset.lyricsWrapped;
          }

          // Reset transposition and any chord normalization
          try { resetTransposeForSong(songDiv); } catch (e) { /* ignore */ }

        } catch (err) {
          // fallback: remove obvious overrides
          songDiv.style.removeProperty('--song-chords-font-size');
          songDiv.style.removeProperty('--song-lyrics-font-size');
          const chordsEl = songDiv.querySelector('.chords');
          const lyricsEl = songDiv.querySelector('.lyrics');
          if (chordsEl) { chordsEl.style.removeProperty('width'); chordsEl.style.removeProperty('height'); }
          if (lyricsEl) { lyricsEl.style.removeProperty('width'); lyricsEl.style.removeProperty('height'); lyricsEl.style.removeProperty('white-space'); }
          delete songDiv.dataset.chordsWidth; delete songDiv.dataset.lyricsWidth; delete songDiv.dataset.chordsHeight; delete songDiv.dataset.lyricsHeight; delete songDiv.dataset.fontChords; delete songDiv.dataset.fontLyrics; delete songDiv.dataset.lyricsWrapped;
          try { resetTransposeForSong(songDiv); } catch (e) { /* ignore */ }
        }
      });
    // Add a simple tab toggle control next to transpose controls
    const tabToggle = document.createElement('button');
    tabToggle.type = 'button';
    tabToggle.className = 'tab-toggle-btn';
    // use icon + label span so label can be forced to nowrap and avoid mid-word breaks
    const tabLabel = songData.tab ? 'Usuń tabulaturę' : 'Dodaj tabulaturę';
    tabToggle.textContent = tabLabel;
    tabToggle.title = tabLabel;
    tabToggle.addEventListener('click', () => {
      // locate song container from the controls element to avoid relying on outer scope
      const controlsNode = tabToggle.closest('.transpose-controls');
      const songContainer = controlsNode?.closest('.song');
      if (!songContainer) return;
      const fieldsWrap = songContainer.querySelector('.song-fields');
      if (!fieldsWrap) return;
      const existing = fieldsWrap.querySelector('.song-field.tablature-field');
      if (existing) {
        existing.remove();
        delete songContainer.dataset.tab;
        // hide per-song tab controls when tablature removed
        try {
          const perSongTabControls = controlsNode.querySelector('.tab-controls');
          if (perSongTabControls) perSongTabControls.style.display = 'none';
        } catch (e) { /* ignore */ }
        tabToggle.textContent = 'Dodaj tabulaturę';
        tabToggle.title = 'Dodaj tabulaturę';
        return;
      }
      const tabContent = songContainer.dataset.tab || '';
      const tabWrap = createEditableField('tab', tabContent, { normalize: false });
      tabWrap.classList.add('tablature-field');
      // (Import/Save controls are provided in the transpose controls toolbar)

      // ensure inner editable element exists and is editable
      const inner = tabWrap.querySelector('.tablature') || tabWrap.querySelector('.tab') || tabWrap.querySelector('[data-field="tab"]');
      if (inner) inner.contentEditable = 'true';
      // prepend so the tablature block appears at the top of the fields area
      fieldsWrap.prepend(tabWrap);
      // persist an initial empty tab or existing dataset value
      songContainer.dataset.tab = (tabContent || '').trim();
      // show per-song tab controls when tablature exists
      try {
        const perSongTabControls = controlsNode.querySelector('.tab-controls');
        if (perSongTabControls) perSongTabControls.style.display = '';
      } catch (e) { /* ignore */ }
      tabToggle.textContent = 'Usuń tabulaturę';
      tabToggle.title = 'Usuń tabulaturę';
    });
    controls.appendChild(tabToggle);
    // place the tab import/save controls immediately after the tab toggle
    try {
      tabToggle.insertAdjacentElement('afterend', controls.querySelector('.tab-controls'));
    } catch (e) { /* ignore if insertion fails */ }
  }
  content.appendChild(fields);
  // Capture an original snapshot of visual/size state for this song so the
  // full-restore button can revert all per-song overrides later.
  try {
    if (!songDiv.dataset._origState) {
      const chordsInit = songDiv.querySelector('.chords');
      const lyricsInit = songDiv.querySelector('.lyrics');
      const fieldsInit = songDiv.querySelector('.song-fields');
      const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : '');
      const orig = {
        fontChords: songDiv.dataset.fontChords || cs(songDiv, '--song-chords-font-size') || '',
        fontLyrics: songDiv.dataset.fontLyrics || cs(songDiv, '--song-lyrics-font-size') || '',
        chordsWidth: chordsInit ? (chordsInit.style.width || '') : '',
        lyricsWidth: lyricsInit ? (lyricsInit.style.width || '') : '',
        chordsHeight: chordsInit ? (chordsInit.style.height || '') : '',
        lyricsHeight: lyricsInit ? (lyricsInit.style.height || '') : '',
        gridTemplate: fieldsInit ? (fieldsInit.style.gridTemplateColumns || '') : '',
        lyricsWrapped: songDiv.dataset.lyricsWrapped || ''
      };
      songDiv.dataset._origState = JSON.stringify(orig);
    }
  } catch (err) { /* ignore snapshot failures */ }
  // apply heights to rendered fields
  try {
    const chordsEl = songDiv.querySelector('.chords');
    const lyricsEl = songDiv.querySelector('.lyrics');
    // Ensure editable fields remain editable and clamp persisted sizes to sensible minimums
    if (chordsEl) chordsEl.contentEditable = 'true';
    if (lyricsEl) lyricsEl.contentEditable = 'true';
    if (songDiv.dataset.chordsHeight && chordsEl) chordsEl.style.height = clampPx(songDiv.dataset.chordsHeight, 60);
    if (songDiv.dataset.lyricsHeight && lyricsEl) lyricsEl.style.height = clampPx(songDiv.dataset.lyricsHeight, 60);
    // apply persisted widths if present and set grid-template so columns align
    const songFields = songDiv.querySelector('.song-fields');
    if (songDiv.dataset.chordsWidth && chordsEl) chordsEl.style.width = clampPx(songDiv.dataset.chordsWidth, 80);
    if (songDiv.dataset.lyricsWidth && lyricsEl) lyricsEl.style.width = clampPx(songDiv.dataset.lyricsWidth, 80);
    try {
      const cw = songDiv.dataset.chordsWidth || '';
      const lw = songDiv.dataset.lyricsWidth || '';
      if (songFields && (cw || lw)) {
        const left = cw || 'auto';
        const right = lw || '1fr';
        songFields.style.gridTemplateColumns = `${left} ${right}`;
      }
    } catch (err) { /* ignore */ }
  } catch (err) {
    // ignore
  }
  songDiv.appendChild(content);

  songsHost.appendChild(songDiv);
  if (enableTranspose) {
    initTransposeControls(songDiv);
  }

  return songDiv;
}

function createTocEntry(songData) {
  const li = document.createElement('li');
  li.draggable = true;
  li.dataset.target = songData.id;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toc-link';
  button.dataset.target = songData.id;
  button.textContent = `${songData.number}. ${songData.title || 'Bez tytułu'}`;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-song-btn';
  deleteBtn.title = 'Usuń piosenkę';
  deleteBtn.textContent = '×';

  li.append(button, deleteBtn);
  return li;
}

export function addSong(context, songData, options = {}) {
  const { tocList, songsHost } = context;
  if (!tocList || !songsHost) return null;

  const trimmedTitle = (songData.title || '').trim();
  const displayTitle = trimmedTitle || 'Bez tytułu';
  const requestedId = typeof songData.id === 'string' && songData.id.trim() ? songData.id.trim() : slugify(displayTitle);
  const id = ensureUniqueId(requestedId, songsHost);

  const number = typeof songData.number === 'number' && !Number.isNaN(songData.number)
    ? songData.number
    : tocList.querySelectorAll('li').length + 1;

  const payload = {
    ...songData,
    id,
    title: displayTitle,
    number,
    notes: typeof songData.notes === 'string' ? songData.notes : '',
  };

  const li = createTocEntry(payload);
  const songElement = createSongElement(
    payload,
    {
      chords: songData.chords || '',
      lyrics: songData.lyrics || '',
      notes: payload.notes,
      normalizeChords: options.normalizeChords !== false,
      showChords: options.showChords !== false,
      enableTranspose: options.enableTranspose !== false,
    },
    songsHost,
  );

  tocList.appendChild(li);
  return { id, songElement, tocEntry: li };
}

export function upgradeExistingSongs(songsHost, options = {}) {
  if (!songsHost) return;
  const showChords = options.showChords !== false;
  const enableTranspose = options.enableTranspose !== false;

  $$('.song', songsHost).forEach((song) => {
    if (!song || song.dataset.upgraded === '1') return;
    const songContent = $('.song-content', song) || song;
    if ($('.song-fields', songContent)) {
        song.dataset.upgraded = '1';
        if (enableTranspose) {
          const controls = createTransposeControls();
          const heading = $('h2', songContent);
          if (heading) {
            heading.insertAdjacentElement('afterend', controls);
          } else {
            songContent.prepend(controls);
          }

          // wire up BPM and play button to dispatch custom events handled by app
          const bpmInput = controls.querySelector('.bpm-input');
          const playBtn = controls.querySelector('.song-play-btn');
          if (bpmInput && typeof song.dataset.bpm === 'string') bpmInput.value = song.dataset.bpm || '';
                  // play button wiring is handled in createTransposeControls when controls are created
        }
      if (!showChords) {
        const chordsEl = $('.song-field.chords-field .chords', songContent);
        const chordsText = normalizeMultiline(chordsEl?.innerText || '').trimEnd();
        song.dataset.chords = chordsText;
        song.classList.add('song--lyrics-only');
        $$('.song-field.chords-field', songContent).forEach((field) => field.remove());
        const notesField = $('.song-field.notes-field', songContent);
        const existingNotes = normalizeMultiline(notesField?.querySelector('.notes')?.innerText || song.dataset.notes || '').trimEnd();
        song.dataset.notes = existingNotes;
        if (!notesField) {
          const lyricsField = $('.song-field.lyrics-field', songContent);
          const wrap = $('.song-fields', songContent);
          if (wrap) {
            const field = createEditableField('notes', existingNotes);
            if (lyricsField) {
              lyricsField.insertAdjacentElement('afterend', field);
            } else {
              wrap.appendChild(field);
            }
          }
        }
      } else {
        const chordsEl = $('.song-field.chords-field .chords', songContent);
        if (chordsEl) {
          song.dataset.chords = normalizeMultiline(chordsEl.innerText || '').trimEnd();
        }
        const notesField = $('.song-field.notes-field', songContent);
        const notesValue = normalizeMultiline(notesField?.querySelector('.notes')?.innerText || song.dataset.notes || '').trimEnd();
        song.dataset.notes = notesValue;
        notesField?.remove();
      }
      return;
    }

    const legacyLines = $$('.line', songContent);
    if (!legacyLines.length) {
      song.dataset.upgraded = '1';
      return;
    }

    const chordLines = [];
    const lyricLines = [];
    legacyLines.forEach((line) => {
      const chordText = normalizeMultiline($('.chords', line)?.innerText || '');
      const lyricText = normalizeMultiline($('.lyrics', line)?.innerText || '');
      chordLines.push(chordText);
      lyricLines.push(lyricText);
      line.remove();
    });

    const chordsText = trimTrailingEmptyLines(chordLines);
    const lyricsText = trimTrailingEmptyLines(lyricLines);

    const heading = $('h2', songContent);
    $$('.transpose-controls', songContent).forEach((node) => node.remove());

    const notesSource = normalizeMultiline(song.dataset.notes || '').trimEnd();
    const fields = createSongContent(
      { chords: chordsText, lyrics: lyricsText, notes: notesSource },
      {
        chords: chordsText,
        lyrics: lyricsText,
        notes: notesSource,
        normalizeChords: true,
        showChords,
      },
    );

    if (enableTranspose) {
      const controls = createTransposeControls();
      if (heading) {
        heading.insertAdjacentElement('afterend', controls);
        controls.insertAdjacentElement('afterend', fields);
      } else {
        songContent.prepend(controls);
        controls.insertAdjacentElement('afterend', fields);
      }
      initTransposeControls(song);
    } else if (heading) {
      heading.insertAdjacentElement('afterend', fields);
    } else {
      songContent.appendChild(fields);
    }

    if (!showChords) {
      song.classList.add('song--lyrics-only');
    } else {
      song.classList.remove('song--lyrics-only');
    }

  song.dataset.chords = chordsText;
  song.dataset.notes = notesSource;
    song.dataset.upgraded = '1';
  });
}

export function renderSongs(context, songs, options = {}) {
  const { tocList, songsHost } = context;
  if (!tocList || !songsHost) return;

  tocList.innerHTML = '';
  songsHost.innerHTML = '';

  songs.forEach((song) => {
    addSong(context, song, {
      normalizeChords: options.normalizeChords !== false,
      showChords: options.showChords !== false,
      enableTranspose: options.enableTranspose !== false,
    });
  });
}

export function serializeSongs(songsHost) {
  const songs = [];
  $$('.song', songsHost).forEach((song) => {
    const heading = song.querySelector('h2');
    const rawTitle = (heading?.textContent || '').replace(/^\d+\.\s*/, '');
    const title = rawTitle.trim();
    const id = heading?.id || '';
    const chordsEl = $('.chords', song);
    const lyricsEl = $('.lyrics', song);
    const notesEl = $('.notes', song);
    const chords = chordsEl
      ? normalizeMultiline(chordsEl.innerText || '').trimEnd()
      : normalizeMultiline(song.dataset.chords || '').trimEnd();
    if (chordsEl) {
      song.dataset.chords = chords;
    }
    const lyrics = normalizeMultiline(lyricsEl?.innerText || '').trimEnd();
    const notes = notesEl
      ? normalizeMultiline(notesEl.innerText || '').trimEnd()
      : normalizeMultiline(song.dataset.notes || '').trimEnd();
    if (notesEl) {
      song.dataset.notes = notes;
    }
    const tabEl = song.querySelector('.tablature');
    const tab = tabEl
      ? normalizeMultiline(tabEl.innerText || '').trimEnd()
      : (typeof song.dataset.tab === 'string' ? normalizeMultiline(song.dataset.tab || '').trimEnd() : '');
    if (tabEl) {
      song.dataset.tab = tab;
    }
    const bpmEl = song.querySelector('.bpm-input');
    const bpmVal = bpmEl ? (bpmEl.value || '') : (typeof song.dataset.bpm === 'string' ? song.dataset.bpm : '');
    if (bpmEl) {
      song.dataset.bpm = String(bpmVal);
    }
    // persist any manual heights
    const chordsHeight = song.dataset.chordsHeight || '';
    const lyricsHeight = song.dataset.lyricsHeight || '';
    const item = { title, id, chords, lyrics, notes, tab, bpm: bpmVal };
    if (chordsHeight) item.chordsHeight = chordsHeight;
    if (lyricsHeight) item.lyricsHeight = lyricsHeight;
    songs.push(item);
  });
  return songs;
}

// expose font if present when serializing
export function serializeSongsWithFont(songsHost) {
  const songs = serializeSongs(songsHost);
  // enrich with font from dataset
  $$('.song', songsHost).forEach((songEl, idx) => {
    const fontChords = songEl.dataset.fontChords || '';
    const fontLyrics = songEl.dataset.fontLyrics || '';
    if (fontChords) songs[idx].fontChords = fontChords;
    if (fontLyrics) songs[idx].fontLyrics = fontLyrics;
  });
  return songs;
}

export function renumberSongs(tocList, songsHost) {
  $$('.toc-link', tocList).forEach((btn, index) => {
    const text = btn.textContent.replace(/^\d+\.\s*/, '');
    btn.textContent = `${index + 1}. ${text}`;
  });

  $$('.song h2[id]', songsHost).forEach((heading, index) => {
    const text = heading.textContent.replace(/^\d+\.\s*/, '');
    heading.textContent = `${index + 1}. ${text}`;
  });
}

export function collectOrder(tocList) {
  return $$('#tocList li[data-target]', tocList.parentElement || document)
    .map((item) => item.dataset.target)
    .filter(Boolean);
}

export function applyOrder(tocList, songsHost, orderIds) {
  // Reorder TOC entries based on provided orderIds
  const tocEntries = Array.from(tocList.querySelectorAll('li[data-target]'));
  const tocMap = new Map(tocEntries.map((li) => [li.dataset.target, li]));
  orderIds.forEach((id) => {
    const entry = tocMap.get(id);
    if (entry) tocList.appendChild(entry);
  });

  // Reorder song elements. Use document.getElementById(id) to locate the heading
  // and then find its closest .song container. This is more robust than relying
  // on existing dataset values on the song elements.
  orderIds.forEach((id) => {
    try {
      const heading = document.getElementById(id);
      const song = heading?.closest('.song');
      if (song && songsHost.contains(song) === false) {
        // If song is not currently a child of songsHost, append it.
        songsHost.appendChild(song);
      } else if (song) {
        // Move song to the correct position by appending (appendChild moves existing nodes)
        songsHost.appendChild(song);
      }
    } catch (err) {
      // ignore malformed ids
    }
  });
}
