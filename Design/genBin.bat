@echo off
setlocal

call npm --prefix "%~dp0..\LayaProject" run tables:generate
set "LX_TABLES_EXIT_CODE=%errorlevel%"

if not "%LX_TABLES_EXIT_CODE%"=="0" echo Luban table generation failed with exit code %LX_TABLES_EXIT_CODE%.
if /I not "%~1"=="--no-pause" pause
exit /b %LX_TABLES_EXIT_CODE%
