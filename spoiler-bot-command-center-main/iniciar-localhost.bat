@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js e tente novamente.
  pause
  exit /b 1
)

if not exist ".env" (
  echo Arquivo .env nao encontrado. Copie .env.example para .env e configure as chaves do Supabase.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo Instalando dependencias...
  call npm install --no-package-lock
  if errorlevel 1 (
    echo Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)

start "Spoiler Bot - servidor local" cmd /k "cd /d ""%~dp0"" && npm run dev -- --host 127.0.0.1 --port 3000"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
