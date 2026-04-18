@echo off
setlocal

call "%~dp0scripts\ensure-node.cmd" "%~dp0node_modules\.bin\convex.cmd" dev
