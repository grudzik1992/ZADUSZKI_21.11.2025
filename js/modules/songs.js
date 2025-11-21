import { $, $$, normalizeMultiline, trimTrailingEmptyLines } from './dom.js';
import { convertChordNotation, initTransposeControls, normalizeChordFieldDom } from './transpose.js';

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
  // Per-field font size controls: chords (guitar) and lyrics (microphone)
  const chordsDec = document.createElement('button');
  chordsDec.type = 'button';
  chordsDec.className = 'tab-toggle-btn song-font-chords-decrease';
  chordsDec.title = 'Zmniejsz czcionkę akordów';
  chordsDec.innerHTML = '🎸 A-';
  controls.appendChild(chordsDec);

  const chordsInc = document.createElement('button');
  chordsInc.type = 'button';
  chordsInc.className = 'tab-toggle-btn song-font-chords-increase';
  chordsInc.title = 'Zwiększ czcionkę akordów';
  chordsInc.innerHTML = '🎸 A+';
  controls.appendChild(chordsInc);

  const lyricsDec = document.createElement('button');
  lyricsDec.type = 'button';
  lyricsDec.className = 'tab-toggle-btn song-font-lyrics-decrease';
  lyricsDec.title = 'Zmniejsz czcionkę tekstu';
  lyricsDec.innerHTML = '🎤 A-';
  controls.appendChild(lyricsDec);

  const lyricsInc = document.createElement('button');
  lyricsInc.type = 'button';
  lyricsInc.className = 'tab-toggle-btn song-font-lyrics-increase';
  lyricsInc.title = 'Zwiększ czcionkę tekstu';
  lyricsInc.innerHTML = '🎤 A+';
  controls.appendChild(lyricsInc);

  // Reset fonts for this song
  const fontReset = document.createElement('button');
  fontReset.type = 'button';
  fontReset.className = 'tab-toggle-btn song-font-reset';
  fontReset.title = 'Resetuj czcionki tego utworu';
  fontReset.textContent = 'Reset';
  controls.appendChild(fontReset);
  // Import .txt input (hidden) and button
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.txt';
  importInput.style.display = 'none';
  controls.appendChild(importInput);

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'tab-toggle-btn import-btn';
  importBtn.textContent = 'Import .txt';
  importBtn.title = 'Wczytaj tabulaturę z pliku .txt';
  controls.appendChild(importBtn);

  importBtn.addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result.replace(/\r\n?/g, '\n') : '';
      // insert or update tablature field in the songDiv context (the handler that creates controls
      // will assign this input/button to the controls for a particular song, so find the songDiv
      const controlsNode = importInput.closest('.transpose-controls');
      const songDiv = controlsNode?.closest('.song');
      if (!songDiv) return;
      const songContent = songDiv.querySelector('.song-content');
      const fieldsWrap = songContent?.querySelector('.song-fields') || songContent;
      if (!fieldsWrap) return;
      // find existing tablature editable element
      let tabEl = fieldsWrap.querySelector('.song-field.tablature-field .tablature');
      if (!tabEl) {
        // create a new tablature field and append
        const tabWrap = createEditableField('tab', text, { normalize: false });
        tabWrap.classList.add('tablature-field');
        fieldsWrap.appendChild(tabWrap);
      } else {
        tabEl.textContent = text;
      }
      // keep dataset in sync so serialization picks it up immediately
      songDiv.dataset.tab = text.trim();
      // clear input for next use
      importInput.value = '';
    };
    reader.readAsText(file, 'utf-8');
  });
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
        // remove overrides and clear dataset
        songDiv.style.removeProperty('--song-chords-font-size');
        songDiv.style.removeProperty('--song-lyrics-font-size');
        delete songDiv.dataset.fontChords;
        delete songDiv.dataset.fontLyrics;
      });
    // Add a simple tab toggle control next to transpose controls
    const tabToggle = document.createElement('button');
    tabToggle.type = 'button';
    tabToggle.className = 'tab-toggle-btn';
    tabToggle.textContent = songData.tab ? 'Usuń tabulaturę' : 'Dodaj tabulaturę';
    tabToggle.title = 'Dodaj lub usuń tabulaturę dla tego utworu';
    tabToggle.addEventListener('click', () => {
      const fieldsWrap = songDiv.querySelector('.song-fields');
      if (!fieldsWrap) return;
      const existing = fieldsWrap.querySelector('.song-field.tablature-field');
      if (existing) {
        existing.remove();
        delete songDiv.dataset.tab;
        tabToggle.textContent = 'Dodaj tabulaturę';
        return;
      }
      const tabContent = songDiv.dataset.tab || '';
      const tabField = createEditableField('tab', tabContent, { normalize: false });
      tabField.classList.add('tablature-field');
      fieldsWrap.appendChild(tabField);
      songDiv.dataset.tab = tabContent;
      tabToggle.textContent = 'Usuń tabulaturę';
    });
    controls.appendChild(tabToggle);
  }
  content.appendChild(fields);
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
          if (playBtn) {
            playBtn.addEventListener('click', () => {
              const isPlaying = playBtn.getAttribute('aria-pressed') === 'true';
              const bpm = Number(bpmInput?.value) || 0;
              const detail = { id: (heading && heading.id) || song.dataset.id || '', bpm };
              if (!isPlaying) {
                playBtn.setAttribute('aria-pressed', 'true');
                playBtn.textContent = '⏸';
                song.dispatchEvent(new CustomEvent('song:play', { detail, bubbles: true }));
              } else {
                playBtn.setAttribute('aria-pressed', 'false');
                playBtn.textContent = '▶';
                song.dispatchEvent(new CustomEvent('song:stop', { detail, bubbles: true }));
              }
            });
          }
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
    songs.push({ title, id, chords, lyrics, notes, tab, bpm: bpmVal });
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
