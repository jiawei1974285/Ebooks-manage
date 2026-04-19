@echo off
chcp 65001 >nul
title EbookHub - 停止

echo 正在停止 EbookHub ...

REM 按标题关闭 start.bat 开出的两个窗口
taskkill /FI "WINDOWTITLE eq EbookHub Backend*"  /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq EbookHub Frontend*" /T /F >nul 2>nul

REM 兜底：按端口关掉
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>nul

echo 已停止（如窗口仍在请手动关闭）。
timeout /t 2 /nobreak >nul
