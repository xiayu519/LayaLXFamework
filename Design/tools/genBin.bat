@echo off
setlocal
npm --prefix "%~dp0..\..\LayaProject" run config:generate
exit /b %errorlevel%
