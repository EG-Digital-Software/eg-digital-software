@echo off
REM Stops the local PostgreSQL server for EG Digital.
set "BASE=%~dp0.localdb"
"%BASE%\pgsql\bin\pg_ctl.exe" -D "%BASE%\data" stop
