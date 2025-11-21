@echo off
cd /d "%~dp0"

echo ================================
echo 🔄 Aktualizacja repozytorium GitHub
echo ================================

:: Dodanie wszystkich zmian
git add -A

:: Utworzenie commita z datą i godziną
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do (
    set d=%%c-%%b-%%a
)
for /f "tokens=1 delims= " %%a in ("%time%") do set t=%%a
git commit -m "Auto-commit: %d% %t%"

:: Wypchnięcie na GitHub
git push origin main

echo ✅ Repozytorium zaktualizowane!
pause
