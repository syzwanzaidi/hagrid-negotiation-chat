@echo off
setlocal EnableExtensions
title Mr Hagrid - launcher
cd /d "%~dp0"

rem One click: Ollama + model + n8n + Mr Hagrid's office in your browser.
set "MODEL=qwen3:4b-instruct"
set "N8N=http://localhost:5678"
set "OLLAMA=http://127.0.0.1:11434"
set "OLLAMA_DIR=%LOCALAPPDATA%\Programs\Ollama"
rem Pin n8n to localhost (an old ngrok WEBHOOK_URL may still be set in this Windows session).
set "WEBHOOK_URL=%N8N%"
set "N8N_EDITOR_BASE_URL=%N8N%"

echo.
echo   Mr Hagrid - negotiation simulator
echo   ---------------------------------

where curl >nul 2>&1 || (echo   curl.exe was not found. It ships with Windows 10/11; please update Windows. & goto :fail)

rem 1) Ollama ---------------------------------------------------------------
curl -s -m 2 "%OLLAMA%/api/version" >nul 2>&1
if not errorlevel 1 (
  echo   [1/4] Ollama is running.
) else (
  echo   [1/4] Starting Ollama...
  if exist "%OLLAMA_DIR%\ollama app.exe" (
    start "" "%OLLAMA_DIR%\ollama app.exe"
  ) else if exist "%OLLAMA_DIR%\ollama.exe" (
    start "Ollama" /min "%OLLAMA_DIR%\ollama.exe" serve
  ) else (
    echo         Ollama is not installed. Install it with:  winget install Ollama.Ollama
    goto :fail
  )
  call :wait_get "%OLLAMA%/api/version" 40 || (echo         Ollama did not start. Open the Ollama app manually and run this again. & goto :fail)
  echo         Ollama is up.
)

rem 2) Model ----------------------------------------------------------------
set "OLLAMA_EXE=ollama"
if exist "%OLLAMA_DIR%\ollama.exe" set "OLLAMA_EXE=%OLLAMA_DIR%\ollama.exe"
"%OLLAMA_EXE%" list 2>nul | findstr /i /c:"%MODEL%" >nul
if errorlevel 1 (
  echo   [2/4] Downloading %MODEL% ^(one time, about 2.5 GB^)...
  "%OLLAMA_EXE%" pull %MODEL% || (echo         Download failed. Check your internet connection. & goto :fail)
)
echo   [2/4] Model %MODEL% is ready.

rem 3) n8n ------------------------------------------------------------------
curl -s -m 2 "%N8N%/healthz" >nul 2>&1
if not errorlevel 1 (
  echo   [3/4] n8n is running.
) else (
  where n8n >nul 2>&1 || (echo         n8n is not installed. Install it with:  npm install -g n8n & goto :fail)
  echo   [3/4] Starting n8n in its own window. Keep that window open while you practise.
  start "n8n - Mr Hagrid" cmd /k "set WEBHOOK_URL=%N8N%&& set N8N_EDITOR_BASE_URL=%N8N%&& n8n start"
)
echo         Waiting for the Mr Hagrid workflow to come online...
call :wait_post "%N8N%/webhook/hagrid-forget" 120 || (
  echo         The workflow did not answer. In n8n, make sure "Meeting with Mr Hagrid" is published,
  echo         or deploy it with:  bash build/deploy.sh
  goto :fail
)
echo         Workflow is online.

rem 4) Warm up the model in the background so the first reply is quick, then open the office.
echo   [4/4] Opening Mr Hagrid's office...
start "" /b curl -s -o nul "%OLLAMA%/api/generate" -d "{\"model\":\"%MODEL%\",\"prompt\":\"hi\",\"stream\":false,\"keep_alive\":\"30m\",\"options\":{\"num_ctx\":4096,\"num_predict\":1}}"
start "" "%~dp0hagrid-negotiation.html"
echo.
echo   Ready. Good luck in there.
ping -n 4 127.0.0.1 >nul
exit /b 0

:wait_get
for /l %%i in (1,1,%~2) do (
  curl -s -m 2 "%~1" >nul 2>&1 && exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 1

:wait_post
for /l %%i in (1,1,%~2) do (
  curl -s -f -m 3 -X POST -H "Content-Type: application/json" -d "{\"sessionId\":\"launcher-ping\"}" "%~1" >nul 2>&1 && exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 1

:fail
echo.
echo   Something went wrong (see above). Press any key to close.
pause >nul
exit /b 1
