@echo off
echo ==================================================
echo [FahamAcc] Building Clean MySQL Production Package...
echo ==================================================

echo 1. Installing dependencies...
call npm install

echo.
echo 2. Building application bundle...
call npm run build

echo.
echo 3. Cleaning temporary/data files before zipping...
if exist "dist\data" rmdir /s /q "dist\data"
if exist "dist\.env" del /f /q "dist\.env"
if exist "dist\database.json" del /f /q "dist\database.json"
if exist "dist\backups" rmdir /s /q "dist\backups"
if exist "dist\backup" rmdir /s /q "dist\backup"
if not exist "dist\uploads" mkdir "dist\uploads"
if not exist "dist\uploads\.gitkeep" echo # Uploads directory placeholder > "dist\uploads\.gitkeep"
if exist "uploads\.htaccess" copy /y "uploads\.htaccess" "dist\uploads\.htaccess"

echo.
echo 4. Creating 'dist.zip' package...
if exist "dist.zip" del /f /q "dist.zip"
powershell -Command "Compress-Archive -Path 'dist\*' -DestinationPath 'dist.zip' -Force"

echo.
echo ==================================================
echo Success! Clean MySQL Package 'dist.zip' is ready.
echo ==================================================
pause

