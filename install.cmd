@echo off
setlocal

if exist "%ProgramFiles%\nodejs\npm.cmd" (
  call "%~dp0scripts\ensure-node.cmd" "%ProgramFiles%\nodejs\npm.cmd" install
  exit /b %errorlevel%
)

if exist "%LocalAppData%\Programs\nodejs\npm.cmd" (
  call "%~dp0scripts\ensure-node.cmd" "%LocalAppData%\Programs\nodejs\npm.cmd" install
  exit /b %errorlevel%
)

echo npm.cmd was not found on this machine.
echo Install Node.js LTS once, then reopen VS Code and try again.
exit /b 1
