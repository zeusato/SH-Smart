@echo off
echo ===========================================
echo   SHS Electronic Shell - Build Installer
echo ===========================================
echo.
echo Dang chuyen den thu muc du an...
cd /d "%~dp0"

echo.
echo Dang chuyen doi icon...
call node convert-icon.js

echo.
echo Dang chay lenh 'npm run build'...
echo Vui long cho doi, qua trinh co the mat vai phut...
echo.

call npm run build

if %errorlevel% neq 0 (
    echo.
    echo [LOI] Qua trinh build that bai!
    echo Hay dam bao ban da chay file nay bang cach: 
    echo Chuot phai -> Run as Administrator
    pause
    exit /b %errorlevel%
)

echo.
echo [THANH CONG] File cai dat da duoc tao trong thu muc 'dist'.
pause
