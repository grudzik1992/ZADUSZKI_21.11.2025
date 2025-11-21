Instrukcja: dodawanie lokalnych zasobów AlphaTab i czcionek

Dlaczego to potrzebne
- Projekt próbuje ładować AlphaTab i czcionki muzyczne lokalnie (szybciej i bez problemów CORS).
- Loader w `js/modules/alphaTab.js` najpierw szuka pliku UMD: `/vendor/alphatab/alphaTab.min.js`.
- Czcionki muzyczne (Bravura) powinny być umieszczone w `/vendor/alphatab/font/` z nazwami:
  - `Bravura.woff2`
  - `Bravura.woff`
  - `Bravura.otf`
  AlphaTab będzie próbował użyć pierwszego dostępnego formatu.

Krok po kroku (Windows PowerShell)
1) Utwórz katalogi (jeśli jeszcze nie ma):

```powershell
md .\vendor\alphatab\font -Force
```

2) Pobierz plik `alphaTab.min.js` (UMD build) i umieść go w `vendor/alphatab/`.
- Najszybsze rozwiązanie: pobierz plik UMD z zaufanego źródła (np. release lub dystrybucji autora).
- Jeśli masz plik lokalnie, skopiuj go do `vendor/alphatab/alphaTab.min.js`.

3) Pobierz czcionki Bravura i zapisz je w `vendor/alphatab/font/` z podanymi nazwami.
- Źródła możliwe do sprawdzenia:
  - Oficjalne repo Bravura (GitHub) — pobierz release lub pliki z folderu `redist`.
  - Paket dystrybucyjny dostarczany z narzędziami muzycznymi (np. MuseScore lub paczki SMuFL).

Przykładowe polecenie PowerShell (może zwrócić 404 jeśli ścieżka jest inna):

```powershell
# przykładowy URL — jeśli nie istnieje, pobierz pliki ręcznie
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/Bravura.woff2" -OutFile ".\vendor\alphatab\font\Bravura.woff2"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/Bravura.woff" -OutFile ".\vendor\alphatab\font\Bravura.woff"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/Bravura.otf" -OutFile ".\vendor\alphatab\font\Bravura.otf"
```

Jeżeli powyższe URL zwracają 404, upewnij się, że pobierasz pliki z odpowiedniej ścieżki na GitHub lub z release'u projektu Bravura.

4) Sprawdź, że pliki są dostępne lokalnie:

```powershell
Test-Path .\vendor\alphatab\font\Bravura.woff2
Test-Path .\vendor\alphatab\font\Bravura.woff
Test-Path .\vendor\alphatab\font\Bravura.otf
```

5) Odinstaluj service workera i otwórz stronę ponownie (w przeglądarce):
- DevTools → Console i wklej:

```javascript
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).then(()=>console.log('SW unregistered'));
```

- W DevTools → Network włącz „Disable cache”, potem Ctrl+F5.

6) Importuj plik `.gp` i obserwuj konsolę/zakładkę Network:
- Szukaj żądań do `/vendor/alphatab/alphaTab.min.js` oraz plików fontów.
- Jeśli wszystko jest poprawne, AlphaTab powinien załadować czcionkę i rozpocząć render.

Jeśli nadal występują błędy
- Skopiuj tu pełne komunikaty z DevTools → Console oraz statusy/response headers z żądań do `alphaTab.min.js` i plików fontów.
- Mogę dodać gotowy `alphaTab.min.js` do repo, jeśli udostępnisz link do poprawnego pliku, lub wstawić instrukcję, skąd pobrać.

Uwagi dotyczące licencji
- Bravura ma swoją licencję (autor: Steinberg). Upewnij się, że masz prawo do dystrybucji czcionki w swoim projekcie, jeśli planujesz udostępniać repo publicznie.

---
Plik wygenerowany automatycznie przez narzędzie developerskie projektu. Jeśli chcesz, mogę dodać skrypt PowerShell, który próbuje pobrać pliki z kilku proponowanych URL-i i raportuje statusy — daj znać.