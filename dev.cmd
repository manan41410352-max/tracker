@echo off
setlocal

call "%~dp0scripts\ensure-node.cmd" "powershell.exe" -ExecutionPolicy Bypass -File "%~dp0scripts\start-next-dev.ps1"
