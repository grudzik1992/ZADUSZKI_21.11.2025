@echo off
cd /d "%~dp0"
echo ================================
echo 🔧 Utwórz nowe repozytorium na GitHub (wymaga `gh` CLI)
echo ================================
if "%1"=="" (
  echo Użycie: create_new_repo.bat <nazwa-repo>
  echo Przykład: create_new_repo.bat Zaduszki_kopia
  pause
  exit /b 1
)
set REPO_NAME=%1

:: Utwórz repo (public/private można ustawić opcjonalnie)
echo Tworzenie repozytorium %REPO_NAME%... (może być wymagane zalogowanie gh)
gh repo create %REPO_NAME% --public --source=. --remote=origin --push
if ERRORLEVEL 1 (
  echo Błąd: nie udało się utworzyć repo (sprawdź, czy masz zainstalowane gh i czy jesteś zalogowany).
  pause
  exit /b 1
)
echo ✅ Repozytorium utworzone i wypchnięte jako origin/%REPO_NAME% 
pause
