(function(){
  // Simple fallback loader: reads a JSON file chosen in the hidden input
  // and stores it in localStorage under the key used by the app so the
  // main module can pick it up on load.
  try {
    const STORAGE_KEY = 'songbook';
    const input = document.getElementById('importJsonInput');
    if (!input) return;

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = typeof reader.result === 'string' ? reader.result : new TextDecoder('utf-8').decode(reader.result);
          const parsed = JSON.parse(text);
          // Normalize payload shape: if object with songs, wrap accordingly
          let songs = [];
          if (Array.isArray(parsed)) songs = parsed;
          else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.songs)) songs = parsed.songs;
          else {
            alert('Plik JSON nie zawiera oczekiwanej struktury (tablica utworów lub obiekt { songs: [...] }).');
            return;
          }

          // Save directly in localStorage so app will pick it up on next load
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
            // Also remove any stored TOC order so the import order is used
            try { localStorage.removeItem('toc-order'); } catch(e){}
            alert('Wczytano plik JSON. Strona zostanie odświeżona.');
            window.location.reload();
          } catch (err) {
            console.error('Błąd zapisu do localStorage:', err);
            alert('Nie udało się zapisać danych lokalnie. Sprawdź miejsce na dysku i ustawienia przeglądarki.');
          }
        } catch (err) {
          console.error('Błąd parsowania JSON:', err);
          alert('Niepoprawny plik JSON. Sprawdź zawartość pliku.');
        }
      };
      reader.onerror = () => {
        console.error('Reader error', reader.error);
        alert('Błąd odczytu pliku. Spróbuj ponownie.');
      };
      reader.readAsText(file, 'utf-8');
    });

    // Make the label accessible via keyboard (Enter / Space)
    const label = document.getElementById('importJsonBtn');
    if (label) {
      label.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.click();
        }
      });
    }
  } catch (err) {
    console.warn('Import fallback init error:', err);
  }
})();
