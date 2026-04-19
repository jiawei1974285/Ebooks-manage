@echo off
echo 安装依赖...
echo.

echo [1/2] 安装 Python 后端依赖...
cd /d %~dp0backend
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo 后端依赖安装失败，请检查 Python 和 pip 是否正常
    pause
    exit /b 1
)

echo.
echo [2/2] 安装前端依赖...
cd /d %~dp0frontend
npm install
if %errorlevel% neq 0 (
    echo 前端依赖安装失败，请检查 Node.js 和 npm 是否正常
    pause
    exit /b 1
)

echo.
echo ✅ 安装完成！
echo.
echo 请确保 Ollama 已启动，且已拉取以下模型：
echo   ollama pull gemma4
echo   ollama pull nomic-embed-text
echo.
echo 运行 start.bat 启动系统
pause
