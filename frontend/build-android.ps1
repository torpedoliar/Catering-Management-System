# HalloFood Android Build Script (PowerShell)
# Usage:
#   .\build-android.ps1              # Build APK only
#   .\build-android.ps1 -Install     # Build + install to device
#   .\build-android.ps1 -Open        # Build + open Android Studio
#   .\build-android.ps1 -SyncOnly    # Web build + sync only (no APK)

param(
    [switch]$Install,    # Auto-install ke device setelah build
    [switch]$Open,       # Buka Android Studio setelah sync
    [switch]$SyncOnly    # Hanya build web + sync, tanpa Gradle build
)

$ErrorActionPreference = "Stop"
$apkPath = "android\app\build\outputs\apk\debug\app-debug.apk"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  HalloFood Android Build Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build web
Write-Host "[1/4] Building web assets..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { throw "Web build failed!" }
Write-Host "  Web build complete." -ForegroundColor Green
Write-Host ""

# Step 2: Sync
Write-Host "[2/4] Syncing to Android..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "Capacitor sync failed!" }
Write-Host "  Sync complete." -ForegroundColor Green
Write-Host ""

# Open Android Studio if requested
if ($Open) {
    Write-Host "Opening Android Studio..." -ForegroundColor Green
    npx cap open android
    exit 0
}

# Stop here if SyncOnly
if ($SyncOnly) {
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  SYNC COMPLETE!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    exit 0
}

# Step 3: Build APK
Write-Host "[3/4] Building debug APK..." -ForegroundColor Yellow
Push-Location android
.\gradlew.bat assembleDebug
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "Gradle build failed!"
}
Pop-Location
Write-Host "  APK build complete." -ForegroundColor Green
Write-Host ""

# Step 4: Result
$apkFile = Get-Item $apkPath -ErrorAction SilentlyContinue
if ($apkFile) {
    $sizeMB = [math]::Round($apkFile.Length / 1MB, 2)
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  BUILD SUCCESS!" -ForegroundColor Green
    Write-Host "  APK: $apkPath" -ForegroundColor White
    Write-Host "  Size: $sizeMB MB" -ForegroundColor White
    Write-Host "==========================================" -ForegroundColor Green
} else {
    throw "APK not found at $apkPath"
}

# Optional: Install
if ($Install) {
    Write-Host ""
    Write-Host "[4/4] Installing to device..." -ForegroundColor Yellow
    adb install -r $apkPath
    if ($LASTEXITCODE -ne 0) {
        throw "ADB install failed! Pastikan device terhubung dan USB debugging aktif."
    }
    Write-Host "  Opening app..." -ForegroundColor Green
    adb shell am start -n co.id.santosjayaabadi.hallofood/.MainActivity
    Write-Host "  App launched!" -ForegroundColor Green
}

Write-Host ""
