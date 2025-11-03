@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_EXE=python"
if exist ".venv\Scripts\python.exe" (
  set "PYTHON_EXE=.venv\Scripts\python.exe"
)

echo ===============================
echo Uruchamianie lokalnego serwera
echo ===============================
echo Adres: http://localhost:8000
echo Zatrzymanie: CTRL+C

echo.
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 1; Start-Process 'http://localhost:8000/'"
"%PYTHON_EXE%" -m http.server 8000 --directory "%cd%"

endlocal
