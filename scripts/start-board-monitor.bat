@echo off
REM Startet den Board-Monitor im Chrome-Kiosk-Modus - Vollbild, ohne Browser-
REM Chrome und ohne sichtbare Windows-Taskleiste.
REM
REM Aufruf: start-board-monitor.bat <server-ip:port> <event-id>
REM Beispiel: start-board-monitor.bat 192.168.1.10:5173 0f1d3f7a-f738-4496-8cec-9faa37c2577a

if "%~1"=="" goto usage
if "%~2"=="" goto usage

set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

start "" %CHROME% --kiosk --new-window "http://%~1/?boardmonitor=%~2"
goto :eof

:usage
echo Aufruf: %~n0 ^<server-ip:port^> ^<event-id^>
echo Beispiel: %~n0 192.168.1.10:5173 0f1d3f7a-f738-4496-8cec-9faa37c2577a
