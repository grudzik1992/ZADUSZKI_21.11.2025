(function(){
  // Very small fallback renderer: fetch dane.json (root) or data/dane.json
  // or read localStorage.songbook and render a minimal TOC + songs so user
  // can see chords and lyrics even if main app modules fail.
  function el(sel, attrs) {
    const d = document.createElement('div');
    if (attrs && attrs.className) d.className = attrs.className;
    if (attrs && attrs.html) d.innerHTML = attrs.html;
    return d;
  }

  function createSongHtml(song, index) {
    const id = song.id || `song-${index+1}`;
    const title = song.title || `Utwór ${index+1}`;
    const chords = (song.chords || '').replace(/\n/g, '<br>');
    const lyrics = (song.lyrics || '').replace(/\n/g, '<br>');
    const wrapper = document.createElement('div');
    wrapper.className = 'song fallback-song';
    wrapper.id = `fallback-${id}`;
    wrapper.innerHTML = `
      <div class="song-content">
        <h2 id="${id}">${index+1}. ${title}</h2>
        <div class="song-fields">
          <div class="song-field chords-field"><div class="field-label">Akordy</div><div class="chords">${chords}</div></div>
          <div class="song-field lyrics-field"><div class="field-label">Tekst</div><div class="lyrics">${lyrics}</div></div>
        </div>
      </div>
    `;
    return wrapper;
  }

  function createTocEntry(song, index) {
    const li = document.createElement('li');
    li.dataset.target = song.id || `song-${index+1}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toc-link';
    btn.dataset.target = li.dataset.target;
    btn.textContent = `${index+1}. ${song.title || 'Bez tytułu'}`;
    btn.addEventListener('click', () => {
      const heading = document.getElementById(li.dataset.target) || document.getElementById('fallback-' + li.dataset.target);
      if (heading) {
        const top = heading.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
    li.appendChild(btn);
    return li;
  }

  async function fetchJsonTry(paths) {
    for (const p of paths) {
      try {
        const r = await fetch(p, { cache: 'no-store' });
        if (r.ok) return r.json();
      } catch (e) {}
    }
    return null;
  }

  async function run() {
    try {
      const songsHost = document.getElementById('songsContainer');
      const tocList = document.getElementById('tocList');
      if (!songsHost || !tocList) return;

      // if app already replaced loading message with songs, skip
      if (songsHost.querySelector('.song')) return;

      // Try localStorage first
      let raw = null;
      try {
        const fromStorage = localStorage.getItem('songbook');
        if (fromStorage) {
          const parsed = JSON.parse(fromStorage);
          if (Array.isArray(parsed) && parsed.length) raw = { songs: parsed };
          else if (parsed && Array.isArray(parsed.songs) && parsed.songs.length) raw = parsed;
        }
      } catch (e) {}

      if (!raw) {
        // Try typical locations
        raw = await fetchJsonTry(['dane.json','data/dane.json','data/spiewnik-instrumentalist-2025-11-03-17-36-01.json']);
      }

      const songs = (raw && Array.isArray(raw.songs) ? raw.songs : (Array.isArray(raw) ? raw : []));
      if (!songs || !songs.length) return;

      // clear loading message
      songsHost.innerHTML = '';
      tocList.innerHTML = '';

      songs.forEach((song, i) => {
        const li = createTocEntry(song, i);
        tocList.appendChild(li);
        const songEl = createSongHtml(song, i);
        songsHost.appendChild(songEl);
      });

      console.log('[fallback] rendered', songs.length, 'songs');
    } catch (err) {
      console.warn('[fallback] error', err);
    }
  }

  // Run as soon as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
