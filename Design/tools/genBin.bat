@echo off
setlocal
npm --prefix "%~dp0..\..\LayaProject" run tables:generate
exit /b %errorlevel%
