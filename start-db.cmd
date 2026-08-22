@echo off
REM Starts the local PostgreSQL server for EG Digital (port 5432).
REM Run this after a reboot before starting the backend.
set "BASE=%~dp0.localdb"
"%BASE%\pgsql\bin\pg_ctl.exe" -D "%BASE%\data" -o "-p 5432" -l "%BASE%\server.log" start
echo.
echo Local database is running on localhost:5432 (db: egdigital)
