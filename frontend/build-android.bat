@echo off
echo ==========================================
echo  HalloFood Android Build Script
echo ==========================================
echo.

REM Step 1: Build web assets
echo [1/4] Building web assets...
call npm run build
if errorlevel 1 (
    echo ERROR: Web build failed!
    pause
    exit /b 1
)
echo.

REM Step 2: Sync to Android project
echo [2/4] Syncing to Android...
call npx cap sync android
if errorlevel 1 (
    echo ERROR: Capacitor sync failed!
    pause
    exit /b 1
)
echo.

REM Step 3: Build debug APK
echo [3/4] Building debug APK...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo ERROR: Gradle build failed!
    cd ..
    pause
    exit /b 1
)
cd ..
echo.

REM Step 4: Show APK location
echo ==========================================
echo  BUILD COMPLETE!
echo  APK location:
echo  android\app\build\outputs\apk\debug\app-debug.apk
echo ==========================================
echo.

REM Optional: Install to connected device
set /p install="Install ke device yang terhubung? (y/n): "
if /i "%install%"=="y" (
    echo.
    echo Installing to device...
    adb install -r android\app\build\outputs\apk\debug\app-debug.apk
    if errorlevel 1 (
        echo ERROR: ADB install failed! Pastikan device terhubung dan USB debugging aktif.
        pause
        exit /b 1
    )
    echo Done! Opening app...
    adb shell am start -n co.id.santosjayaabadi.hallofood/.MainActivity
)
echo.
pause
