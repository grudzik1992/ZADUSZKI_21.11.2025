import { $, scrollToSong } from './modules/dom.js';
import { initTheme } from './modules/theme.js';
import { observeChordFieldEdits } from './modules/transpose.js';
import { parseTab } from './modules/tabParser.js';
import {
  addSong,
  upgradeExistingSongs,
  renderSongs,
  serializeSongs,
  serializeSongsWithFont,
  renumberSongs,
  applyOrder,
  collectOrder,
} from './modules/songs.js';
import { initDragDrop } from './modules/dragDrop.js';
import {
  loadSavedSongs,
  saveSongs,
  clearSavedSongs,
  loadSavedOrder,
  saveOrder,
  loadDefaultSongs,
  getNotationPreference,
  setNotationPreference,
  CURRENT_DEFAULTS_VERSION,
  getSavedDefaultsVersion,
  setSavedDefaultsVersion,
} from './modules/storage.js';
import { initProfileControl, PROFILE_VOCALIST, setProfile } from './modules/profile.js';

const MESSAGE_LOADING = 'Wczytywanie utworów...';
const MESSAGE_LOAD_ERROR =
  'Nie udało się wczytać śpiewnika. Upewnij się, że aplikacja działa z serwera (https:// lub http://).';

function queryAllSelectors() {
  return {
    toolbar: $('.toolbar'),
    tocList: $('#tocList'),
    songsHost: $('#songsContainer'),
    themeToggle: $('#themeToggle'),
    exportPdfBtn: $('#exportPdfBtn'),
    hamburger: $('#hamburgerMenu'),
    toolbarButtons: $('#toolbarButtons'),
  helpBtn: $('#helpBtn'),
  helpModal: $('#helpModal'),
  helpCloseBtn: $('#closeHelpBtn'),
    modal: $('#addSongModal'),
    titleInput: $('#songTitle'),
    lyricsInput: $('#songLyrics'),
    confirmBtn: $('#confirmAddSong'),
    cancelBtn: $('#cancelAddSong'),
    addBtn: $('#addSongBtn'),
    saveBtn: $('#saveSongbookBtn'),
    clearBtn: $('#clearSongbookBtn'),
    backToTop: $('#backToTop'),
    profileSelect: $('#profileSelect'),
    importBtn: $('#importJsonBtn'),
    importInput: $('#importJsonInput'),
    fontDecreaseBtn: $('#fontDecreaseBtn'),
    fontIncreaseBtn: $('#fontIncreaseBtn'),
    pxPerBeatInput: $('#pxPerBeatInput'),
  };
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[app] DOMContentLoaded');
  const refs = queryAllSelectors();
  const context = { tocList: refs.tocList, songsHost: refs.songsHost };
  const scrollWithOffset = (targetId) => scrollToSong(targetId, refs.toolbar);
  let currentProfile = PROFILE_VOCALIST;
  const FONT_SIZE_KEY = 'songbook-font-size';
  const PX_PER_BEAT_KEY = 'songbook-px-per-beat';

  currentProfile = initProfileControl(refs.profileSelect, { onChange: handleProfileChange });

  const themeController = initTheme(refs.themeToggle);
  setupPrintThemeGuard(themeController);

  initFontSizeControls();
  initPxPerBeatControl();
  // If defaults version changed, clear saved user data so app loads new factory defaults
  try {
    const savedVersion = getSavedDefaultsVersion();
    if (savedVersion !== CURRENT_DEFAULTS_VERSION) {
      // clear stored songs/order so new data/lyrics.json is used
      clearSavedSongs();
      setSavedDefaultsVersion(CURRENT_DEFAULTS_VERSION);
    }
  } catch (error) {
    console.warn('Błąd podczas sprawdzania wersji domyślnych danych:', error);
  }
  // initialize lock button visual state from document attribute
  const initialLocked = document.documentElement.dataset.tocLocked === 'true';
  const toolbarLockBtn = $('#lockTocBtn');
  if (toolbarLockBtn) {
    toolbarLockBtn.setAttribute('aria-pressed', String(initialLocked));
    toolbarLockBtn.classList.toggle('locked', initialLocked);
    const label = toolbarLockBtn.querySelector('.icon-label');
    if (label) label.textContent = initialLocked ? 'Odblokuj' : 'Zablokuj';
  }
  refs.exportPdfBtn?.addEventListener('click', () => window.print());
  observeChordFieldEdits(document);
  upgradeExistingSongs(refs.songsHost, songFeatureOptions());

  initHamburgerMenu(refs.hamburger, refs.toolbarButtons);
  initModal();
  initBackToTop();
  initToolbarActions();
  initDeletionHandler();
  initImportButton();
  initHelpDialog();

  initDragDrop({
    tocList: refs.tocList,
    songsHost: refs.songsHost,
    scrollToSong: scrollWithOffset,
    onOrderChange: (orderIds) => {
      // Apply the new order to the songs DOM so TOC reordering actually
      // reflects in the real song list, then persist it to localStorage.
      try {
        applyOrder(refs.tocList, refs.songsHost, orderIds);
        renumberSongs(refs.tocList, refs.songsHost);
        saveOrder(orderIds);
      } catch (err) {
        console.warn('Błąd podczas stosowania kolejności TOC:', err);
      }
    },
  });

  hydrateSongs();

  function hydrateSongs() {
    console.log('[app] hydrateSongs start');
    if (!refs.songsHost) return;
    showMessage(MESSAGE_LOADING);

    const savedSongs = prepareSavedSongs();
    console.log('[app] savedSongs.length =', savedSongs.length);
    if (savedSongs.length) {
      renderSongs(context, savedSongs, {
        ...songFeatureOptions({
          normalizeChords: isVocalistProfile() ? false : getNotationPreference() !== 'pl',
        }),
      });
      console.log('[app] renderSongs from savedSongs done');
      finalizeRender();
      return;
    }

    loadDefaultSongs({ includeChords: !isVocalistProfile() }).then((defaults) => {
      console.log('[app] loadDefaultSongs resolved, defaults.length =', defaults.length);
      if (defaults.length) {
        renderSongs(context, defaults, songFeatureOptions());
        console.log('[app] renderSongs from defaults done');
        finalizeRender();
      } else {
        showMessage(MESSAGE_LOAD_ERROR);
      }
    });
  }

  function prepareSavedSongs() {
    const saved = loadSavedSongs();
    if (!Array.isArray(saved) || !saved.length) return [];
    return saved.map((song, index) => ({
      ...song,
      number: index + 1,
    }));
  }

  function finalizeRender() {
    const order = loadSavedOrder();
    if (order.length) {
      applyOrder(refs.tocList, refs.songsHost, order);
    }
    refreshOrderingState();
    console.log('[app] finalizeRender complete');
  }

  function showMessage(message) {
    if (!refs.songsHost) return;
    refs.songsHost.innerHTML = '';
    if (!message) return;
    const info = document.createElement('p');
    info.className = 'loading-message';
    info.textContent = message;
    refs.songsHost.appendChild(info);
  }

  function initModal() {
    const { modal, addBtn, confirmBtn, cancelBtn, titleInput, lyricsInput } = refs;
    if (!modal) return;

    const closeModal = () => {
      modal.hidden = true;
      if (titleInput) titleInput.value = '';
      if (lyricsInput) lyricsInput.value = '';
    };

    addBtn?.addEventListener('click', () => {
      modal.hidden = false;
      requestAnimationFrame(() => titleInput?.focus());
    });

    confirmBtn?.addEventListener('click', () => {
      const title = (titleInput?.value || '').trim();
      const lyrics = (lyricsInput?.value || '').trim();
      if (!title || !lyrics) {
        window.alert('Uzupełnij tytuł i tekst.');
        return;
      }

      const { id } = addSong(context, { title, lyrics }, songFeatureOptions());
      renumberSongs(refs.tocList, refs.songsHost);
      saveOrder(collectOrder(refs.tocList));
      scrollWithOffset(id);
      closeModal();
    });

    cancelBtn?.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });

    document.addEventListener('keydown', (event) => {
      if (modal.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
      if (event.key === 'Enter' && (document.activeElement === titleInput || document.activeElement === lyricsInput)) {
        event.preventDefault();
        confirmBtn?.click();
      }
    });
  }

  function initFontSizeControls() {
    const decrease = refs.fontDecreaseBtn;
    const increase = refs.fontIncreaseBtn;
    const root = document.documentElement;
    const getSaved = () => localStorage.getItem(FONT_SIZE_KEY) || '';
    const applySize = (value) => {
      if (!value) return;
      root.style.setProperty('--base-font-size', value);
    };
    // apply saved or default
    const saved = getSaved();
    if (saved) applySize(saved);

    decrease?.addEventListener('click', () => {
      const computed = getComputedStyle(document.documentElement).getPropertyValue('--base-font-size').trim() || '18px';
      const num = parseFloat(computed.replace('px','')) || 18;
      const next = Math.max(12, Math.round((num - 1) * 10) / 10) + 'px';
      applySize(next);
      localStorage.setItem(FONT_SIZE_KEY, next);
    });

    increase?.addEventListener('click', () => {
      const computed = getComputedStyle(document.documentElement).getPropertyValue('--base-font-size').trim() || '18px';
      const num = parseFloat(computed.replace('px','')) || 18;
      const next = Math.min(36, Math.round((num + 1) * 10) / 10) + 'px';
      applySize(next);
      localStorage.setItem(FONT_SIZE_KEY, next);
    });
  }

  function initPxPerBeatControl() {
    const input = refs.pxPerBeatInput;
    if (!input) return;
    const saved = localStorage.getItem(PX_PER_BEAT_KEY);
    if (saved) input.value = saved;
    input.addEventListener('change', () => {
      const v = Number(input.value) || 30;
      localStorage.setItem(PX_PER_BEAT_KEY, String(v));
    });
  }

  // Autoscroll manager
  const autoScrollState = { raf: null, lastTime: null, speedPxPerSec: 0, targetSong: null };
  function startAutoScroll({ id, bpm }) {
    stopAutoScroll();
    const songEl = document.getElementById(id)?.closest('.song');
    if (!songEl) return;
    // ensure the related play button shows playing state
    const playBtn = songEl.querySelector('.song-play-btn');
    if (playBtn) {
      playBtn.setAttribute('aria-pressed', 'true');
      playBtn.textContent = '⏸';
    }
    const pxPerBeat = Number(localStorage.getItem(PX_PER_BEAT_KEY)) || Number(refs.pxPerBeatInput?.value) || 30;
    const speed = (pxPerBeat * (Number(bpm) || 60)) / 60; // px per second
    autoScrollState.speedPxPerSec = speed;
    autoScrollState.targetSong = songEl;
    autoScrollState.lastTime = performance.now();
    function step(now) {
      const dt = (now - autoScrollState.lastTime) / 1000;
      autoScrollState.lastTime = now;
      const amount = autoScrollState.speedPxPerSec * dt;
      // Scroll the window smoothly, keep song visible
      window.scrollBy({ top: amount, left: 0, behavior: 'auto' });
      // stop when we reach bottom of song
      const songRect = autoScrollState.targetSong.getBoundingClientRect();
      if (songRect.bottom <= (window.innerHeight || document.documentElement.clientHeight)) {
        stopAutoScroll();
        return;
      }
      autoScrollState.raf = requestAnimationFrame(step);
    }
    autoScrollState.raf = requestAnimationFrame(step);
  }

  function stopAutoScroll() {
    if (autoScrollState.raf) {
      cancelAnimationFrame(autoScrollState.raf);
      autoScrollState.raf = null;
      autoScrollState.lastTime = null;
      autoScrollState.targetSong = null;
    }
    // reset play button for the previously targeted song only
    try {
      const prevSong = autoScrollState.targetSong;
      if (prevSong) {
        const btn = prevSong.querySelector('.song-play-btn');
        if (btn) {
          btn.setAttribute('aria-pressed', 'false');
          btn.textContent = '▶';
        }
      } else {
        // fallback: reset any remaining pressed buttons
        document.querySelectorAll('.song-play-btn[aria-pressed="true"]').forEach((btn) => {
          btn.setAttribute('aria-pressed', 'false');
          btn.textContent = '▶';
        });
      }
    } catch (err) {
      console.warn('Error resetting play buttons:', err);
    }
  }

  // listen for autoscroll events (separate from audio playback)
  refs.songsHost?.addEventListener('song:autoscroll', (e) => {
    const { id, bpm } = e.detail || {};
    startAutoScroll({ id, bpm });
  });
  refs.songsHost?.addEventListener('song:autoscroll-stop', (e) => {
    stopAutoScroll();
  });

  // listen for audio-only play/stop events
  refs.songsHost?.addEventListener('song:audio-play', (e) => {
    const { id, bpm } = e.detail || {};
    startAudioPlayback({ id, bpm });
  });
  refs.songsHost?.addEventListener('song:audio-stop', (e) => {
    stopAudioPlayback();
  });

  let _currentSynth = null;
  let _midiAccess = null;
  let _midiOutput = null;
  let _midiTimers = [];
  async function startAudioPlayback({ id, bpm }) {
    try {
      const songEl = document.getElementById(id)?.closest('.song');
      if (!songEl) return;
      const tabText = (songEl.dataset.tab || '') || songEl.querySelector('.tablature')?.innerText || '';
      if (!tabText || !tabText.trim()) return;
      const parsed = parseTab(tabText);
      if (!parsed || !parsed.events || !parsed.events.length) {
        console.warn('No events parsed for audio');
        return;
      }
      const tempo = Number(bpm) || Number(localStorage.getItem('songbook-bpm')) || 90;
      // Prefer Web MIDI output if available and permitted by user/browser
      const useMidi = typeof navigator.requestMIDIAccess === 'function';
      // If Web MIDI is available, attempt MIDI playback first
      if (useMidi) {
        try {
          await initMidiAccess();
          if (_midiOutput) {
            playViaMidi(parsed, tempo);
            return;
          }
        } catch (err) {
          console.warn('MIDI init failed, falling back to synth:', err);
        }
      }

      // prepare synth (Tone.js fallback)
      if (window.Tone && typeof window.Tone !== 'undefined') {
        const Tone = window.Tone;
        try {
          if (typeof Tone.start === 'function') {
            // ensure audio context is resumed from a user gesture
            await Tone.start();
          }
        } catch (err) {
          // non-fatal: continue and try to schedule anyway
          console.warn('Tone.start() failed or was blocked:', err);
        }

        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.bpm.value = tempo;
        const synth = new Tone.PolySynth(Tone.Synth).toDestination();
        _currentSynth = synth;
        // schedule events
        // clear transport and reset position before scheduling
        try { Tone.Transport.cancel(); } catch (e) { /* ignore */ }
        try { Tone.Transport.seconds = 0; } catch (e) { /* ignore */ }

        // schedule events on the Transport using midi->note conversion
        parsed.events.forEach(evt => {
          const timeSec = (evt.timeBeats * 60) / tempo; // seconds from start
          const durSec = (evt.durationBeats * 60) / tempo;
          const when = `${timeSec}s`;
          const dur = `${durSec}s`;
          Tone.Transport.schedule((time) => {
            // convert midi numbers to note names (e.g., 'A4') for clarity
            const notes = evt.notes.map(n => {
              try { return Tone.Frequency(Number(n), 'midi').toNote(); } catch (err) { return n; }
            });
            synth.triggerAttackRelease(notes, dur, time);
          }, when);
        });
        // start transport slightly in the future to allow scheduling to settle
        Tone.Transport.start('+0.05');
      } else {
        console.warn('Tone.js not available');
      }
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }

  // Initialize Web MIDI access and pick a default output if available
  async function initMidiAccess() {
    if (_midiAccess && _midiOutput) return;
    try {
      _midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      const outputs = Array.from(_midiAccess.outputs.values());
      if (outputs && outputs.length) {
        // pick the first available output
        _midiOutput = outputs[0];
        console.info('Selected MIDI output:', _midiOutput.name || _midiOutput.id);
      } else {
        _midiOutput = null;
      }
    } catch (err) {
      _midiAccess = null;
      _midiOutput = null;
      throw err;
    }
  }

  // Play parsed tab events via MIDI output
  function playViaMidi(parsed, tempo) {
    if (!parsed || !parsed.events || !parsed.events.length || !_midiOutput) return;
    // clear previous timers
    _midiTimers.forEach((t) => clearTimeout(t));
    _midiTimers = [];
    const start = performance.now();
    parsed.events.forEach((evt) => {
      const timeSec = (evt.timeBeats * 60) / tempo;
      const durSec = (evt.durationBeats * 60) / tempo;
      const whenMs = Math.max(0, Math.round((timeSec * 1000)));
      const offMs = Math.max(0, Math.round((timeSec + durSec) * 1000));
      // schedule Note On
      const onTimer = setTimeout(() => {
        try {
          evt.notes.forEach((note) => {
            const n = Number(note) & 0x7f;
            // Note On on channel 0, velocity 100
            _midiOutput.send([0x90, n, 100]);
          });
        } catch (err) { console.warn('MIDI send on error', err); }
      }, whenMs);
      _midiTimers.push(onTimer);
      // schedule Note Off
      const offTimer = setTimeout(() => {
        try {
          evt.notes.forEach((note) => {
            const n = Number(note) & 0x7f;
            // Note Off on channel 0
            _midiOutput.send([0x80, n, 64]);
          });
        } catch (err) { console.warn('MIDI send off error', err); }
      }, offMs);
      _midiTimers.push(offTimer);
    });
  }

  function stopAudioPlayback() {
    try {
      if (window.Tone && typeof window.Tone !== 'undefined') {
        window.Tone.Transport.stop();
        window.Tone.Transport.cancel();
      }
      if (_currentSynth) {
        _currentSynth.dispose?.();
        _currentSynth = null;
      }
    } catch (err) {
      console.warn('Error stopping audio:', err);
    }
    // Reset any audio play buttons to not-playing state
    try {
      document.querySelectorAll('.song-audio-btn[aria-pressed="true"]').forEach((btn) => {
        btn.setAttribute('aria-pressed', 'false');
        btn.textContent = '♪';
      });
    } catch (e) { /* ignore */ }
  }

  function initToolbarActions() {
    const { saveBtn, clearBtn } = refs;
    saveBtn?.addEventListener('click', handleSave);
    clearBtn?.addEventListener('click', handleClear);
    const lockBtn = $('#lockTocBtn');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        const pressed = lockBtn.getAttribute('aria-pressed') === 'true';
        const next = !pressed;
        lockBtn.setAttribute('aria-pressed', String(next));
        document.documentElement.dataset.tocLocked = String(next);
        lockBtn.classList.toggle('locked', next);
        const label = lockBtn.querySelector('.icon-label');
        if (label) label.textContent = next ? 'Odblokuj' : 'Zablokuj';
      });
    }
    const clearCacheBtn = $('#clearCacheBtn');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', async () => {
        if (!window.confirm('Wyczyścić cache aplikacji i zarejestrowany service worker? To spowoduje pobranie najnowszych plików (połączenie internetowe wymagane).')) return;
        try {
          // delete all caches that start with 'spiewnik-cache'
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter(k => k.startsWith('spiewnik-cache')).map(k => caches.delete(k)));
          }
          // unregister service workers
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
          }
          // ensure saved defaults version is set so app won't auto-clear data next load
          try {
            setSavedDefaultsVersion(CURRENT_DEFAULTS_VERSION);
          } catch (err) {
            console.warn('Nie udało się zapisać wersji domyślnych danych:', err);
          }
          window.alert('Cache i service worker zostały wyczyszczone. Odśwież stronę aby pobrać nowe pliki.');
        } catch (error) {
          console.error('Błąd podczas czyszczenia cache:', error);
          window.alert('Wystąpił błąd podczas czyszczenia cache. Sprawdź konsolę.');
        }
      });
    }
  }

  function handleSave() {
    window.alert('Po kliknięciu OK zapiszemy śpiewnik w pamięci przeglądarki i pobierzemy plik JSON z aktualną wersją.');
    try {
      const songs = serializeSongsWithFont(refs.songsHost);
      const order = collectOrder(refs.tocList);
      saveSongs(songs);
      setNotationPreference('pl');
      saveOrder(order);
      downloadSongsJson({ songs, order });
      window.alert('✅ Zapisano zmiany i pobrano plik JSON.');
    } catch (error) {
      console.error('Błąd zapisu danych:', error);
      window.alert('❌ Nie udało się zapisać zmian.');
    }
  }

  function handleClear() {
    if (!window.confirm('Usunąć wszystkie lokalne zmiany i przywrócić oryginalny śpiewnik?')) return;
    clearSavedSongs();
    window.location.reload();
  }

  function initDeletionHandler() {
    refs.tocList?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains('delete-song-btn')) return;

      // prevent deletion when locked
      if (document.documentElement.dataset.tocLocked === 'true') {
        window.alert('Spis treści jest zablokowany — odblokuj, aby móc usuwać pozycje.');
        return;
      }

      const li = target.closest('li[data-target]');
      if (!li) return;

      const songTitle = (li.querySelector('.toc-link')?.textContent || 'tej piosenki').trim();
      if (!window.confirm(`Czy na pewno chcesz usunąć piosenkę "${songTitle}"?`)) return;

      const songElement = document.getElementById(li.dataset.target)?.closest('.song');
      songElement?.remove();
      li.remove();
      renumberSongs(refs.tocList, refs.songsHost);
      saveOrder(collectOrder(refs.tocList));
    });
  }

  function initHamburgerMenu(button, menu) {
    if (!button || !menu) return;

    button.addEventListener('click', () => {
      button.classList.toggle('active');
      menu.classList.toggle('active');
    });

    menu.addEventListener('click', (event) => {
      if (event.target instanceof HTMLButtonElement) {
        button.classList.remove('active');
        menu.classList.remove('active');
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        button.classList.remove('active');
        menu.classList.remove('active');
      }
    });
  }

  function initBackToTop() {
    const { backToTop, tocList, toolbar } = refs;
    if (!backToTop) return;

    const tocSection = $('.toc') || tocList;
    backToTop.type = 'button';
    backToTop.setAttribute('aria-label', 'Powrót do spisu treści');

    const goToToc = () => {
      if (tocSection) {
        const toolbarOffset = (toolbar?.offsetHeight || 0) + 12;
        const top = tocSection.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(top - toolbarOffset, 0), behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    backToTop.addEventListener('click', goToToc);

    const toggle = () => {
      backToTop.style.display = window.scrollY > 160 ? 'flex' : 'none';
    };

    toggle();
    window.addEventListener('scroll', toggle, { passive: true });
  }

  function initImportButton() {
    const { importBtn, importInput } = refs;
    if (!importBtn || !importInput) return;

    importBtn.addEventListener('click', () => {
      window.alert('Wybierz plik JSON zapisany wcześniej przyciskiem "Zapisz zmiany". Po wczytaniu pliku utwory i kolejność zostaną zastąpione danymi z pliku.');
      importInput.value = '';
      importInput.click();
    });

    importInput.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (!file) return;
      importSongsFromFile(file);
      importInput.value = '';
    });
  }

  function setupPrintThemeGuard(controller) {
    if (!controller) return;

    const getCurrentTheme = () => (document.body.classList.contains('theme-dark') ? 'dark' : 'light');
    let previousTheme = null;

    const forceLight = () => {
      if (previousTheme) return;
      const current = getCurrentTheme();
      if (current === 'dark') {
        previousTheme = current;
        controller.applyTheme('light', false);
      }
    };

    const restoreTheme = () => {
      if (!previousTheme) return;
      controller.applyTheme(previousTheme, false);
      previousTheme = null;
    };

    window.addEventListener('beforeprint', forceLight);
    window.addEventListener('afterprint', restoreTheme);

    if (typeof window.matchMedia === 'function') {
      const media = window.matchMedia('print');
      const handleChange = (event) => {
        if (event.matches) {
          forceLight();
        } else {
          restoreTheme();
        }
      };

      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', handleChange);
      } else if (typeof media.addListener === 'function') {
        media.addListener(handleChange);
      }
    }
  }

  function initHelpDialog() {
    const { helpBtn, helpModal, helpCloseBtn } = refs;
    if (!helpBtn || !helpModal) return;

    const closeHelp = () => {
      helpModal.hidden = true;
      if (document.activeElement === helpModal || helpModal.contains(document.activeElement)) {
        helpBtn.focus();
      }
    };

    const openHelp = () => {
      helpModal.hidden = false;
      const body = helpModal.querySelector('.modal-body');
      if (body) body.scrollTop = 0;
      (helpCloseBtn || helpModal.querySelector('button'))?.focus();
    };

    helpBtn.addEventListener('click', () => {
      openHelp();
    });

    const helpLockBtn = $('#helpLockBtn');
    if (helpLockBtn) {
      helpLockBtn.addEventListener('click', () => {
        const current = document.documentElement.dataset.tocLocked === 'true';
        const next = !current;
        document.documentElement.dataset.tocLocked = String(next);
        // sync toolbar button if present
        const toolbarLock = $('#lockTocBtn');
        if (toolbarLock) {
          toolbarLock.setAttribute('aria-pressed', String(next));
          toolbarLock.classList.toggle('locked', next);
          const tbLabel = toolbarLock.querySelector('.icon-label');
          if (tbLabel) tbLabel.textContent = next ? 'Odblokuj' : 'Zablokuj';
        }
        // give user feedback
        helpLockBtn.classList.toggle('locked', next);
        const label = helpLockBtn.querySelector('.icon-label');
        if (label) label.textContent = next ? 'Odblokuj' : 'Zablokuj';
      });
    }

    helpCloseBtn?.addEventListener('click', () => {
      closeHelp();
      helpBtn.focus();
    });

    helpModal.addEventListener('click', (event) => {
      if (event.target === helpModal) {
        closeHelp();
        helpBtn.focus();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (helpModal.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHelp();
        helpBtn.focus();
      }
    });
  }

  function importSongsFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : new TextDecoder('utf-8').decode(reader.result);
        const raw = JSON.parse(text);
        const payload = normalizeImportedPayload(raw);
        if (!payload.songs.length) {
          throw new Error('Brak utworów w danych.');
        }
        applyImportedPayload(payload);
        window.alert('✅ Wczytano śpiewnik z pliku JSON. Dane zostały zastąpione zawartością pliku.');
      } catch (error) {
        console.error('Błąd importu JSON:', error);
        window.alert('❌ Nie udało się wczytać pliku JSON. Upewnij się, że pochodzi z tej aplikacji.');
      }
    };
    reader.onerror = () => {
      console.error('Błąd odczytu pliku JSON:', reader.error);
      window.alert('❌ Nie udało się odczytać pliku. Spróbuj ponownie.');
    };
    reader.readAsText(file, 'utf-8');
  }

  function normalizeImportedPayload(raw) {
    let songs = [];
    let order = [];
    let profile = null;

    if (Array.isArray(raw)) {
      songs = raw;
    } else if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.songs)) songs = raw.songs;
      if (Array.isArray(raw.order)) order = raw.order;
      if (typeof raw.profile === 'string') profile = raw.profile;
    }

    const normalizedSongs = songs.map((song, index) => {
      const safeTitle = typeof song?.title === 'string' && song.title.trim() ? song.title.trim() : `Utwór ${index + 1}`;
      const safeId = typeof song?.id === 'string' && song.id.trim() ? song.id.trim() : slugFromTitle(safeTitle, index);
      return {
        id: safeId,
        title: safeTitle,
        lyrics: typeof song?.lyrics === 'string' ? song.lyrics : '',
        chords: typeof song?.chords === 'string' ? song.chords : '',
        number: index + 1,
        notes: typeof song?.notes === 'string' ? song.notes : '',
        tab: typeof song?.tab === 'string' ? song.tab : '',
        font: typeof song?.font === 'string' ? song.font : (typeof song?.fontSize === 'string' ? song.fontSize : ''),
        fontChords: typeof song?.fontChords === 'string' ? song.fontChords : '',
        fontLyrics: typeof song?.fontLyrics === 'string' ? song.fontLyrics : '',
      };
    });

    return { songs: normalizedSongs, order: order.filter(Boolean), profile };
  }

  function applyImportedPayload(payload) {
    if (payload.profile) {
      currentProfile = setProfile(payload.profile, refs.profileSelect);
    }

    renderSongs(context, payload.songs, songFeatureOptions());

    if (payload.order.length) {
      applyOrder(refs.tocList, refs.songsHost, payload.order);
    }

    refreshOrderingState();
    saveSongs(payload.songs);
    saveOrder(collectOrder(refs.tocList));
    setNotationPreference('pl');
  }

  function slugFromTitle(title, index) {
    return title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/(^-|-$)/g, '')
      || `imported-${index + 1}`;
  }

  function handleProfileChange(profile) {
    currentProfile = profile;
    const snapshot = serializeSongs(refs.songsHost);
    if (!isVocalistProfile()) {
      const needsChords = snapshot.some((song) => !song.chords && song.id);
      if (needsChords) {
        loadDefaultSongs({ includeChords: true })
          .then((defaults) => {
            const chordMap = new Map(defaults.map((song) => [song.id, song.chords]));
            snapshot.forEach((song) => {
              if (!song.chords && chordMap.has(song.id)) {
                song.chords = chordMap.get(song.id);
              }
            });
          })
          .catch((error) => {
            console.warn('Nie udało się uzupełnić akordów:', error);
          })
          .finally(() => {
            renderSongs(context, snapshot, songFeatureOptions({ normalizeChords: false }));
            refreshOrderingState();
          });
        return;
      }
    }

    renderSongs(context, snapshot, songFeatureOptions({ normalizeChords: false }));
    refreshOrderingState();
  }

  function isVocalistProfile() {
    return currentProfile === PROFILE_VOCALIST;
  }

  function songFeatureOptions(overrides = {}) {
    const vocalist = isVocalistProfile();
    const base = {
      normalizeChords: vocalist ? false : true,
      showChords: !vocalist,
      enableTranspose: !vocalist,
    };
    return { ...base, ...overrides };
  }

  function refreshOrderingState() {
    renumberSongs(refs.tocList, refs.songsHost);
    saveOrder(collectOrder(refs.tocList));
  }

  function downloadSongsJson(payload) {
    try {
      const data = {
        profile: currentProfile,
        generatedAt: new Date().toISOString(),
        songs: payload.songs,
        order: payload.order,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      link.download = `spiewnik-${currentProfile}-${timestamp}.json`;
      link.href = URL.createObjectURL(blob);
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      link.remove();
    } catch (error) {
      console.warn('Błąd pobierania JSON:', error);
    }
  }

    // Debug helpers exposed for quick testing from the console
    // Usage: window.debugParseTab(tabText) -> returns parsed object
    //        window.testPlayTab(tabText, bpm) -> attempts MIDI playback or Tone.js fallback
    window.debugParseTab = function (tabText) {
      try {
        const parsed = parseTab(tabText || '');
        console.log('[debugParseTab] parsed:', parsed);
        return parsed;
      } catch (err) {
        console.error('[debugParseTab] parse error', err);
        return null;
      }
    };

    window.testPlayTab = async function (tabText, bpm = 90) {
      try {
        const parsed = parseTab(tabText || '');
        console.log('[testPlayTab] events:', parsed.events?.slice(0, 50) || []);
        if (!parsed || !parsed.events || !parsed.events.length) {
          console.warn('[testPlayTab] No events parsed');
          return parsed;
        }
        const tempo = Number(bpm) || 90;
        // Try MIDI first
        try {
          if (typeof navigator.requestMIDIAccess === 'function') {
            await initMidiAccess();
            if (_midiOutput) {
              playViaMidi(parsed, tempo);
              console.info('[testPlayTab] Playing via Web MIDI on', _midiOutput.name || _midiOutput.id);
              return parsed;
            }
          }
        } catch (err) {
          console.warn('[testPlayTab] MIDI playback failed, falling back to Tone:', err);
        }

        if (window.Tone) {
          try {
            await Tone.start();
          } catch (e) { /* ignore */ }
          try { Tone.Transport.stop(); } catch (e) { /* ignore */ }
          try { Tone.Transport.cancel(); } catch (e) { /* ignore */ }
          Tone.Transport.bpm.value = tempo;
          const synth = new Tone.PolySynth(Tone.Synth).toDestination();
          _currentSynth = synth;
          parsed.events.forEach(evt => {
            const timeSec = (evt.timeBeats * 60) / tempo;
            const durSec = (evt.durationBeats * 60) / tempo;
            const when = `${timeSec}s`;
            const dur = `${durSec}s`;
            Tone.Transport.schedule((time) => {
              const notes = evt.notes.map(n => {
                try { return Tone.Frequency(Number(n), 'midi').toNote(); } catch (err) { return n; }
              });
              synth.triggerAttackRelease(notes, dur, time);
            }, when);
          });
          Tone.Transport.start('+0.05');
          console.info('[testPlayTab] Playing via Tone.js (synth)');
        } else {
          console.warn('[testPlayTab] Tone.js not available in page');
        }
        return parsed;
      } catch (err) {
        console.error('[testPlayTab] error', err);
        return null;
      }
    };
});
