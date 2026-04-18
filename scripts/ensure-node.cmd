@echo off
setlocal

set "NODE_HOME="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_HOME=%ProgramFiles%\nodejs"
if not defined NODE_HOME if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_HOME=%LocalAppData%\Programs\nodejs"

if defined NODE_HOME (
  set "PATH=%NODE_HOME%;%PATH%"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js was not found on this machine.
    echo Install Node.js LTS once, then reopen VS Code and try again.
    exit /b 1
  )
)

if "%~1"=="" (
  echo No command was provided.
  exit /b 1
)

set "RUNNER=%~1"
shift

call "%RUNNER%" %1 %2 %3 %4 %5 %6 %7 %8 %9
exit /b %errorlevel%
