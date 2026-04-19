@echo off
title EbookHub
echo 启动 EbookHub...
echo.

REM 后端（新窗口）
start "EbookHub Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

REM 等待后端就绪
timeout /t 3 /nobreak >nul

REM 前端（新窗口）
start "EbookHub Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

REM 等前端起来再开浏览器
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo 已启动：
echo   - 后端: http://127.0.0.1:8000
echo   - 前端: http://localhost:5173
echo.
echo 关闭对应窗口可停止服务。
pause
