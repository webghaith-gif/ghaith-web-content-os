@echo off
if not exist .env copy .env.example .env >nul
node --env-file=.env dist\src\server.js
pause
