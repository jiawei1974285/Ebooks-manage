@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title EbookHub

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "BACKEND_URL=http://127.0.0.1:8000"
set "FRONTEND_URL=http://localhost:5173"

echo.
echo ======================================
echo   EbookHub  一键启动
echo ======================================
echo.

REM ---- 依赖自检 ----
where python >nul 2>nul || (echo [错误] 未找到 python，请先安装 Python 3.10+ 并加入 PATH & pause & exit /b 1)
where node   >nul 2>nul || (echo [错误] 未找到 node，请先安装 Node.js 18+ 并加入 PATH & pause & exit /b 1)
where npm    >nul 2>nul || (echo [错误] 未找到 npm & pause & exit /b 1)

if not exist "%FRONTEND%\node_modules" (
    echo [前端] 未检测到 node_modules，正在安装依赖...
    pushd "%FRONTEND%"
    call npm install || (echo npm install 失败 & popd & pause & exit /b 1)
    popd
)

python -c "import uvicorn, fastapi" >nul 2>nul
if errorlevel 1 (
    echo [后端] 未检测到 uvicorn/fastapi，正在安装依赖...
    pushd "%BACKEND%"
    python -m pip install -r requirements.txt || (echo pip install 失败 & popd & pause & exit /b 1)
    popd
)

REM ---- 启动后端 ----
echo [后端] 启动 uvicorn (127.0.0.1:8000)...
start "EbookHub Backend" cmd /k "cd /d %BACKEND% && python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

REM ---- 轮询后端就绪 ----
echo [后端] 等待服务就绪...
set /a TRIES=0
:waitbackend
set /a TRIES+=1
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%BACKEND_URL%/docs' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto backendready
if %TRIES% GEQ 60 (
    echo [警告] 后端 60 秒内未就绪，继续启动前端；请检查后端窗口日志
    goto backendready
)
timeout /t 1 /nobreak >nul
goto waitbackend

:backendready
echo [后端] 就绪
echo.

REM ---- 启动前端 ----
echo [前端] 启动 vite (5173)...
start "EbookHub Frontend" cmd /k "cd /d %FRONTEND% && npm run dev"

REM ---- 轮询前端就绪 ----
echo [前端] 等待服务就绪...
set /a TRIES=0
:waitfrontend
set /a TRIES+=1
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%FRONTEND_URL%' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto frontendready
if %TRIES% GEQ 30 (
    echo [警告] 前端 30 秒内未就绪，仍尝试打开浏览器
    goto frontendready
)
timeout /t 1 /nobreak >nul
goto waitfrontend

:frontendready
echo [前端] 就绪
echo.
start "" "%FRONTEND_URL%"

echo ======================================
echo   已启动：
echo     后端: %BACKEND_URL%
echo     前端: %FRONTEND_URL%
echo   关闭对应命令行窗口即停止服务；
echo   或运行 stop.bat 一键停止。
echo ======================================
echo.
pause
endlocal
